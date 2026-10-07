import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native";

// Keeps the screen from dimming/locking during export — without it, a long
// ffmpeg pass (chunked reverses at 2K/Original especially) can run right
// into the phone's auto-lock, and iOS suspends a locked page hard enough to
// stall or kill the export outright.
//
// WKWebView has no Screen Wake Lock API, so the iOS app asks UIKit directly
// (ios/App/App/KeepAwakePlugin.swift).
const KeepAwake = registerPlugin<{ enable(): Promise<void>; disable(): Promise<void> }>("KeepAwake");

let sentinel: WakeLockSentinel | null = null;

// Live reload only (npm run ios:dev serves the app from Vite's dev server,
// where import.meta.env.DEV is true): the iPhone stays awake the whole time
// the app is open, so it doesn't lock while changes are being tried on it.
// Production builds compile this away and only stay awake while exporting.
const STAY_AWAKE_WHILE_DEVELOPING = import.meta.env.DEV && isNativeApp;
if (STAY_AWAKE_WHILE_DEVELOPING) KeepAwake.enable().catch(() => {});

export async function requestWakeLock(): Promise<void> {
  if (isNativeApp) {
    await KeepAwake.enable().catch(() => {});
    return;
  }
  if (!("wakeLock" in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
  } catch {
    // Not fatal — e.g. the tab isn't visible/focused at the moment of the
    // request. The export just proceeds without the screen staying awake.
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (isNativeApp) {
    if (!STAY_AWAKE_WHILE_DEVELOPING) await KeepAwake.disable().catch(() => {});
    return;
  }
  const current = sentinel;
  sentinel = null;
  if (current) await current.release().catch(() => {});
}
