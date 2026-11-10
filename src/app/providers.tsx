"use client";
import "@near-wallet-selector/modal-ui/styles.css";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { setupNearMobileWallet } from "@near-wallet-selector/near-mobile-wallet";
import { setupMeteorWalletApp } from "@near-wallet-selector/meteor-wallet-app";
import { AuthProvider } from "@/lib/client/auth";
import { wagmiConfig } from "@/lib/client/wagmi";
import "@/lib/client/pwa"; // registers the service worker and listens for the install prompt

// No redirect wallets (MyNearWallet): they would need callback handling for signMessage.
// Phones: HOT and NEAR Mobile hand off to their apps by deep link or QR, which also works from the installed app.
// Meteor and Intear web wallets open a popup, fine in a phone browser but unreliable in an installed app.
// Inside the Meteor app's own browser, its injected bridge (meteor-wallet-app) is used instead of the popup.
const inMeteorApp = typeof window !== "undefined" && "ReactNativeWebView" in window;
const nearConfig = {
  network: "mainnet" as const,
  modules: [
    ...(inMeteorApp ? [setupMeteorWalletApp({ contractId: "intents.near" })] : []),
    setupMeteorWallet(),
    setupHotWallet(),
    setupNearMobileWallet({ dAppMetadata: { name: "Stonkbag", logoUrl: "https://stonkbag-iota.vercel.app/pwa/icon-192.png", url: "https://stonkbag-iota.vercel.app" } }),
    setupIntearWallet(),
  ],
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
