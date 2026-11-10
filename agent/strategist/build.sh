#!/bin/sh
set -e
cd "$(dirname "$0")"
cargo build --target wasm32-wasip2 --release
mkdir -p out
cp target/wasm32-wasip2/release/strategist.wasm out/
echo "size: $(wc -c < out/strategist.wasm) bytes"
echo "sha256: $(shasum -a 256 out/strategist.wasm | cut -d' ' -f1)"
