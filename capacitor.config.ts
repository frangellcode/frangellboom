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
  // Live reload for development only (npm run ios:dev): the app loads the
  // Vite dev server on this Mac instead of its bundled files. Set only while
  // syncing from that script — a build synced without it (npm run ios) goes
  // back to the bundled files, which is the only thing that may ship.
  ...(process.env.CAP_LIVE_URL ? { server: { url: process.env.CAP_LIVE_URL, cleartext: true } } : {}),
};

export default config;
