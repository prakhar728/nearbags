import { connection } from "next/server";
import { Landing } from "@/components/landing/Landing";
import { getLandingData } from "@/lib/landing";
import "./landing.css";

export const metadata = {
  title: "Stonkbag · Bag it.",
  description: "Creator-made baskets of US stocks and crypto. Buy the whole bag from any chain. Your keys.",
};

export default function Home() {
  // Not awaited: the page shell renders immediately and the price data streams into it.
  return <Landing data={loadData()} />;
}

async function loadData() {
  await connection(); // real prices at request time; the build never touches the database
  return getLandingData().catch(() => null);
}
