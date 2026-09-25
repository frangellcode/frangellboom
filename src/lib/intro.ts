import { SplashScreen } from "@capacitor/splash-screen";
import sky from "../assets/sky.jpg";
import { isNativeApp } from "./native";

// The intro plays once per launch: on a cold start, not when coming back to
// the home screen from another step.
let played = false;

export function introPending(): boolean {
  return !played;
}

/**
 * Waits until the intro can play without a hitch — the sky decoded and the
 * fonts in — and then takes down the native launch screen, which shows the
 * very frame the intro starts from. Never takes longer than a couple of
 * seconds, and never leaves the launch screen up.
 */
export async function prepareIntro(): Promise<void> {
  played = true;
  try {
    const image = new Image();
    image.src = sky;
    const ready = Promise.all([image.decode().catch(() => {}), document.fonts?.ready]);
    await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 2500))]);
    // Two frames, so the waiting state (sky only) is on screen before the
    // launch screen comes down on top of it.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  } finally {
    if (isNativeApp) await SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
  }
}
