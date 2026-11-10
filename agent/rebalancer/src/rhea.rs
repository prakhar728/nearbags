//! Rhea DCL legs: a swap made from inside intents.near with one `ft_withdraw` to Rhea's DCL contract, whose output
//! Rhea sends straight back into the same basket account (`client_echo`). Pure checks here; main.rs asks the DCL
//! contract for a fresh quote and passes it in. Unit-tested on the host.
use crate::check::{envelope, is_hex64};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DCL: &str = "dclv2.ref-labs.near";
pub const USDC: &str = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
/// The only pools the agent may route through. Adding a pool means a new build (and a new agent key).
pub const POOLS: [&str; 6] = [
    "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near|100",
    "hoot-8ecf65.launchpad.justhoot.near|wrap.near|10000",
    "nearly-993927.nearlytrade.near|wrap.near|10000",
    "imeme-2.v2-launchpad.justhoot.near|wrap.near|10000",
    "batman-4.nearlytrade.near|wrap.near|10000",
    "singularty.nearlytrade.near|wrap.near|10000",
];
/// nearly.trade launch taxes, fixed in each token at launch (no setter): (token, sell bps). A sell's pool input is the
/// amount less this tax, so that is what gets quoted.
pub const SELL_TAX_BPS: [(&str, u128); 2] = [("batman-4.nearlytrade.near", 100), ("singularty.nearlytrade.near", 100)];

/// The amount the pool actually swaps for this input (after any sell tax the token takes on the way in).
pub fn pool_input(token_in: &str, amount: u128) -> u128 {
    let tax = SELL_TAX_BPS.iter().find(|(t, _)| *t == token_in).map_or(0, |(_, b)| *b);
    amount * (10_000 - tax) / 10_000
}
const MAX_GAS: u64 = 200_000_000_000_000;

#[derive(Deserialize)]
pub struct RheaInput {
    pub account_id: String,
    pub payload: String,
    pub assets: Vec<String>,
    #[serde(default)]
    pub max_usd: Option<f64>,
}

/// What the payload asks Rhea to do.
#[derive(Debug, PartialEq, Serialize)]
pub struct Swap {
    pub token_in: String,
    pub token_out: String,
    pub amount_in: u128,
    pub min_out: u128,
    pub pool_ids: Vec<String>,
}

fn amount(v: Option<&Value>) -> Option<u128> {
    let s = v?.as_str()?;
    (!s.is_empty() && s.len() <= 39 && s.bytes().all(|b| b.is_ascii_digit()) && !s.starts_with('0')).then(|| s.parse().ok())?
}

/// The payload's rules. Returns the swap for main.rs to quote.
pub fn parse(leg: &RheaInput, now: u64) -> Result<Swap, String> {
    let io = envelope(&leg.account_id, &leg.assets, &leg.payload, now)?;
    for k in io.keys() {
        if !["intent", "token", "receiver_id", "amount", "msg", "min_gas"].contains(&k.as_str()) {
            return Err(format!("intent has an unexpected field {k:?}"));
        }
    }
    if io.get("intent").and_then(Value::as_str) != Some("ft_withdraw") {
        return Err("a Rhea leg must be an ft_withdraw".into());
    }
    if io.get("receiver_id").and_then(Value::as_str) != Some(DCL) {
        return Err("the withdrawal does not go to Rhea's DCL contract".into());
    }
    if let Some(g) = io.get("min_gas") {
        let g: u64 = g.as_str().and_then(|x| x.parse().ok()).ok_or("min_gas is not a number")?;
        if g > MAX_GAS {
            return Err("min_gas is too high".into());
        }
    }
    let token_in = io.get("token").and_then(Value::as_str).ok_or("the withdrawal has no token")?.to_string();
    let amount_in = amount(io.get("amount")).ok_or("the withdrawal amount is not a positive whole number")?;

    let msg: Value = serde_json::from_str(io.get("msg").and_then(Value::as_str).ok_or("the withdrawal has no swap message")?).map_err(|_| "the swap message is not JSON")?;
    let mo = msg.as_object().filter(|m| m.len() == 1).and_then(|m| m.get("Swap")).and_then(Value::as_object).ok_or("the message must be exactly one Swap")?;
    for k in mo.keys() {
        if !["pool_ids", "output_token", "min_output_amount", "skip_unwrap_near", "client_echo"].contains(&k.as_str()) {
            return Err(format!("the swap has an unexpected field {k:?}"));
        }
    }
    if mo.get("client_echo").and_then(Value::as_str) != Some(leg.account_id.as_str()) {
        return Err("the swap output does not go back to the basket account".into());
    }
    if mo.get("skip_unwrap_near").and_then(Value::as_bool) != Some(true) {
        return Err("the swap must keep wNEAR wrapped".into());
    }
    let token_out = mo.get("output_token").and_then(Value::as_str).ok_or("the swap has no output token")?.to_string();
    let min_out = amount(mo.get("min_output_amount")).ok_or("the swap has no minimum output")?;
    let pool_ids: Vec<String> = mo
        .get("pool_ids")
        .and_then(Value::as_array)
        .ok_or("the swap has no pools")?
        .iter()
        .map(|p| p.as_str().map(str::to_string).ok_or("a pool id is not a string"))
        .collect::<Result<_, _>>()?;
    if pool_ids.is_empty() || pool_ids.len() > 3 || !pool_ids.iter().all(|p| POOLS.contains(&p.as_str())) {
        return Err("the swap uses a pool that isn't allowed".into());
    }
    if token_in == token_out {
        return Err("the swap trades a token for itself".into());
    }
    for t in [&token_in, &token_out] {
        if !leg.assets.contains(&format!("nep141:{t}")) {
            return Err("the swap touches an asset that is not in this basket".into());
        }
    }
    if token_in != USDC && token_out != USDC {
        return Err("a Rhea leg must buy or sell for USDC".into());
    }
    Ok(Swap { token_in, token_out, amount_in, min_out, pool_ids })
}

/// Compare with a fresh DCL quote for the same input: at most 3% below it, never above it (it would just fail), and
/// within the size cap (valued on the USDC side). Returns the leg's dollar size.
pub fn against_quote(s: &Swap, quoted: u128, max_usd: Option<f64>) -> Result<f64, String> {
    if quoted == 0 {
        return Err("Rhea quotes nothing for this swap".into());
    }
    if s.min_out.saturating_mul(10_000) < quoted.saturating_mul(crate::check::MIN_OUT_BPS) {
        return Err("the swap allows more than 3% below Rhea's quote".into());
    }
    if s.min_out > quoted {
        return Err("the swap asks for more than Rhea quotes".into());
    }
    let usd = if s.token_in == USDC { s.amount_in } else { quoted } as f64 / 1e6;
    let cap = max_usd.filter(|m| m.is_finite() && *m > 0.0).map_or(crate::check::HARD_MAX_USD, |m| m.min(crate::check::HARD_MAX_USD));
    if usd > cap {
        return Err(format!("the leg is worth ${usd:.2}, over the ${cap:.0} cap"));
    }
    Ok(usd)
}

pub fn quote_args(s: &Swap) -> Value {
    serde_json::json!({ "pool_ids": s.pool_ids, "input_token": s.token_in, "output_token": s.token_out, "input_amount": pool_input(&s.token_in, s.amount_in).to_string(), "tag": null })
}

pub fn account_ok(a: &str) -> bool {
    is_hex64(a)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACC: &str = "acf00dbdd61d9b9833dc26e4d2d75201d2dc3ff5104532a03687700705b1bf70";
    const NEARLY: &str = "nearly-993927.nearlytrade.near";
    const NOW: u64 = 1_794_312_000;

    fn payload(intent: &str) -> String {
        format!(r#"{{"verifying_contract":"intents.near","signer_id":"{ACC}","deadline":"2026-11-10T12:30:00.000Z","nonce":"Vij2xgAlKBKzAAJ1fyKb5xgJZFShm5Tevf8NPU4gMz8=","intents":[{intent}]}}"#)
    }
    fn buy(echo: &str, pools: &str, extra: &str) -> String {
        let msg = format!(r#"{{"Swap":{{"pool_ids":{pools},"output_token":"{NEARLY}","min_output_amount":"15000000000000000000000","skip_unwrap_near":true,"client_echo":"{echo}"{extra}}}}}"#);
        payload(&format!(r#"{{"intent":"ft_withdraw","token":"{USDC}","receiver_id":"{DCL}","amount":"10000000","msg":{},"min_gas":"150000000000000"}}"#, serde_json::to_string(&msg).unwrap()))
    }
    const PATH: &str = r#"["17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near|100","nearly-993927.nearlytrade.near|wrap.near|10000"]"#;
    fn leg(p: String) -> RheaInput {
        RheaInput { account_id: ACC.into(), payload: p, assets: vec![format!("nep141:{USDC}"), format!("nep141:{NEARLY}")], max_usd: Some(100.0) }
    }

    #[test]
    fn accepts_a_real_shaped_buy() {
        let s = parse(&leg(buy(ACC, PATH, "")), NOW).unwrap();
        assert_eq!(s.amount_in, 10_000_000);
        assert_eq!(s.token_out, NEARLY);
        // Quote 15,388 NEARLY (real, 2026-11-11): 15,000 minimum is 2.5% under.
        assert_eq!(against_quote(&s, 15_388_219_170_858_840_479_528, Some(100.0)).unwrap(), 10.0);
        assert!(against_quote(&s, 16_000_000_000_000_000_000_000, Some(100.0)).is_err()); // > 3% below
        assert!(against_quote(&s, 14_000_000_000_000_000_000_000, Some(100.0)).is_err()); // asks for more than quoted
        assert!(against_quote(&s, 15_388_219_170_858_840_479_528, Some(5.0)).is_err()); // over cap
    }

    fn refused(p: String, why: &str) {
        let e = parse(&leg(p), NOW).unwrap_err();
        assert!(e.contains(why), "expected {why:?}, got {e:?}");
    }

    #[test]
    fn refuses_output_elsewhere_or_bad_pools() {
        refused(buy("attacker.near", PATH, ""), "does not go back");
        refused(buy(ACC, r#"["evil.near|wrap.near|100"]"#, ""), "pool");
        refused(buy(ACC, PATH, r#","extra":1"#), "unexpected field");
        refused(buy(ACC, PATH, "").replace(DCL, "attacker.near"), "DCL");
        refused(buy(ACC, PATH, "").replace("ft_withdraw", "transfer"), "ft_withdraw");
        refused(buy(ACC, PATH, "").replace("150000000000000", "900000000000000"), "min_gas");
    }

    #[test]
    fn quotes_a_tax_token_sell_after_its_tax() {
        assert_eq!(pool_input("batman-4.nearlytrade.near", 1_000_000), 990_000);
        assert_eq!(pool_input(NEARLY, 1_000_000), 1_000_000);
        assert!(POOLS.contains(&"singularty.nearlytrade.near|wrap.near|10000"));
    }

    #[test]
    fn refuses_assets_outside_the_basket() {
        let mut l = leg(buy(ACC, PATH, ""));
        l.assets = vec![format!("nep141:{USDC}")];
        assert!(parse(&l, NOW).unwrap_err().contains("not in this basket"));
    }
}
