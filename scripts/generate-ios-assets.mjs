// Renders the app icon and launch image from the home screen's own look: the
// cloud sky (src/assets/sky.jpg, see scripts/generate-sky.py) with the glass
// arc floating in it. App Store Connect rejects an icon with an alpha
// channel, so every icon is flattened.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const ios = "ios/App/App/Assets.xcassets";
const SKY = "src/assets/sky.jpg";

// The same glass arc as the home screen (VideoUploader.tsx, GlassArc):
// a frosted body, a rim light along the top and a bright streak.
const glass = (size) => {
  const s = size / 240;
  const arc = "M40,150 C40,86 76,30 120,30 C164,30 200,86 200,150";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-40 -40 320 320">
    <defs><filter id="soft"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
    <g transform="translate(0,30)">
      <path d="${arc}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="36" stroke-linecap="round"/>
      <path d="${arc}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="${1.6 / s * 2}" stroke-linecap="round" transform="translate(0,-16)" opacity="0.85"/>
      <path d="M58,104 C68,66 92,42 120,40" fill="none" stroke="rgba(255,255,255,0.97)" stroke-width="6" stroke-linecap="round" filter="url(#soft)"/>
    </g>
  </svg>`);
};

// A square of sky around the upper clouds, where the home screen's arc sits.
async function icon(size, out) {
  const meta = await sharp(SKY).metadata();
  const side = meta.width;
  const sky = await sharp(SKY).extract({ left: 0, top: Math.round(meta.height * 0.02), width: side, height: side }).resize(size, size).toBuffer();
  await sharp(sky).composite([{ input: glass(size) }]).flatten().removeAlpha().png().toFile(out);
}

await mkdir(`${ios}/AppIcon.appiconset`, { recursive: true });
await icon(1024, `${ios}/AppIcon.appiconset/AppIcon-1024.png`);
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

// The launch screen is the home screen's sky, framed exactly as the home
// screen's first frame, so the intro animation picks up from it without a
// jump. (The asset is named LaunchSky, not Splash: iOS caches launch screens,
// and a new name makes it drop the old one.)
await mkdir(`${ios}/LaunchSky.imageset`, { recursive: true });
await sharp(SKY).resize(1320, 2868, { fit: "cover" }).png().toFile(`${ios}/LaunchSky.imageset/splash.png`);
await writeFile(
  `${ios}/LaunchSky.imageset/Contents.json`,
  JSON.stringify(
    { images: [{ idiom: "universal", filename: "splash.png", scale: "1x" }], info: { author: "xcode", version: 1 } },
    null,
    2,
  ) + "\n",
);

// The web app's icons, from the same render.
for (const [file, size] of [["public/pwa-192.png", 192], ["public/pwa-512.png", 512], ["public/apple-touch-icon.png", 180], ["public/favicon-32.png", 32]]) {
  await icon(size, file);
}
