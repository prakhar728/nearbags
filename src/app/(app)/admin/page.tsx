import { PageHeader } from "@/components/ui/Primitives";
import { AdminView } from "./AdminView";

export const metadata = { title: "Admin · nearbags" };

export default function AdminPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader title="Admin" />
      <AdminView />
    </div>
  );
}
