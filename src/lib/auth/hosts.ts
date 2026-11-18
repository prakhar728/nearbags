// The hosts nearbags answers on. Sign-in signatures name one of them (NEP-413 recipient, SIWE domain), and the proxy
// accepts state-changing API calls only from them (security audit 2026-11-18, items 2 and CSRF). Pure: no server-only,
// shared by the proxy, the auth routes, the client and tests.

const FIXED = new Set(["nearbags.com", "www.nearbags.com", "stonkbag-iota.vercel.app"]);

/** "localhost" or "localhost:<port>". */
export function isLocalHost(host: string): boolean {
  return /^localhost(:\d{1,5})?$/.test(host.toLowerCase());
}

/** True for our production hosts, and for localhost on any port except on the production deployment. */
export function isAllowedHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  const prod = typeof process !== "undefined" && process.env?.VERCEL_ENV === "production";
  return FIXED.has(h) || (!prod && isLocalHost(h));
}

/** "http://localhost:3093" or "https://nearbags.com". */
export function originFor(host: string): string {
  return `${isLocalHost(host) ? "http" : "https"}://${host.toLowerCase()}`;
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * The host a sign-in on this request must name: the request's own Host when it is one of ours, else the host of
 * NEXT_PUBLIC_SITE_URL when that is one of ours, else null (sign-in is refused).
 */
export function signInHost(requestHost: string | null | undefined, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  for (const h of [requestHost, hostOf(siteUrl)]) if (h && isAllowedHost(h)) return h.toLowerCase();
  return null;
}

/**
 * CSRF check for a state-changing request: the Origin must be the request's own host, or one of our production hosts.
 * A localhost Origin only counts against a localhost request, so a page on someone's machine can't post to production.
 */
export function originAllowed(origin: string | null | undefined, requestHost: string | null | undefined): boolean {
  if (!origin || origin === "null") return false;
  const oh = hostOf(origin)?.toLowerCase();
  if (!oh) return false;
  if (requestHost && oh === requestHost.toLowerCase()) return true;
  return isAllowedHost(oh) && !isLocalHost(oh);
}

/** The Host a request was sent to (the Host header, else the URL's host). */
export function requestHost(request: Request): string | null {
  return request.headers.get("host") ?? hostOf(request.url);
}
