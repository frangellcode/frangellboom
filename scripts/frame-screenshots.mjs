// Turns the raw app screenshots in docs/screenshots/{en,es} into App Store
// screenshots (1320x2868, iPhone 6.9"): a big headline and a subtitle above
// the app in a rounded phone frame, on the app's own dark plum. Same layout
// as PolarGrid's store screenshots, recoloured for Frangellboom. App Store
// Connect rejects transparency, so every file is flattened to RGB.
//
//   node scripts/frame-screenshots.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const W = 1320;
const H = 2868;

const SHOTS = {
  en: {
    folder: "English",
    items: [
      ["1-home", "1 Home", "Back-and-forth|video loops.", "No account. No uploads. No watermark."],
      ["2-trim", "2 Pick the moment", "Pick the|perfect moment.", "Up to 2 seconds of any video"],
      ["3-adjust", "3 Modes", "Five ways|to loop.", "Classic, Ease, Freeze, Pulse and Zoom"],
      ["4-processing", "4 Hardware", "Made on your|iPhone's chip.", "4K, 60 fps and HDR, in seconds"],
      ["5-result", "5 Result", "Ready to post.", "Full quality, straight to Photos"],
    ],
  },
  es: {
    folder: "Español",
    items: [
      ["1-home", "1 Inicio", "Bucles de video|de ida y vuelta.", "Sin cuenta. Sin subidas. Sin marca de agua."],
      ["2-trim", "2 Elige el momento", "Elige el|momento exacto.", "Hasta 2 segundos de cualquier video"],
      ["3-adjust", "3 Modos", "Cinco formas|de hacer bucles.", "Clásico, Suave, Pausa, Pulso y Zoom"],
      ["4-processing", "4 Hardware", "Hecho con el chip|de tu iPhone.", "4K, 60 fps y HDR, en segundos"],
      ["5-result", "5 Resultado", "Listo para publicar.", "Calidad máxima, directo a Fotos"],
    ],
  },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function frame(raw, out, title, subtitle) {
  const shotW = 1040;
  const shotH = Math.round((H * shotW) / W);
  const r = 118;
  const top = 610;
  const left = (W - shotW) / 2;
  const mask = Buffer.from(`<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="${r}" fill="#fff"/></svg>`);
  const shot = await sharp(raw).resize(shotW, shotH).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const lines = title.split("|");
  const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a1236"/><stop offset="1" stop-color="#12060f"/></linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.08" r="0.6"><stop offset="0" stop-color="#ff2e63" stop-opacity="0.35"/><stop offset="1" stop-color="#ff2e63" stop-opacity="0"/></radialGradient>
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${lines.map((l, i) => `<text x="${W / 2}" y="${215 + i * 118}" text-anchor="middle" font-family="Helvetica Neue" font-weight="700" font-size="104" fill="#ffffff" letter-spacing="-1">${esc(l)}</text>`).join("")}
    <text x="${W / 2}" y="${215 + lines.length * 118 + 20}" text-anchor="middle" font-family="Helvetica Neue" font-size="46" fill="#ffffff" fill-opacity="0.66">${esc(subtitle)}</text>
    <rect x="${left}" y="${top + 30}" width="${shotW}" height="${shotH}" rx="${r}" fill="#000" fill-opacity="0.55" filter="url(#s)"/>
    <rect x="${left - 14}" y="${top - 14}" width="${shotW + 28}" height="${shotH + 28}" rx="${r + 14}" fill="#0b0508"/>
    <rect x="${left - 14}" y="${top - 14}" width="${shotW + 28}" height="${shotH + 28}" rx="${r + 14}" fill="none" stroke="#8a2a55" stroke-width="3"/>
  </svg>`);
  await sharp(bg)
    .composite([{ input: shot, left, top }])
    .flatten({ background: "#12060f" })
    .removeAlpha()
    .png()
    .toFile(out);
}

for (const [lang, { folder, items }] of Object.entries(SHOTS)) {
  const dir = `docs/screenshots/app-store/${folder}`;
  await mkdir(dir, { recursive: true });
  for (const [raw, name, title, subtitle] of items) {
    await frame(`docs/screenshots/${lang}/${raw}.png`, `${dir}/${name}.png`, title, subtitle);
  }
}
