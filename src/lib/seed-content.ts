// Draft theses for the launch baskets (spec §11). Numbers come from Stonkbag's own backtests on 2026-11-09
// (total return, dividends reinvested net of 30% withholding). Prakhar edits these in his own voice before launch.
// Limits (spec §5.3): tagline 120, thesis 1500, why 200 each, risks 600, exit signal 300.
export interface SeedText {
  tagline: string;
  thesis: string;
  risks: string;
  horizon: "3m" | "1y" | "3y+";
  exitSignal: string;
  why: Record<string, string>;
}

export const SEED_TEXT: Record<string, SeedText> = {
  "degen-mix": {
    tagline: "Tesla, Circle and two fast chains. High volatility on purpose.",
    thesis: [
      "This is the bag for people who want stocks and crypto to move together, hard.",
      "Tesla is the most-traded retail stock there is. Circle issues USDC, so it earns more when stablecoins grow. Solana and NEAR are the two chains where most of this app's users already live.",
      "Since Circle listed in June 2025, this mix would have turned $1,000 into about $1,050, with a worst drop of 52% on the way. Mixing the four cut day-to-day swings by about 27% compared with holding each one alone.",
      "Treat this as a small, loud position next to something boring.",
    ].join("\n\n"),
    risks: "Every asset here can fall 50% or more, and some did. Circle only listed in June 2025, so there is little history. SOL and NEAR move together (correlation 0.62), so the crypto half doesn't hedge itself.",
    horizon: "1y",
    exitSignal: "I'd close it if stablecoin supply stops growing for two quarters, or if SOL and NEAR lose their share of on-chain activity.",
    why: {
      TSLA: "The retail favourite. Big swings, deep liquidity, trades almost around the clock as a token.",
      CRCL: "Issuer of USDC. A direct bet on stablecoins growing.",
      SOL: "High-throughput chain with heavy retail and memecoin activity.",
      NEAR: "The chain this app runs on. Intents volume is its growth story.",
    },
  },
  "ai-picks-and-shovels": {
    tagline: "The companies selling to the AI gold rush.",
    thesis: [
      "In a gold rush, the people selling shovels get paid whoever finds the gold. In AI, the shovels are chips, networking and cloud capacity.",
      "Nvidia makes the GPUs. Marvell makes custom chips and the networking that ties data centres together. Microsoft, Alphabet and Meta are the biggest buyers, and also run the clouds and models people use.",
      "Over the last five years this mix would have turned $1,000 into about $3,100, roughly 25% a year, against about $1,640 in SPY. Nvidia did most of the work: about 150 of the 210 points of gain.",
      "That concentration is the point and the risk.",
    ].join("\n\n"),
    risks: "Heavily tied to one theme. If AI spending slows, these fall together. The worst drop over five years was 53%. Nvidia alone drove most of the past return, which may not repeat.",
    horizon: "3y+",
    exitSignal: "I'd exit if the big cloud companies cut data-centre spending guidance two quarters in a row.",
    why: {
      NVDA: "The default AI chip. Most of this basket's past return came from here.",
      MSFT: "Biggest enterprise AI distributor through Azure and Office.",
      GOOGL: "Own chips (TPUs), own models, own cloud. Hedges the Nvidia bet a little.",
      MRVL: "Custom AI chips and data-centre networking. Barely moved with Microsoft over the past year (correlation 0.04).",
      META: "Spends heavily on AI infrastructure and turns it into ad revenue.",
    },
  },
  "gold-and-btc-hedge": {
    tagline: "Old money and new money against inflation and debasement.",
    thesis: [
      "Gold has been the default hedge for a few thousand years. Bitcoin wants the same job. This basket holds both instead of picking a winner.",
      "Over five years, $1,000 here would have become about $1,730, a little ahead of SPY's $1,640, with a 38% worst drop against much deeper falls for bitcoin alone. Mixing them cut swings by about 30%.",
      "Most of the gain came from gold and silver. Bitcoin added volatility more than return over this window, which is why it's capped at 40%.",
    ].join("\n\n"),
    risks: "None of these pay income. Gold and silver move together (correlation 0.84), so the metals half is really one bet. In a sharp liquidity crunch, all three have fallen at the same time.",
    horizon: "3y+",
    exitSignal: "I'd trim if real interest rates rise sharply and stay high, which has historically hurt gold.",
    why: {
      GLD: "The classic hedge. Did most of the work over five years.",
      SLV: "Gold's more volatile cousin, with industrial demand on top.",
      BTC: "Digital scarcity. Adds upside and volatility; held as BTC on NEAR.",
    },
  },
  "big-tech-vs-bitcoin": {
    tagline: "Half Nasdaq 100, half crypto majors.",
    thesis: [
      "Two of the biggest stories of the last decade in one bag: the largest US tech companies, and the two largest crypto networks.",
      "Over five years, $1,000 would have become about $1,260. That's behind SPY ($1,640), mainly because it started near the 2021 crypto top: ETH cost the basket about 11 points. Over three years it returned about 20% a year.",
      "The basket rewards patience more than timing.",
    ].join("\n\n"),
    risks: "Crypto and tech have fallen together in sell-offs; the worst drop here was 55%. BTC and ETH move almost as one (correlation 0.91), so the crypto half is close to a single bet.",
    horizon: "3y+",
    exitSignal: "I'd rebalance towards QQQ if crypto's share grows past 60% of the basket after a run-up.",
    why: {
      QQQ: "The Nasdaq 100 in one token. The steady half of the basket.",
      BTC: "The largest crypto asset. Held as BTC on NEAR.",
      ETH: "The second network, with its own app economy. The most volatile piece here.",
    },
  },
  "yield-shelter": {
    tagline: "T-bills and inflation-linked bonds while you wait.",
    thesis: [
      "Somewhere to park money without leaving the app: short T-bills for yield, inflation-protected bonds for real value, a slice of long bonds in case rates fall, and some USDC cash.",
      "This is not a growth basket, and the history says so. Over five years, $1,000 would have become about $950, because long bonds (TLT) crashed in 2022 when rates rose. T-bills (SGOV) were the steady part.",
      "It earns its place when rates fall or stocks have a bad year, not before.",
    ].join("\n\n"),
    risks: "Long bonds lose value when interest rates rise; TLT did badly in 2022. Ondo reinvests interest after withholding, which lowers returns. USDC earns nothing here.",
    horizon: "1y",
    exitSignal: "I'd move the TLT slice into SGOV if long-term rates start rising again.",
    why: {
      SGOV: "0–3 month US T-bills. Close to cash, earns short-term rates.",
      TLT: "20+ year Treasuries. Gains if rates fall, hurts if they rise.",
      TIP: "Inflation-protected Treasuries.",
      USDC: "Dry powder. Stays as cash in the basket account.",
    },
  },
};
