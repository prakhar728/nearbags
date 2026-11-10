#!/bin/sh
set -e
cd "$(dirname "$0")"
cargo build --target wasm32-wasip2 --release
mkdir -p out
cp target/wasm32-wasip2/release/rebalancer.wasm out/
grep -qa 'outlayer.manifest' out/rebalancer.wasm || { echo "manifest section missing" >&2; exit 1; }
echo "size: $(wc -c < out/rebalancer.wasm) bytes"
echo "sha256: $(shasum -a 256 out/rebalancer.wasm | cut -d' ' -f1)"
