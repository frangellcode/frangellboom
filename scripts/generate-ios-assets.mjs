// Renders the iOS app icon and launch image from the same sources the web app
// uses. App Store Connect rejects an icon with an alpha channel, so the icon
// is flattened onto an opaque background.
import sharp from "sharp";
import { copyFile, mkdir, writeFile } from "node:fs/promises";

const ios = "ios/App/App/Assets.xcassets";

await mkdir(`${ios}/AppIcon.appiconset`, { recursive: true });
await sharp("design/icon-source.svg", { density: 1024 })
  .resize(1024, 1024)
  .flatten({ background: "#ff2e63" })
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

// The launch screen shows the same gradient the PWA's splash screens do, so
// the app opens straight into its own background.
await mkdir(`${ios}/Splash.imageset`, { recursive: true });
await copyFile("public/splash/splash-440x956@3x.png", `${ios}/Splash.imageset/splash.png`);
await writeFile(
  `${ios}/Splash.imageset/Contents.json`,
  JSON.stringify(
    { images: [{ idiom: "universal", filename: "splash.png", scale: "1x" }], info: { author: "xcode", version: 1 } },
    null,
    2,
  ) + "\n",
);
