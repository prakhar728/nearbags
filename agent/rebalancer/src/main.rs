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
mod check;

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
const BUILD: &str = "rebalancer-signer-1";
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
    let checked = check_leg(&leg, &status, now_secs()?)?;

    let (_, public_key) = identity()?;
    let sig = keys::sign(KEY, None, leg.payload.as_bytes())?;
    if sig.len() != 64 {
        return Err(format!("expected a 64-byte signature, got {}", sig.len()));
    }
    Ok(json!({
        "signed": {
            "standard": "raw_ed25519",
            "payload": leg.payload,
            "public_key": public_key,
            "signature": format!("ed25519:{}", bs58::encode(&sig).into_string()),
        },
        // On-chain runs return at most 900 bytes, so only the leg's size rides along with the signature.
        "usd": checked.usd,
    }))
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
