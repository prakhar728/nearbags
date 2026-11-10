"use client";
// Back button for inner pages on phones. The installed app has no browser back button, so inner pages need one.
// Goes back through in-app history when there is some; a page opened straight from a link goes to its parent.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ROOTS = ["/explore", "/create", "/portfolio", "/thesis"];
let inAppSteps = 0; // client-side navigations since this tab loaded the app
let lastPath: string | null = null;

/** Mounted once in the layout: counts in-app page changes. */
export function NavTracker() {
  const path = usePathname();
  useEffect(() => {
    if (lastPath !== null && lastPath !== path) inAppSteps++;
    lastPath = path;
  }, [path]);
  return null;
}

function parentOf(path: string) {
  if (path.startsWith("/docs/")) return "/docs";
  return "/explore";
}

export function BackButton() {
  const path = usePathname() ?? "";
  const router = useRouter();
  if (ROOTS.includes(path) || path === "/") return null;
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (inAppSteps > 0 ? router.back() : router.push(parentOf(path)))}
      className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-text active:bg-[var(--layer-2)] md:hidden"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
