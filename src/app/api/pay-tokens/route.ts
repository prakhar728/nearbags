// Tokens a buyer can pay with (and receive on sell): 1Click's list, trimmed to common chains and liquid symbols.
import { connection } from "next/server";
import { handle } from "@/lib/auth/session";
import { payTokens } from "@/lib/trade/orders";

const SYMBOLS = new Set(["USDC", "USDT", "ETH", "BTC", "SOL", "wNEAR", "ZEC", "BNB", "XRP", "DOGE", "SUI", "TRX"]);
const CHAINS = new Set(["near", "eth", "arb", "base", "op", "pol", "bsc", "sol", "btc", "zec", "xrp", "doge", "sui", "tron"]);

export async function GET() {
  return handle(async () => {
    await connection(); // live token list: request time only, never prerendered
    const list = (await payTokens())
      .filter((t) => SYMBOLS.has(t.symbol) && CHAINS.has(t.blockchain))
      .map((t) => ({ assetId: t.assetId, symbol: t.symbol, chain: t.blockchain, decimals: t.decimals, price: t.price, contract: t.contractAddress ?? null }));
    return Response.json({ tokens: list }, { headers: { "Cache-Control": "public, max-age=300" } });
  });
}
