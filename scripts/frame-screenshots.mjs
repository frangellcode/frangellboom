// Turns the raw app screenshots in docs/screenshots/{en,es} into App Store
// screenshots (1320x2868, iPhone 6.9"): a big headline and a subtitle above
// the app in a rounded phone frame, on the home screen's own sky
// (src/assets/sky.jpg). Same layout as PolarGrid's store screenshots. App Store
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
      ["1-home", "1 Home", "Back-and-forth|video loops.", "No account. No uploads. All on your iPhone."],
      ["2-trim", "2 Pick the moment", "Pick the|perfect moment.", "Up to 2 seconds of any video"],
      ["3-modes", "3 Modes", "Nine ways|to loop.", "Mirror, Echo, Bounce, Ramp and more"],
      ["4-looks", "4 Looks", "Give it a|film look.", "11 styles, live as you watch"],
      ["5-result", "5 Result", "Ready to post.", "Up to 4K, straight to Photos"],
    ],
  },
  es: {
    folder: "Español",
    items: [
      ["1-home", "1 Inicio", "Bucles de video|de ida y vuelta.", "Sin cuenta. Sin subidas. Todo en tu iPhone."],
      ["2-trim", "2 Elige el momento", "Elige el|momento exacto.", "Hasta 2 segundos de cualquier video"],
      ["3-modes", "3 Modos", "Nueve formas|de hacer bucles.", "Espejo, Eco, Rebote, Rampa y más"],
      ["4-looks", "4 Estilos", "Dale un|look de cine.", "11 estilos, en vivo mientras lo ves"],
      ["5-result", "5 Resultado", "Listo para publicar.", "Hasta 4K, directo a Fotos"],
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
  const ink = "#1b1b1b";
  const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="0.25" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#haze)"/>
    ${lines.map((l, i) => `<text x="${W / 2}" y="${215 + i * 118}" text-anchor="middle" font-family="Helvetica Neue" font-weight="700" font-size="104" fill="${ink}" letter-spacing="-1">${esc(l)}</text>`).join("")}
    <text x="${W / 2}" y="${215 + lines.length * 118 + 20}" text-anchor="middle" font-family="Helvetica Neue" font-size="46" fill="${ink}" fill-opacity="0.7">${esc(subtitle)}</text>
    <rect x="${left}" y="${top + 30}" width="${shotW}" height="${shotH}" rx="${r}" fill="#1b2a40" fill-opacity="0.45" filter="url(#s)"/>
    <rect x="${left - 14}" y="${top - 14}" width="${shotW + 28}" height="${shotH + 28}" rx="${r + 14}" fill="#0b0b0d"/>
    <rect x="${left - 14}" y="${top - 14}" width="${shotW + 28}" height="${shotH + 28}" rx="${r + 14}" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="3"/>
  </svg>`);
  await sharp("src/assets/sky.jpg")
    .resize(W, H, { fit: "cover" })
    .composite([{ input: overlay }, { input: shot, left, top }])
    .flatten({ background: "#ffffff" })
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
