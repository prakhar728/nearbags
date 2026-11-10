"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { AuthProvider } from "@/lib/client/auth";
import { prewarmNear } from "@/lib/client/near";
import { wagmiConfig } from "@/lib/client/wagmi";
import "@/lib/client/pwa"; // registers the service worker and listens for the install prompt

// NEAR wallets come from HOT Connect (lib/client/near), which needs no provider: it is created on first use.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(prewarmNear, []);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
