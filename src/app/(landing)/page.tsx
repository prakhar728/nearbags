import { connection } from "next/server";
import { Suspense } from "react";
import { Landing } from "@/components/landing/Landing";
import { getLandingData } from "@/lib/landing";
import "./landing.css";

export const metadata = {
  title: "Stonkbag · Bag it.",
  description: "Creator-made baskets of US stocks and crypto. Buy the whole bag from any chain. Your keys.",
};

export default function Home() {
  return (
    <Suspense fallback={<Landing data={null} />}>
      <WithData />
    </Suspense>
  );
}

async function WithData() {
  await connection(); // real prices at request time; the build never touches the database
  const data = await getLandingData().catch(() => null);
  return <Landing data={data} />;
}
