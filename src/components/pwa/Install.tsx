"use client";
// "Install the app": a header button on phones, and a one-time banner. Hidden once installed.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { promptInstall, usePwa } from "@/lib/client/pwa";

const DISMISS_KEY = "sb:install-banner-dismissed";

function ShareGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="inline-block align-[-3px]">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function IosSteps({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} className="sheet" aria-label="Install Stonkbag">
      <div className="grid gap-5 p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="mx-auto h-1 w-10 rounded-full bg-[var(--line-strong)]" aria-hidden />
        <h2 className="font-sans text-lg font-semibold text-text">Add Stonkbag to your home screen</h2>
        <ol className="grid gap-3 text-[15px] leading-relaxed text-muted">
          <li className="flex gap-3">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--layer-3)] text-xs text-text">1</span>
            <span>
              Tap <span className="text-text">Share</span> <ShareGlyph /> in Safari&rsquo;s toolbar.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--layer-3)] text-xs text-text">2</span>
            <span>
              Choose <span className="text-text">Add to Home Screen</span>. Scroll the list if you don&rsquo;t see it.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--layer-3)] text-xs text-text">3</span>
            <span>
              Tap <span className="text-text">Add</span>. Stonkbag opens full screen from its icon.
            </span>
          </li>
        </ol>
        <button type="button" className="btn btn-secondary w-full" onClick={onClose}>
          Got it
        </button>
      </div>
    </dialog>
  );
}

function useInstall() {
  const pwa = usePwa();
  const [steps, setSteps] = useState(false);
  const available = !pwa.standalone && (pwa.canPrompt || pwa.ios);
  const install = async () => {
    if (!(await promptInstall())) setSteps(true);
  };
  return { available, install, steps, closeSteps: () => setSteps(false) };
}

/** Compact header button, phones only. */
export function InstallButton() {
  const { available, install, steps, closeSteps } = useInstall();
  if (!available) return null;
  return (
    <>
      <button
        type="button"
        onClick={install}
        aria-label="Install the app"
        title="Install the app"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] text-text active:bg-[var(--layer-2)] md:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />
        </svg>
      </button>
      <IosSteps open={steps} onClose={closeSteps} />
    </>
  );
}

const BANNER_PAGES = ["/explore", "/portfolio"];

/** One-time banner on phones, on the two home pages only; dismissing it is remembered on this device. */
export function InstallBanner() {
  const { available, install, steps, closeSteps } = useInstall();
  const path = usePathname() ?? "";
  // Read once on the client. The banner renders nothing on the server (not installable there), so no mismatch.
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (!available || hidden || !BANNER_PAGES.includes(path)) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };
  return (
    <>
      <div className="card mb-6 flex items-center gap-3 p-3 pl-4 md:hidden">
        <span className="min-w-0 flex-1 text-sm leading-snug text-muted">
          <span className="font-medium text-text">Get the app.</span> Full screen, one tap from your home screen.
        </span>
        <button type="button" onClick={install} className="btn btn-primary btn-sm shrink-0">
          Install
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-faint active:bg-[var(--layer-2)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <IosSteps open={steps} onClose={closeSteps} />
    </>
  );
}
