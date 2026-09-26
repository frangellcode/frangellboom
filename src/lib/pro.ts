import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import type { Mode, Resolution } from "./boomerang";
import { isNativeApp } from "./native";

/** Must match the non-consumable in App Store Connect (and
 *  ios/App/App/Frangellboom.storekit for local testing). */
export const PRO_PRODUCT_ID = "com.frangellcode.frangellboom.pro";

export interface ProProduct {
  id: string;
  displayName: string;
  /** Already localized and in the person's own currency, straight from the
   *  App Store — never format a price here. */
  displayPrice: string;
}

export type ProPurchaseStatus = "purchased" | "pending" | "cancelled";

interface ProPlugin {
  getStatus(): Promise<{ isPro: boolean }>;
  getProduct(): Promise<ProProduct>;
  purchase(): Promise<{ status: ProPurchaseStatus }>;
  restore(): Promise<{ isPro: boolean }>;
  addListener(event: "statusChange", listener: (data: { isPro: boolean }) => void): Promise<PluginListenerHandle>;
}

/** ios/App/App/ProPlugin.swift. Native-only: gate every call on isNativeApp. */
export const Pro = registerPlugin<ProPlugin>("Pro");

/** What Pro unlocks. Everything else is free. */
export const PRO_MODES: readonly Mode[] = ["ease", "freeze", "pulse", "zoom"];
export const PRO_RESOLUTIONS: readonly Resolution[] = ["original", "1440"];

// The web version has no App Store to buy from, so it's all unlocked there.
// The app starts locked and asks StoreKit on every launch — nothing is
// cached, so a refund or a new phone is simply whatever StoreKit says.
let state = { isPro: !isNativeApp, paywallOpen: false };
const listeners = new Set<() => void>();

function set(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const setPro = (isPro: boolean) => set({ isPro });
export const openPaywall = () => set({ paywallOpen: true });
export const closePaywall = () => set({ paywallOpen: false });

export function useIsPro(): boolean {
  return useSyncExternalStore(subscribe, () => state.isPro);
}

export function usePaywallOpen(): boolean {
  return useSyncExternalStore(subscribe, () => state.paywallOpen);
}

export function initPro() {
  if (!isNativeApp) return;
  Pro.getStatus()
    .then(({ isPro }) => setPro(isPro))
    .catch(() => {});
  Pro.addListener("statusChange", ({ isPro }) => setPro(isPro)).catch(() => {});
}
