"use client";
import { createConfig, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, base, optimism, polygon, bsc],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(projectId ? [walletConnect({ projectId, showQrModal: true, metadata: { name: "Stonkbag", description: "Creator baskets of stocks and crypto", url: "https://stonkbag.app", icons: [] } })] : []),
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
