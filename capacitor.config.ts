import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.frangellcode.frangellboom",
  appName: "Frangellboom",
  webDir: "dist",
  // The darker brand pink body falls back to (see index.css) — the webview
  // never flashes white behind the gradient while the bundle loads.
  backgroundColor: "#991c3b",
  ios: {
    // The Xcode project FILE has to stay App.xcodeproj (the Capacitor CLI looks
    // for that name), but its target and scheme are Frangellboom.
    scheme: "Frangellboom",
    // The header and main area already pad themselves with
    // env(safe-area-inset-*), exactly as the installed PWA does — letting iOS
    // inset the webview too would double it.
    contentInset: "never",
    // Only .app__main scrolls; without this the whole UI rubber-bands like a
    // web page, the tell-tale sign of a wrapped website.
    scrollEnabled: false,
    backgroundColor: "#991c3b",
  },
};

export default config;
