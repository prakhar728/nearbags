import type { NextConfig } from "next";

// Security headers (audit 2026-11-18, #4). Basket keys live in the browser, so injected script is the threat that
// matters most. Enforced now: no framing (clickjacking), no plugins, no <base> or form hijack, no MIME sniffing, no
// referrer beyond our origin, no camera/mic/location. The full script/connect allowlist runs report-only first, because
// wallet SDKs load from hosts we can only confirm with real wallets; violations post to /api/csp-report. Once that log
// stays clean through real wallet use, move STRICT into Content-Security-Policy.
const dev = process.env.NODE_ENV !== "production";
const ENFORCED = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");
const WALLET_HOSTS = [
  "https://raw.githubusercontent.com",
  "https://*.herewallet.app",
  "https://*.hot-labs.org",
  "https://*.meteorwallet.app",
  "https://meteorwallet.app",
  "https://*.intear.tech",
  "https://*.mynearwallet.com",
  "https://*.peersyst.tech",
  "https://nearmobile.app",
  "https://*.oneclick.me",
  "https://unitywallet.com",
  "https://*.hana.money",
  "https://nightly.app",
  "https://*.okx.com",
  "https://evm-on-near.dev",
  "https://wallet.near.org",
  "https://trezu.app",
];
const CONNECT = [
  "'self'",
  "https://1click.chaindefuser.com",
  "https://*.fastnear.com",
  "https://rpc.mainnet.near.org",
  "https://*.near.org",
  "https://*.hot-labs.org",
  "https://*.herewallet.app",
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.com",
  "wss://*.walletconnect.org",
  "https://*.reown.com",
  "https://*.infura.io",
  "https://*.alchemy.com",
  "https://*.publicnode.com",
  "https://*.drpc.org",
  "https://*.llamarpc.com",
  "https://*.base.org",
  "https://*.arbitrum.io",
  "https://*.optimism.io",
  "https://*.polygon.technology",
  "https://*.binance.org",
  "https://*.ankr.com",
  "https://*.merkle.io",
  "https://cloudflare-eth.com",
  // HOT Connect: its wallet list and each wallet's code come from GitHub; wallets then talk to their own servers.
  ...WALLET_HOSTS,
  "https://*.web3modal.org",
  ...(dev ? ["ws://localhost:*", "http://localhost:*"] : []),
].join(" ");
const STRICT = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://raw.githubusercontent.com${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  `connect-src ${CONNECT}`,
  `frame-src 'self' blob: ${WALLET_HOSTS.join(" ")} https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ENFORCED,
  "report-uri /api/csp-report",
].join("; ");
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: ENFORCED },
  { key: "Content-Security-Policy-Report-Only", value: STRICT },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // /thesis reads this file with fs inside "use cache"; ship it with the function so a revalidation can still read it.
  outputFileTracingIncludes: { "/thesis": ["./data/thesis/thesis.json"], "/docs/[slug]": ["./docs/**/*"] },
  // The service worker must never be cached by the browser or a CDN, or app updates get stuck behind an old one.
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
