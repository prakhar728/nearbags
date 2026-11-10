"use client";
import { createConfig, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
// WalletConnect shows this name and icon in the wallet, and checks `url` against the page's real origin.
const origin = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || "https://nearbags.com");
const metadata = { name: "nearbags", description: "Creator baskets of stocks and crypto", url: origin, icons: [`${origin}/pwa/icon-192.png`] };

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, base, optimism, polygon, bsc],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(projectId ? [walletConnect({ projectId, showQrModal: true, metadata })] : []),
  ],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [bsc.id]: http(),
  },
  ssr: true,
});
