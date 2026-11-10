# Stonkbag rebalancer (the signer)

An OutLayer WASI module whose ed25519 key is derived inside OutLayer's TEE (Intel TDX) and bound to this exact
build (`bind: "wasm"`). It composes NEAR Intents payloads itself, in the app's `raw_ed25519` shape, and signs them.

## Result, 2026-11-10 (mainnet)

| Step | Outcome |
| --- | --- |
| Build | `042eacebb10067a72b3f039f669390703516f069f34ba98d75dae03fab85cce2`, 129,502 bytes |
| Upload | FastFS, tx `64zQVFMounJ7BkVNsqtta5Hch7SJnmhmbRhr1ukEPMXD` |
| `whoami` | account `acf00dbdd61d9b9833dc26e4d2d75201d2dc3ff5104532a03687700705b1bf70`, key `ed25519:Ce5RsAR3Wk7jJtSZ62uxjZ2ycCVsHDrBgNF6DQ2gAT3V` |
| `sign_transfer` | tx `EXJtFCxhLZKPoTf5zSRj72hdMcAfQ4Dhhk81tXq1xbK4`, about 0.002 NEAR per run |
| `simulate_intents` on intents.near | fails only with "insufficient balance or overflow", so the TEE signature is accepted |
| Attestation | `https://api.outlayer.ai/attestations/by-tx/EXJtFCxhLZKPoTf5zSRj72hdMcAfQ4Dhhk81tXq1xbK4`: TDX quote, wasm_hash matches the build, caller ai-creator.near |

## Run it

```sh
./build.sh
outlayer upload out/rebalancer.wasm
echo '{"op":"whoami"}' > in.json
outlayer run --wasm <fastfs-url> --hash <sha256> --input in.json   # pass input with --input; a positional is read as the project
node verify.mjs <run-output.json>                                   # from the repo root; read-only
```

The key belongs to this build and the caller (`ai-creator.near`). A new build, or another caller, gets another key.

## Signer build 1, 2026-11-10 (mainnet)

`sign_leg` signs a basket's swap leg only after checking it. The payload must be exactly one transfer from the basket
account to a 1Click deposit address. The module then reads that deposit address's quote from 1Click itself and checks:

- the output and any refund go back to the same account, inside NEAR Intents;
- the token and amount match the transfer;
- both assets are on the basket's list;
- the quote is still waiting for its deposit;
- slippage is at most 3%;
- the leg is at most $250 (or the input's lower cap).

The rules are in `src/check.rs`, with 9 unit tests.

| Step | Outcome |
| --- | --- |
| Build | `20b42e48aad4ee0e247710cc5030da1f7aa60331eb55d54c8285260847c66514` (FastFS tx `3YunH9aUF6as9cbamrwhCkCBKePJWdwvbsgxbpsRNqHd`) |
| Key | account `01199b9b9f4833660459f20f11d38d4342281b09080495f802c54faa9c6dd3e8`, `ed25519:5J4DP2spg712rrUddWifcspWxpbzVv4U2gEonDYHK6F` |
| Real 1Click quote (USDC → wNEAR, back to the account) | signed. intents.near `simulate_intents` fails only on balance, so the signature is accepted |
| Quote whose output goes to another account | refused: "the swap output does not go back to the basket account" |

Building the module again changes the key, so a holder who opted in would have to opt in again.
