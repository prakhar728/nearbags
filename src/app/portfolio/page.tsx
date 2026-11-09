import { PortfolioView } from "./PortfolioView";

export const metadata = { title: "Portfolio · Stonkbag" };

export default function PortfolioPage() {
  return (
    <div className="grid gap-6">
      <h1 className="font-mono text-xl font-semibold tracking-tight">Your bags</h1>
      <PortfolioView />
    </div>
  );
}
