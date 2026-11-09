// Visitor country from Vercel's edge headers. DEV_COUNTRY / DEV_REGION override it locally for testing.
import "server-only";
import { headers } from "next/headers";

export async function visitorGeo(): Promise<{ country: string | null; region: string | null }> {
  const h = await headers();
  const country = process.env.DEV_COUNTRY || h.get("x-vercel-ip-country") || null;
  const region = process.env.DEV_REGION || h.get("x-vercel-ip-country-region") || null;
  return { country, region };
}
