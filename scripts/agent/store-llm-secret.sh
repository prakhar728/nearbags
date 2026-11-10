#!/bin/sh
# Store the strategist's model key in OutLayer's sealed secrets, readable only by the current strategist build when
# our relayer account calls it directly. Reads NEARAI_API_KEY from .env.local and never prints it.
#
# Usage, from the repo root:  sh scripts/agent/store-llm-secret.sh
# Optional in .env.local: LLM_MODEL (default deepseek-ai/DeepSeek-V4.1-Flash-1017).
set -eu
cd "$(dirname "$0")/../.."

get() { grep -E "^$1=" .env.local 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

KEY=$(get NEARAI_API_KEY)
HASH=$(get AGENT_STRATEGIST_WASM_HASH)
RELAYER=$(get RELAYER_ACCOUNT_ID)
PROFILE=$(get AGENT_SECRETS_PROFILE)
MODEL=$(get LLM_MODEL)
[ -n "$KEY" ] || { echo "Add NEARAI_API_KEY=... to .env.local first." >&2; exit 1; }
[ -n "$HASH" ] && [ -n "$RELAYER" ] || { echo "AGENT_STRATEGIST_WASM_HASH or RELAYER_ACCOUNT_ID is missing from .env.local." >&2; exit 1; }
PROFILE=${PROFILE:-agent}
MODEL=${MODEL:-deepseek-ai/DeepSeek-V4.1-Flash-1017}

JSON=$(KEY="$KEY" MODEL="$MODEL" python3 -c 'import json,os; print(json.dumps({"LLM_API_KEY": os.environ["KEY"], "LLM_BASE_URL": "https://cloud-api.near.ai/v1", "LLM_MODEL": os.environ["MODEL"]}))')

echo "Storing LLM_API_KEY, LLM_BASE_URL and LLM_MODEL ($MODEL)"
echo "  profile: $PROFILE   readable by build: $HASH"
echo "  only when called directly by: $RELAYER"
outlayer secrets set --profile "$PROFILE" --wasm-hash "$HASH" --access "whitelist:$RELAYER" --direct "$JSON" >/dev/null
echo "Stored. The key itself was not printed."
