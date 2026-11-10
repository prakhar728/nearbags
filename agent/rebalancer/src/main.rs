//! Stonkbag rebalancer: the signer.
//!
//! Holds an ed25519 key that OutLayer derives inside its TEE, bound to this exact build (`bind: "wasm"`) and to the
//! caller. A basket holder who opts in adds that key to their basket's NEAR Intents account. From then on this module
//! can sign that account's swap legs, and nothing else:
//!
//! - The payload must be exactly one `transfer` from the basket account to a 1Click deposit address.
//! - The module looks the deposit address up at 1Click itself and checks the quote behind it: the swap's output and
//!   any refund both go back to the same basket account, inside NEAR Intents; it sells exactly the token and amount
//!   the payload sends; both assets are on the basket's list; the quote is still waiting for its deposit; slippage and
//!   size are within the caps below.
//! - So a signature can only turn the account's tokens into other tokens in the same account. It cannot send funds
//!   anywhere else, add or remove keys, or sign anything other than these payloads.
//!
//! What to sign is decided from the input and 1Click's answer alone, never from secrets or configuration (OutLayer's
//! rule for `bind: "wasm"` keys). The weights themselves come from the separate `strategist` module.
//!
//! Input (stdin, JSON):
//!   {"op": "whoami"}
//!   {"op": "sign_leg", "account_id": "<64 hex>", "deposit_address": "<64 hex>", "payload": "<1Click generate-intent payload>",
//!    "assets": ["nep141:…", …], "max_usd": 100}
//!   {"op": "sign_rhea_leg", "account_id": "<64 hex>", "payload": "<one ft_withdraw to Rhea DCL>", "assets": […], "max_usd": 100}
//!
//! Signer 2 adds: an app-fee cap and a reference-price check on 1Click legs (src/check.rs), Rhea DCL legs checked
//! against a fresh on-chain quote and a fixed pool list (src/rhea.rs), and a daily swap limit per account enforced by
//! intents.near's single-use nonces (src/daily.rs). The signed payload carries the signer's nonce, not the input's.
mod check;
mod daily;
mod rhea;

use check::{check_leg, LegInput, QuoteStatus};
use serde_json::{json, Value};
use std::io::Read;
use std::time::Duration;

#[cfg(target_arch = "wasm32")]
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] = *include_bytes!("../manifest.json");

mod bindings {
    wit_bindgen::generate!({ world: "signing-keys-host", path: "wit" });
}
use bindings::outlayer::signing_keys::api as keys;

const KEY: &str = "agent";
const BUILD: &str = "rebalancer-signer-2";
const RPC: &str = "https://rpc.mainnet.near.org";
const ONECLICK_STATUS: &str = "https://1click.chaindefuser.com/v0/status?depositAddress=";

fn main() {
    let mut buf = String::new();
    let _ = std::io::stdin().read_to_string(&mut buf);
    let out = match serde_json::from_str::<Value>(&buf).map_err(|e| format!("input is not JSON: {e}")).and_then(|v| run(&v)) {
        Ok(v) => json!({ "success": true, "result": v }),
        Err(e) => json!({ "success": false, "error": e }),
    };
    println!("{out}");
}

fn run(input: &Value) -> Result<Value, String> {
    match input.get("op").and_then(Value::as_str).ok_or("missing string field \"op\"")? {
        "whoami" => {
            let (account_id, public_key) = identity()?;
            Ok(json!({ "account_id": account_id, "public_key": public_key, "build": BUILD }))
        }
        "sign_leg" => sign_leg(input),
        "sign_rhea_leg" => sign_rhea_leg(input),
        other => Err(format!("unknown op {other:?}")),
    }
}

fn identity() -> Result<(String, String), String> {
    let pk = keys::public_key(KEY, None)?;
    if pk.len() != 32 {
        return Err(format!("expected a 32-byte ed25519 key, got {}", pk.len()));
    }
    Ok((hex::encode(&pk), format!("ed25519:{}", bs58::encode(&pk).into_string())))
}

fn sign_leg(input: &Value) -> Result<Value, String> {
    let leg: LegInput = serde_json::from_value(input.clone()).map_err(|e| format!("bad sign_leg input: {e}"))?;
    let status = fetch_status(&leg.deposit_address)?;
    let now = now_secs()?;
    let checked = check_leg(&leg, &status, now)?;
    sign_today(&leg.account_id, &leg.payload, now, checked.usd)
}

fn sign_rhea_leg(input: &Value) -> Result<Value, String> {
    let leg: rhea::RheaInput = serde_json::from_value(input.clone()).map_err(|e| format!("bad sign_rhea_leg input: {e}"))?;
    if !rhea::account_ok(&leg.account_id) {
        return Err("account_id must be a basket account (64-character hex)".into());
    }
    let now = now_secs()?;
    let swap = rhea::parse(&leg, now)?;
    let quoted: Value = view(rhea::DCL, "quote", &rhea::quote_args(&swap))?;
    let amount: u128 = quoted.get("amount").and_then(Value::as_str).and_then(|a| a.parse().ok()).ok_or("Rhea's quote was not readable")?;
    let usd = rhea::against_quote(&swap, amount, leg.max_usd)?;
    sign_today(&leg.account_id, &leg.payload, now, usd)
}

/// Put today's first unused nonce in the payload and sign it. Refuses once the account's daily limit is used up.
fn sign_today(account_id: &str, payload: &str, now: u64, usd: f64) -> Result<Value, String> {
    let day = now / 86_400;
    let mut nonce = None;
    for k in 0..daily::MAX_SWAPS_PER_DAY {
        let n = daily::nonce(account_id, day, k);
        let used: bool = view("intents.near", "is_nonce_used", &json!({ "account_id": account_id, "nonce": n }))?;
        if !used {
            nonce = Some(n);
            break;
        }
    }
    let nonce = nonce.ok_or(format!("this account already made {} agent swaps today", daily::MAX_SWAPS_PER_DAY))?;
    let payload = daily::with_nonce(payload, &nonce)?;

    let (_, public_key) = identity()?;
    let sig = keys::sign(KEY, None, payload.as_bytes())?;
    if sig.len() != 64 {
        return Err(format!("expected a 64-byte signature, got {}", sig.len()));
    }
    Ok(json!({
        "signed": {
            "standard": "raw_ed25519",
            "payload": payload,
            "public_key": public_key,
            "signature": format!("ed25519:{}", bs58::encode(&sig).into_string()),
        },
        // On-chain runs return at most 900 bytes, so only the leg's size rides along with the signature.
        "usd": usd,
    }))
}

/// A NEAR view call, read from public RPC.
fn view<T: serde::de::DeserializeOwned>(contract: &str, method: &str, args: &Value) -> Result<T, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let body = json!({ "jsonrpc": "2.0", "id": 1, "method": "query", "params": {
        "request_type": "call_function", "finality": "final", "account_id": contract, "method_name": method,
        "args_base64": STANDARD.encode(args.to_string()) } });
    let res = wasi_http_client::Client::new()
        .post(RPC)
        .header("Content-Type", "application/json")
        .connect_timeout(Duration::from_secs(15))
        .body(body.to_string().as_bytes())
        .send()
        .map_err(|e| format!("NEAR RPC request failed: {e:?}"))?;
    let bytes = res.body().map_err(|e| format!("NEAR RPC body: {e:?}"))?;
    let v: Value = serde_json::from_slice(&bytes).map_err(|_| "NEAR RPC answer was not JSON")?;
    let raw: Vec<u8> = v
        .pointer("/result/result")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{contract}.{method} failed"))?
        .iter()
        .map(|b| b.as_u64().and_then(|x| u8::try_from(x).ok()).ok_or("bad byte"))
        .collect::<Result<_, _>>()?;
    serde_json::from_slice(&raw).map_err(|_| format!("{contract}.{method} returned something unexpected"))
}

fn fetch_status(deposit_address: &str) -> Result<QuoteStatus, String> {
    if !check::is_hex64(deposit_address) {
        return Err("deposit_address must be a 64-character hex account".into());
    }
    let res = wasi_http_client::Client::new()
        .get(&format!("{ONECLICK_STATUS}{deposit_address}"))
        .header("Accept", "application/json")
        .connect_timeout(Duration::from_secs(15))
        .send()
        .map_err(|e| format!("1Click status request failed: {e:?}"))?;
    let code = res.status();
    let body = res.body().map_err(|e| format!("1Click status body: {e:?}"))?;
    if !(200..300).contains(&code) {
        return Err(format!("1Click status answered {code}"));
    }
    serde_json::from_slice(&body).map_err(|e| format!("1Click status was not the expected shape: {e}"))
}

fn now_secs() -> Result<u64, String> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|_| "the clock is before 1970".into())
}
