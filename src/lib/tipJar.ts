import { registerPlugin } from "@capacitor/core";

/** Must match the consumable in-app purchases created in App Store Connect
 *  (and ios/App/App/Frangellboom.storekit for local testing) character for
 *  character — a product ID that isn't found there simply never shows up. */
export const TIP_PRODUCT_IDS = [
  "com.frangellcode.frangellboom.tip.small",
  "com.frangellcode.frangellboom.tip.medium",
  "com.frangellcode.frangellboom.tip.large",
];

export interface TipProduct {
  id: string;
  displayName: string;
  /** Already localized and in the person's own currency, straight from the
   *  App Store — never format a price here. */
  displayPrice: string;
}

export type TipStatus = "purchased" | "pending" | "cancelled";

interface TipJarPlugin {
  getProducts(options: { productIds: string[] }): Promise<{ products: TipProduct[] }>;
  purchase(options: { productId: string }): Promise<{ status: TipStatus }>;
}

/** ios/App/App/TipJarPlugin.swift. Native-only: gate every call on isNativeApp. */
export const TipJar = registerPlugin<TipJarPlugin>("TipJar");
