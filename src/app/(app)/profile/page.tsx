import { PageHeader } from "@/components/ui/Primitives";
import type { Metadata } from "next";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Your profile · Stonkbag" };

export default function ProfileEditPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Profile"
        title={
          <>
            Your <em>profile.</em>
          </>
        }
        description="Shown on your baskets and at /c/your-handle."
      />
      <ProfileForm />
    </div>
  );
}
