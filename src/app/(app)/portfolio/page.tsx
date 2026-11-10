import { PageHeader } from "@/components/ui/Primitives";
import { PortfolioView } from "./PortfolioView";

export const metadata = { title: "Portfolio · nearbags" };

export default function PortfolioPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        kicker="Portfolio"
        title={
          <>
            Your <em>bags.</em>
          </>
        }
      />
      <PortfolioView />
    </div>
  );
}
