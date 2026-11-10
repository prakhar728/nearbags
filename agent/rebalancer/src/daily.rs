//! The daily swap limit, without any storage. Each day an account gets MAX_SWAPS_PER_DAY nonces, derived from the
//! account and the UTC day. The signer only signs payloads carrying one of today's nonces that intents.near hasn't
//! seen yet, and intents.near never accepts a nonce twice, so at most that many agent swaps can land per account per
//! day, whatever the server asks for. Pure code, unit-tested on the host.
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};

pub const MAX_SWAPS_PER_DAY: u32 = 24;

/// Today's k-th nonce for an account (base64 of 32 bytes).
pub fn nonce(account_id: &str, day: u64, k: u32) -> String {
    let mut h = Sha256::new();
    h.update(b"stonkbag-agent/nonce/v1|");
    h.update(account_id.as_bytes());
    h.update(format!("|{day}|{k}").as_bytes());
    let mut b: [u8; 32] = h.finalize().into();
    // A legacy nonce must not start with intents.near's versioned-nonce prefix.
    if b[..4] == [0x56, 0x28, 0xf6, 0xc6] {
        b[0] = 0;
    }
    STANDARD.encode(b)
}

/// The payload with its nonce replaced. The payload has exactly one "nonce" string (checked by `envelope`).
pub fn with_nonce(payload: &str, nonce: &str) -> Result<String, String> {
    let v: serde_json::Value = serde_json::from_str(payload).map_err(|_| "payload is not JSON")?;
    let old = v.get("nonce").and_then(|n| n.as_str()).ok_or("payload has no nonce")?;
    let needle = format!("\"nonce\":\"{old}\"");
    if payload.matches(&needle).count() != 1 {
        return Err("payload nonce is not in the expected form".into());
    }
    Ok(payload.replacen(&needle, &format!("\"nonce\":\"{nonce}\""), 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nonces_are_32_bytes_and_distinct() {
        let a = nonce("abc", 20_403, 0);
        assert_eq!(STANDARD.decode(&a).unwrap().len(), 32);
        assert_ne!(a, nonce("abc", 20_403, 1));
        assert_ne!(a, nonce("abc", 20_404, 0));
        assert_ne!(a, nonce("abd", 20_403, 0));
        assert_eq!(a, nonce("abc", 20_403, 0));
    }

    #[test]
    fn replaces_only_the_nonce() {
        let p = r#"{"signer_id":"a","nonce":"OLD","intents":[{"intent":"transfer","memo":"nonce"}]}"#;
        assert_eq!(with_nonce(p, "NEW").unwrap(), r#"{"signer_id":"a","nonce":"NEW","intents":[{"intent":"transfer","memo":"nonce"}]}"#);
        assert!(with_nonce(r#"{"nonce": "spaced"}"#, "x").is_err());
    }
}
