import type { Metadata } from "next";
import { AGENT_PLATFORM_FEE_BPS, PLATFORM_FEE_BPS } from "@/lib/baskets";
import { Studio } from "./Studio";

export const metadata: Metadata = { title: "Make a basket · nearbags" };

export default function CreatePage() {
  return <Studio platformFeeBps={PLATFORM_FEE_BPS()} agentPlatformFeeBps={AGENT_PLATFORM_FEE_BPS()} />;
}
