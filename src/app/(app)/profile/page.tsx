import type { Metadata } from "next";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Your profile · Stonkbag" };

export default function ProfileEditPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-mono text-2xl font-semibold">Your profile</h1>
        <p className="text-sm text-muted">Shown on your baskets and at /c/your-handle.</p>
      </div>
      <ProfileForm />
    </div>
  );
}
