import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
// `--mode ios` builds the bundle the iOS app ships (see capacitor.config.ts):
// the app builds loops natively, so the ~32 MB ffmpeg-core is left out, and it
// is updated through the App Store, so there's no service worker either.
export default defineConfig(({ mode }) => {
  const ios = mode === "ios";
  return {
    // Relative, so the same build works on GitHub Pages (/frangellboom/) and
    // inside the iOS app, which serves it from capacitor://localhost/.
    base: "./",
    // Pinned to 5174, not the vite default 5173 — another local project on
    // this machine owns 5173. strictPort so a collision fails loudly instead
    // of silently drifting onto some other port.
    server: {
      port: 5174,
      strictPort: true,
    },
    plugins: [
      react(),
      // Self-host ffmpeg-core so the app has zero third-party runtime
      // dependencies (no CDN calls) and works fully offline once installed.
      !ios &&
      viteStaticCopy({
        targets: [
          // ESM build: @ffmpeg/ffmpeg's worker runs as a module worker, which
          // can't use importScripts() and instead dynamically imports the
          // core, so it needs a real `export default` (the UMD build doesn't
          // have one and fails with "failed to import ffmpeg-core.js").
          {
            src: "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js",
            dest: "ffmpeg",
            rename: { stripBase: true },
          },
          {
            src: "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm",
            dest: "ffmpeg",
            rename: { stripBase: true },
          },
        ],
      }),
      VitePWA({
        // Still loaded in the iOS build (disabled), so `virtual:pwa-register`
        // resolves; main.tsx never calls it there.
        disable: ios,
        registerType: "autoUpdate",
        // Registered manually in main.tsx instead (with a periodic update
        // check) — the default injected script only ever checks for a new
        // service worker on a cold page load, which an installed PWA opened
        // from its home-screen icon almost never does. Without polling, a
        // phone can stay pinned to a stale cached build indefinitely even
        // while every other client is already on the latest code.
        injectRegister: false,
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        manifest: {
          name: "frangellboom",
          short_name: "frangellboom",
          description: "Crea boomerangs a partir de tus propios videos, sin límites de Instagram.",
          lang: "es",
          theme_color: "#0b0b10",
          background_color: "#0b0b10",
          display: "standalone",
          orientation: "portrait",
          start_url: "./",
          scope: "./",
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // The ffmpeg-core wasm is ~30MB; raise the default 2MB precache limit
          // so it's cached for offline use instead of being skipped.
          maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,svg,png,wasm}"],
        },
      }),
    ],
  };
});
