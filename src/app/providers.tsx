"use client";
import "@near-wallet-selector/modal-ui/styles.css";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { AuthProvider } from "@/lib/client/auth";
import { wagmiConfig } from "@/lib/client/wagmi";

// Popup/extension wallets only: redirect wallets (MyNearWallet) would need callback handling for signMessage.
const nearConfig = {
  network: "mainnet" as const,
  modules: [setupMeteorWallet(), setupHotWallet(), setupIntearWallet()],
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletSelectorProvider config={nearConfig}>
          <AuthProvider>{children}</AuthProvider>
        </WalletSelectorProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
