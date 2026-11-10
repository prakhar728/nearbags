"use client";
// Install state shared by the header button and the banner: Android/desktop Chrome hand us an install prompt
// (beforeinstallprompt); iOS Safari has none, so we show how to use Share → Add to Home Screen instead.
import { useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  standalone: boolean; // running as the installed app
  canPrompt: boolean; // the browser gave us an install prompt
  ios: boolean; // iPhone/iPad Safari: install by hand
}

const SERVER: PwaState = { standalone: false, canPrompt: false, ios: false };
let deferred: InstallPromptEvent | null = null;
let state: PwaState = SERVER;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function compute(): PwaState {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const ua = navigator.userAgent;
  const iosDevice = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  // Only Safari can add to the home screen on older iOS; in-app browsers (wallet apps, X, Telegram) can't.
  const ios = iosDevice && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) && !("ReactNativeWebView" in window);
  return { standalone, canPrompt: deferred != null, ios };
}

if (typeof window !== "undefined") {
  state = compute();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own button
    deferred = e as InstallPromptEvent;
    state = compute();
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    state = { ...compute(), standalone: true };
    emit();
  });
  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    });
  }
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => SERVER,
  );
}

/** Show the browser's install prompt. Returns false when there is none (then show the iOS steps). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  await e.userChoice.catch(() => null);
  state = compute();
  emit();
  return true;
}
