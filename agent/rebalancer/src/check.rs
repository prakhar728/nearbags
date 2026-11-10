//! The rules a swap leg must pass before the agent signs it. Pure code: no I/O, unit-tested on the host.
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The most a single leg may be worth, whatever the input asks. The input's `max_usd` can only lower it.
pub const HARD_MAX_USD: f64 = 250.0;
/// The most a quote may give away to slippage: minAmountOut must be at least this share of amountOut (in bps).
pub const MIN_OUT_BPS: u128 = 9_700;
/// Payloads must expire within this long (1Click's generate-intent uses 3 days).
pub const MAX_DEADLINE_SECS: u64 = 4 * 24 * 3600;
pub const MAX_ASSETS: usize = 11; // up to 10 basket assets plus USDC
/// Most a quote may pay out in app fees, all recipients together (bps). 1Click itself takes 20.
pub const MAX_APP_FEE_BPS: u64 = 30;

#[derive(Deserialize)]
pub struct LegInput {
    pub account_id: String,
    pub deposit_address: String,
    pub payload: String,
    pub assets: Vec<String>,
    #[serde(default)]
    pub max_usd: Option<f64>,
}

/// The parts of 1Click's GET /v0/status answer that the checks read.
#[derive(Deserialize, Debug, Clone)]
pub struct QuoteStatus {
    pub status: String,
    #[serde(rename = "quoteResponse")]
    pub quote_response: QuoteResponse,
}
#[derive(Deserialize, Debug, Clone)]
pub struct QuoteResponse {
    #[serde(rename = "quoteRequest")]
    pub request: QuoteRequest,
    pub quote: Quote,
}
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuoteRequest {
    pub dry: bool,
    pub swap_type: String,
    pub origin_asset: String,
    pub deposit_type: String,
    pub destination_asset: String,
    pub amount: String,
    pub refund_to: String,
    pub refund_type: String,
    pub recipient: String,
    pub recipient_type: String,
    /// Fees the quote pays out. 1Click adds its own 20 bps; the total is capped (MAX_APP_FEE_BPS).
    #[serde(default)]
    pub app_fees: Option<Value>,
}
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub deposit_address: String,
    pub amount_in: String,
    pub amount_out: String,
    pub min_amount_out: String,
    pub amount_in_usd: String,
    #[serde(default)]
    pub amount_out_usd: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Checked {
    pub sell: String,
    pub buy: String,
    pub amount_in: String,
    pub min_amount_out: String,
    pub usd: f64,
}

pub fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn is_asset_id(s: &str) -> bool {
    (s.starts_with("nep141:") || s.starts_with("nep245:")) && s.len() <= 200 && !s.contains(char::is_whitespace)
}

fn is_amount(s: &str) -> bool {
    !s.is_empty() && s.len() <= 39 && s.bytes().all(|b| b.is_ascii_digit()) && !s.starts_with('0')
}

/// Seconds since 1970 for "YYYY-MM-DDTHH:MM:SS[.fff]Z".
pub fn parse_iso(s: &str) -> Option<u64> {
    let b = s.as_bytes();
    if b.len() < 20 || !s.ends_with('Z') || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let n = |a: usize, z: usize| s.get(a..z)?.parse::<i64>().ok();
    let (y, m, d, hh, mm, ss) = (n(0, 4)?, n(5, 7)?, n(8, 10)?, n(11, 13)?, n(14, 16)?, n(17, 19)?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) || hh > 23 || mm > 59 || ss > 60 {
        return None;
    }
    // Days from civil (Howard Hinnant).
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    u64::try_from(days * 86_400 + hh * 3600 + mm * 60 + ss).ok()
}

/// The payload's envelope: for intents.near, signed by the basket account, a sane deadline and nonce, and exactly one
/// intent, whose object is returned. Shared by 1Click and Rhea legs.
pub fn envelope(account_id: &str, assets: &[String], payload: &str, now: u64) -> Result<serde_json::Map<String, Value>, String> {
    if !is_hex64(account_id) {
        return Err("account_id must be a basket account (64-character hex)".into());
    }
    if assets.is_empty() || assets.len() > MAX_ASSETS || !assets.iter().all(|a| is_asset_id(a)) {
        return Err(format!("assets must be 1 to {MAX_ASSETS} NEAR Intents asset ids"));
    }
    let p: Value = serde_json::from_str(payload).map_err(|_| "payload is not JSON")?;
    let o = p.as_object().ok_or("payload is not an object")?;
    for k in o.keys() {
        if !["verifying_contract", "signer_id", "deadline", "nonce", "intents"].contains(&k.as_str()) {
            return Err(format!("payload has an unexpected field {k:?}"));
        }
    }
    if o.get("verifying_contract").and_then(Value::as_str) != Some("intents.near") {
        return Err("payload is not for intents.near".into());
    }
    if o.get("signer_id").and_then(Value::as_str) != Some(account_id) {
        return Err("payload signer is not the basket account".into());
    }
    let deadline = o.get("deadline").and_then(Value::as_str).and_then(parse_iso).ok_or("payload deadline is missing or malformed")?;
    if deadline <= now || deadline > now + MAX_DEADLINE_SECS {
        return Err("payload deadline is in the past or too far out".into());
    }
    if !o.get("nonce").and_then(Value::as_str).is_some_and(|n| n.len() == 44) {
        return Err("payload nonce is not 32 bytes of base64".into());
    }
    let intents = o.get("intents").and_then(Value::as_array).ok_or("payload has no intents")?;
    let [intent] = intents.as_slice() else {
        return Err("payload must hold exactly one intent".into());
    };
    intent.as_object().cloned().ok_or_else(|| "intent is not an object".to_string())
}

/// All the rules for a 1Click leg. Returns what was checked, for the run's output; any failure is a refusal with the reason.
pub fn check_leg(leg: &LegInput, st: &QuoteStatus, now: u64) -> Result<Checked, String> {
    if !is_hex64(&leg.deposit_address) || leg.deposit_address == leg.account_id {
        return Err("deposit_address must be a 1Click deposit account".into());
    }
    // The payload: exactly the shape 1Click's generate-intent makes, and nothing more.
    let io = envelope(&leg.account_id, &leg.assets, &leg.payload, now)?;
    for k in io.keys() {
        if !["intent", "receiver_id", "tokens"].contains(&k.as_str()) {
            return Err(format!("intent has an unexpected field {k:?}"));
        }
    }
    if io.get("intent").and_then(Value::as_str) != Some("transfer") {
        return Err("the intent must be a transfer".into());
    }
    if io.get("receiver_id").and_then(Value::as_str) != Some(leg.deposit_address.as_str()) {
        return Err("the transfer does not go to the deposit address".into());
    }
    let tokens = io.get("tokens").and_then(Value::as_object).ok_or("the transfer has no tokens")?;
    let [(token, amount)] = tokens.iter().collect::<Vec<_>>()[..] else {
        return Err("the transfer must move exactly one token".into());
    };
    let amount = amount.as_str().filter(|a| is_amount(a)).ok_or("the transfer amount is not a positive whole number")?;

    // The quote behind the deposit address, as 1Click reports it.
    let r = &st.quote_response.request;
    let q = &st.quote_response.quote;
    let fee_bps: Option<u64> = match &r.app_fees {
        None | Some(Value::Null) => Some(0),
        Some(Value::Array(a)) => a.iter().map(|f| f.get("fee").and_then(Value::as_u64)).sum(),
        _ => None,
    };
    let no_fees = fee_bps.is_some_and(|b| b <= MAX_APP_FEE_BPS);
    let fails: [(bool, &str); 13] = [
        (no_fees, "the quote pays more than 0.3% in app fees"),
        (st.status == "PENDING_DEPOSIT", "the quote is not waiting for its deposit"),
        (!r.dry, "the quote is a dry run"),
        (r.swap_type == "EXACT_INPUT", "the quote is not an exact-input swap"),
        (q.deposit_address == leg.deposit_address, "1Click's quote is for another deposit address"),
        (r.deposit_type == "INTENTS", "the quote is not paid from NEAR Intents"),
        (r.recipient == leg.account_id && r.recipient_type == "INTENTS", "the swap output does not go back to the basket account"),
        (r.refund_to == leg.account_id && r.refund_type == "INTENTS", "a refund would not go back to the basket account"),
        (r.origin_asset == *token, "the quote sells a different token than the transfer sends"),
        (r.amount == amount && q.amount_in == amount, "the quote is for a different amount than the transfer sends"),
        (r.origin_asset != r.destination_asset, "the quote swaps a token for itself"),
        (leg.assets.contains(&r.origin_asset) && leg.assets.contains(&r.destination_asset), "the swap touches an asset that is not in this basket"),
        (is_amount(&q.amount_out) && is_amount(&q.min_amount_out), "the quote has no output amounts"),
    ];
    if let Some((_, why)) = fails.iter().find(|(ok, _)| !ok) {
        return Err((*why).into());
    }
    let out: u128 = q.amount_out.parse().map_err(|_| "amountOut is too large")?;
    let min_out: u128 = q.min_amount_out.parse().map_err(|_| "minAmountOut is too large")?;
    if min_out.saturating_mul(10_000) < out.saturating_mul(MIN_OUT_BPS) {
        return Err("the quote allows more than 3% slippage".into());
    }
    let usd: f64 = q.amount_in_usd.parse().map_err(|_| "amountInUsd is not a number")?;
    let cap = leg.max_usd.filter(|m| m.is_finite() && *m > 0.0).map_or(HARD_MAX_USD, |m| m.min(HARD_MAX_USD));
    if !(usd.is_finite() && usd >= 0.0 && usd <= cap) {
        return Err(format!("the leg is worth ${usd:.2}, over the ${cap:.0} cap"));
    }
    // Reference price: 1Click's own dollar values for both sides. A swap that hands over more than 3% of its value is
    // refused, whatever the server says the market is.
    let out_usd: f64 = q.amount_out_usd.as_deref().and_then(|v| v.parse().ok()).ok_or("the quote has no dollar value for its output")?;
    if usd >= 1.0 && !(out_usd.is_finite() && out_usd * 10_000.0 >= usd * MIN_OUT_BPS as f64) {
        return Err(format!("the swap gives ${out_usd:.2} for ${usd:.2}, more than 3% below its value"));
    }
    Ok(Checked { sell: r.origin_asset.clone(), buy: r.destination_asset.clone(), amount_in: amount.to_string(), min_amount_out: q.min_amount_out.clone(), usd })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACC: &str = "acf00dbdd61d9b9833dc26e4d2d75201d2dc3ff5104532a03687700705b1bf70";
    const DEP: &str = "7491c4478ab745df082d3f68beb91b8601f377734e6866c2db59fbeb5a3451fe";
    const USDC: &str = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
    const WNEAR: &str = "nep141:wrap.near";
    const NOW: u64 = 1_794_312_000; // 2026-11-10T12:00:00Z

    // The real shapes captured from 1Click on 2026-11-10.
    fn payload(receiver: &str, token: &str, amount: &str) -> String {
        format!(
            r#"{{"verifying_contract":"intents.near","signer_id":"{ACC}","deadline":"2026-11-13T12:39:09.000Z","nonce":"Vij2xgAlKBKzAAJ1fyKb5xgJZFShm5Tevf8NPU4gMz8=","intents":[{{"intent":"transfer","receiver_id":"{receiver}","tokens":{{"{token}":"{amount}"}}}}]}}"#
        )
    }
    fn status() -> QuoteStatus {
        serde_json::from_value(serde_json::json!({
            "status": "PENDING_DEPOSIT",
            "quoteResponse": {
                "quoteRequest": { "dry": false, "swapType": "EXACT_INPUT", "originAsset": USDC, "depositType": "INTENTS", "destinationAsset": WNEAR,
                    "amount": "2000000", "refundTo": ACC, "refundType": "INTENTS", "recipient": ACC, "recipientType": "INTENTS" },
                "quote": { "depositAddress": DEP, "amountIn": "2000000", "amountOut": "548421938929726010448171", "minAmountOut": "542937719540428750343689", "amountInUsd": "1.999068000000", "amountOutUsd": "1.98" }
            }
        }))
        .unwrap()
    }
    fn leg() -> LegInput {
        LegInput { account_id: ACC.into(), deposit_address: DEP.into(), payload: payload(DEP, USDC, "2000000"), assets: vec![USDC.into(), WNEAR.into()], max_usd: Some(100.0) }
    }

    #[test]
    fn signs_a_real_leg() {
        let c = check_leg(&leg(), &status(), NOW).unwrap();
        assert_eq!(c.sell, USDC);
        assert_eq!(c.buy, WNEAR);
    }

    #[test]
    fn iso() {
        assert_eq!(parse_iso("2026-11-10T12:00:00.000Z"), Some(NOW));
        assert_eq!(parse_iso("2026-11-10T12:00:00Z"), Some(NOW));
        assert_eq!(parse_iso("2026-13-10T12:00:00Z"), None);
        assert_eq!(parse_iso("nope"), None);
    }

    fn refused(l: LegInput, s: QuoteStatus, why: &str) {
        let e = check_leg(&l, &s, NOW).unwrap_err();
        assert!(e.contains(why), "expected {why:?}, got {e:?}");
    }

    #[test]
    fn refuses_output_to_someone_else() {
        let mut s = status();
        s.quote_response.request.recipient = "attacker.near".into();
        refused(leg(), s, "does not go back");
        let mut s = status();
        s.quote_response.request.recipient_type = "DESTINATION_CHAIN".into();
        refused(leg(), s, "does not go back");
        let mut s = status();
        s.quote_response.request.refund_to = "attacker.near".into();
        refused(leg(), s, "refund");
    }

    #[test]
    fn refuses_a_transfer_elsewhere() {
        let mut l = leg();
        l.payload = payload("attacker.near", USDC, "2000000");
        refused(l, status(), "deposit address");
    }

    #[test]
    fn refuses_amount_or_token_mismatch() {
        let mut l = leg();
        l.payload = payload(DEP, USDC, "9000000");
        refused(l, status(), "different amount");
        let mut l = leg();
        l.payload = payload(DEP, WNEAR, "2000000");
        refused(l, status(), "different token");
    }

    #[test]
    fn refuses_assets_outside_the_basket() {
        let mut l = leg();
        l.assets = vec![USDC.into()];
        refused(l, status(), "not in this basket");
    }

    #[test]
    fn refuses_extra_intents_or_fields() {
        let mut l = leg();
        l.payload = l.payload.replace(r#""intents":[{"#, r#""intents":[{"intent":"add_public_key","public_key":"ed25519:x"},{"#);
        refused(l, status(), "exactly one intent");
        let mut l = leg();
        l.payload = l.payload.replace(r#""tokens""#, r#""memo":"hi","tokens""#);
        refused(l, status(), "unexpected field");
        let mut l = leg();
        l.payload = l.payload.replace(r#""verifying_contract""#, r#""extra":1,"verifying_contract""#);
        refused(l, status(), "unexpected field");
    }

    #[test]
    fn refuses_used_or_dry_quotes_and_bad_deadlines() {
        let mut s = status();
        s.status = "SUCCESS".into();
        refused(leg(), s, "not waiting");
        let mut s = status();
        s.quote_response.request.dry = true;
        refused(leg(), s, "dry run");
        let e = check_leg(&leg(), &status(), NOW + 10 * 86_400).unwrap_err();
        assert!(e.contains("deadline"));
    }

    #[test]
    fn refuses_app_fees_and_bad_prices() {
        let mut s = status();
        // 1Click's own fee, as it appears on every real quote.
        let ours = serde_json::json!({ "recipient": "5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd", "fee": 20, "limitOrderId": null });
        s.quote_response.request.app_fees = Some(serde_json::json!([ours]));
        assert!(check_leg(&leg(), &s, NOW).is_ok());
        let mut s = status();
        s.quote_response.request.app_fees = Some(serde_json::json!([ours, { "recipient": "attacker.near", "fee": 100 }]));
        refused(leg(), s, "app fees");
        let mut s = status();
        s.quote_response.request.app_fees = Some(serde_json::json!([{ "recipient": "x", "fee": "lots" }]));
        refused(leg(), s, "app fees");
        let mut s = status();
        s.quote_response.request.app_fees = Some(serde_json::json!([]));
        assert!(check_leg(&leg(), &s, NOW).is_ok());
        let mut s = status();
        s.quote_response.quote.amount_out_usd = Some("1.80".into());
        refused(leg(), s, "below its value");
        let mut s = status();
        s.quote_response.quote.amount_out_usd = None;
        refused(leg(), s, "no dollar value");
    }

    #[test]
    fn refuses_big_or_slippy_legs() {
        let mut s = status();
        s.quote_response.quote.amount_in_usd = "300".into();
        refused(leg(), s, "over the $100 cap");
        let mut l = leg();
        l.max_usd = Some(10_000.0);
        let mut s = status();
        s.quote_response.quote.amount_in_usd = "300".into();
        refused(l, s, "over the $250 cap");
        let mut s = status();
        s.quote_response.quote.min_amount_out = "1".into();
        refused(leg(), s, "slippage");
    }
}
