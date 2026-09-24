import { Capacitor } from "@capacitor/core";

/** True inside the App Store build (the Capacitor shell in ios/), false on the
 *  web and in the installed PWA. The two ship the same bundle; this is the one
 *  switch for what has to differ — no service worker, the system video picker,
 *  saving through the share sheet, keeping the screen awake natively. */
export const isNativeApp = Capacitor.isNativePlatform();
