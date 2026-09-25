// Renders the iOS app icon and launch image from the same sources the web app
// uses. App Store Connect rejects an icon with an alpha channel, so the icon
// is flattened onto an opaque background.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const ios = "ios/App/App/Assets.xcassets";

await mkdir(`${ios}/AppIcon.appiconset`, { recursive: true });
await sharp("design/icon-source.svg", { density: 1024 })
  .resize(1024, 1024)
  .flatten({ background: "#b84b30" })
  .removeAlpha()
  .png()
  .toFile(`${ios}/AppIcon.appiconset/AppIcon-1024.png`);
await writeFile(
  `${ios}/AppIcon.appiconset/Contents.json`,
  JSON.stringify(
    {
      images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
      info: { author: "xcode", version: 1 },
    },
    null,
    2,
  ) + "\n",
);

// The launch screen is the flat terracotta the app opens onto.
await mkdir(`${ios}/Splash.imageset`, { recursive: true });
await sharp({ create: { width: 1320, height: 2868, channels: 3, background: "#b84b30" } })
  .png()
  .toFile(`${ios}/Splash.imageset/splash.png`);

// The web app's icons, from the same source.
for (const [file, size] of [["public/pwa-192.png", 192], ["public/pwa-512.png", 512], ["public/apple-touch-icon.png", 180], ["public/favicon-32.png", 32]]) {
  await sharp("design/icon-source.svg", { density: 1024 }).resize(size, size).png().toFile(file);
}
await writeFile(
  `${ios}/Splash.imageset/Contents.json`,
  JSON.stringify(
    { images: [{ idiom: "universal", filename: "splash.png", scale: "1x" }], info: { author: "xcode", version: 1 } },
    null,
    2,
  ) + "\n",
);
