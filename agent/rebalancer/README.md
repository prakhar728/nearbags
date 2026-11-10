# Stonkbag rebalancer (OutLayer spike)

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
