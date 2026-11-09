import { AdminView } from "./AdminView";

export const metadata = { title: "Admin · Stonkbag" };

export default function AdminPage() {
  return (
    <div className="grid gap-6">
      <h1 className="font-mono text-xl font-semibold tracking-tight">Admin</h1>
      <AdminView />
    </div>
  );
}
