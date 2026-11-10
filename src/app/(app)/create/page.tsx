import type { Metadata } from "next";
import { PLATFORM_FEE_BPS } from "@/lib/baskets";
import { Studio } from "./Studio";

export const metadata: Metadata = { title: "Make a basket · nearbags" };

export default function CreatePage() {
  return <Studio platformFeeBps={PLATFORM_FEE_BPS()} />;
}
