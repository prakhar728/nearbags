//! Stonkbag rebalancer, spike 1.
//!
//! Proves one thing: a key that OutLayer derives inside its TEE can sign NEAR Intents payloads that intents.near
//! accepts. It signs for its own implicit account (the hex of its public key), which intents.near already
//! recognises, so nothing has to be registered and no money moves.
//!
//! Rules this module keeps (from OutLayer's signing-key security rules):
//! - It never signs bytes or digests from the input. It composes every payload itself, from fields it has parsed
//!   and checked, in the exact shape the Stonkbag app signs (src/lib/intents/payload.ts).
//! - The key is bound to this exact build (`bind: "wasm"`): a changed build gets a new key.
//! - Tokens and amounts are capped here, in code, whatever the input asks.
//!
//! Input (stdin, JSON):
//!   {"op": "whoami"}
//!   {"op": "sign_transfer", "receiver_id": "...", "token": "nep141:...", "amount": "123", "nonce": "<base64 32 bytes>"}
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Read;

// The manifest goes in the `outlayer.manifest` custom section, covered by the wasm's sha256. OutLayer reads the
// declared keys from it. The section only exists on wasm (the host build rejects the section name).
#[cfg(target_arch = "wasm32")]
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] = *include_bytes!("../manifest.json");

mod bindings {
    wit_bindgen::generate!({ world: "signing-keys-host", path: "wit" });
}
use bindings::outlayer::signing_keys::api as keys;

const KEY: &str = "agent";
const VERIFYING_CONTRACT: &str = "intents.near";
const DEADLINE_SECS: u64 = 5 * 60;
const VERSIONED_NONCE_PREFIX: [u8; 4] = [0x56, 0x28, 0xf6, 0xc6];

/// Tokens this build may move, with the most it may move in one intent (raw units).
const ALLOWED: &[(&str, u128)] = &[
    // USDC on NEAR (6 decimals): at most 1 USDC.
    ("nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", 1_000_000),
    // wNEAR (24 decimals): at most 0.5 NEAR.
    ("nep141:wrap.near", 500_000_000_000_000_000_000_000),
];

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
    match str_field(input, "op")? {
        "whoami" => {
            let (account_id, public_key) = identity()?;
            Ok(json!({ "account_id": account_id, "public_key": public_key, "build": "rebalancer-spike-1" }))
        }
        "sign_transfer" => sign_transfer(input),
        other => Err(format!("unknown op {other:?}")),
    }
}

/// The key's implicit account (hex of the public key) and its NEAR-style public key.
fn identity() -> Result<(String, String), String> {
    let pk = keys::public_key(KEY, None)?;
    if pk.len() != 32 {
        return Err(format!("expected a 32-byte ed25519 key, got {}", pk.len()));
    }
    Ok((hex::encode(&pk), format!("ed25519:{}", bs58::encode(&pk).into_string())))
}

#[derive(Serialize)]
struct Transfer<'a> {
    intent: &'static str,
    receiver_id: &'a str,
    tokens: serde_json::Map<String, Value>,
    memo: &'static str,
}

// Field order matches buildPayload in the app.
#[derive(Serialize)]
struct Payload<'a> {
    signer_id: &'a str,
    verifying_contract: &'static str,
    deadline: String,
    nonce: &'a str,
    intents: Vec<Transfer<'a>>,
}

fn sign_transfer(input: &Value) -> Result<Value, String> {
    let receiver_id = str_field(input, "receiver_id")?;
    let token = str_field(input, "token")?;
    let amount = str_field(input, "amount")?;
    let nonce = str_field(input, "nonce")?;

    if !valid_account_id(receiver_id) {
        return Err("receiver_id is not a valid NEAR account id".into());
    }
    let cap = ALLOWED.iter().find(|(t, _)| *t == token).map(|(_, c)| *c).ok_or("token is not allowed in this build")?;
    if amount.is_empty() || amount.len() > 39 || !amount.bytes().all(|b| b.is_ascii_digit()) || amount.starts_with('0') {
        return Err("amount must be a positive whole number in raw units".into());
    }
    let n: u128 = amount.parse().map_err(|_| "amount is too large")?;
    if n > cap {
        return Err(format!("amount is over this build's cap of {cap}"));
    }
    use base64::Engine;
    let nb = base64::engine::general_purpose::STANDARD.decode(nonce).map_err(|_| "nonce is not base64")?;
    if nb.len() != 32 || nb[..4] == VERSIONED_NONCE_PREFIX {
        return Err("nonce must be 32 random bytes (not starting with the versioned prefix)".into());
    }

    let (account_id, public_key) = identity()?;
    if receiver_id == account_id {
        return Err("receiver_id is the signer itself".into());
    }
    let mut tokens = serde_json::Map::new();
    tokens.insert(token.to_string(), Value::String(amount.to_string()));
    let payload = serde_json::to_string(&Payload {
        signer_id: &account_id,
        verifying_contract: VERIFYING_CONTRACT,
        deadline: iso8601(now_secs()? + DEADLINE_SECS),
        nonce,
        intents: vec![Transfer { intent: "transfer", receiver_id, tokens, memo: "stonkbag agent spike" }],
    })
    .map_err(|e| e.to_string())?;

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
        }
    }))
}

fn str_field<'a>(v: &'a Value, k: &str) -> Result<&'a str, String> {
    v.get(k).and_then(Value::as_str).ok_or_else(|| format!("missing string field {k:?}"))
}

/// NEAR account id rules: 2-64 chars of [a-z0-9_-], separated by dots, no leading/trailing/double separators.
fn valid_account_id(s: &str) -> bool {
    if s.len() < 2 || s.len() > 64 {
        return false;
    }
    s.split('.').all(|part| {
        !part.is_empty()
            && part.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
            && !part.starts_with(['-', '_'])
            && !part.ends_with(['-', '_'])
            && !part.contains("--")
            && !part.contains("__")
            && !part.contains("-_")
            && !part.contains("_-")
    })
}

fn now_secs() -> Result<u64, String> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|_| "the clock is before 1970".into())
}

/// Unix seconds to "YYYY-MM-DDTHH:MM:SS.000Z" (Howard Hinnant's days-to-civil).
fn iso8601(t: u64) -> String {
    let days = (t / 86_400) as i64;
    let secs = t % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z", secs / 3600, secs % 3600 / 60, secs % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_dates() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso8601(1_794_268_800), "2026-11-10T00:00:00.000Z");
        assert_eq!(iso8601(951_782_400 + 3661), "2000-02-29T01:01:01.000Z");
    }

    #[test]
    fn account_ids() {
        for ok in ["intents.near", "ai-creator.near", "a1", &"ab".repeat(32)] {
            assert!(valid_account_id(ok), "{ok}");
        }
        for bad in ["A.near", "a", ".near", "a..near", "-a.near", "a-.near", "a b", &"a".repeat(65)] {
            assert!(!valid_account_id(bad), "{bad}");
        }
    }
}
