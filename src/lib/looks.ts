/**
 * Film looks (Pro): the same "Retro" styles as PolarGrid, number for number
 * (polargrid/src/lib/adjustments.ts — RETRO_PRESETS and its per-pixel pass).
 *
 * A look's colour work only depends on each pixel's own colour, so it's
 * baked once into a 3D colour table (a LUT). That one table is what both the
 * live preview (WebGL, see LookCanvas) and the export (Core Image's colour
 * cube, see FrameEffects in LoopEnginePlugin.swift) apply — the two can't
 * drift apart. Grain and vignette depend on position, so they're drawn
 * separately on both sides from the numbers here.
 */

type Rgb = [number, number, number];

type ToneKey =
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "temperature"
  | "tint"
  | "vibrance"
  | "saturation";

interface LookPreset {
  id: LookId;
  tone: Partial<Record<ToneKey, number>>;
  /** Lifts the black point, 0..~0.15. */
  fade?: number;
  /** Black and white. */
  mono?: boolean;
  /** Split toning: colour pushed into the shadows / highlights. */
  shadowTint?: Rgb;
  highlightTint?: Rgb;
  tintStrength?: number;
  /** Per-channel film curves: lift + (gain − lift) · c^gamma. */
  curves?: { lift?: Rgb; gamma?: Rgb; gain?: Rgb };
  /** Film grain and vignette, 0..1. */
  grain?: number;
  vignette?: number;
}

export type LookId =
  | "retrato"
  | "vivido"
  | "verde"
  | "pastel"
  | "cruzado"
  | "noir"
  | "plata"
  | "niebla"
  | "atardecer"
  | "menta"
  | "verano";

// Named for a feeling rather than a camera or film maker on purpose: brand
// names are other companies' trademarks (App Review guideline 5.2.1).
const PRESETS: LookPreset[] = [
  {
    // Portrait colour negative: warm skin, soft contrast, peach highlights.
    id: "retrato",
    tone: { temperature: 0.12, contrast: -0.08, saturation: -0.1, vibrance: 0.1, highlights: -0.1 },
    curves: { lift: [0.03, 0.02, 0.04], gamma: [0.95, 1, 1.05] },
    highlightTint: [1, 0.85, 0.7],
    tintStrength: 0.25,
    fade: 0.03,
    grain: 0.2,
    vignette: 0.15,
  },
  {
    // Fine-grain vivid colour: punchy, saturated, deep blacks.
    id: "vivido",
    tone: { vibrance: 0.5, contrast: 0.22, saturation: 0.15, blacks: -0.08 },
    curves: { gamma: [0.97, 1, 1.03] },
    vignette: 0.12,
  },
  {
    // Consumer 400 film with its green cast in the shadows.
    id: "verde",
    tone: { tint: -0.15, contrast: 0.1, saturation: -0.05 },
    curves: { lift: [0, 0.03, 0.04], gamma: [1.03, 0.97, 1] },
    shadowTint: [0.25, 0.45, 0.35],
    tintStrength: 0.3,
    grain: 0.3,
    vignette: 0.18,
  },
  {
    // Bright, soft, faded, mint-and-teal pastel.
    id: "pastel",
    tone: { contrast: -0.2, temperature: -0.05, tint: -0.05, saturation: -0.1, exposure: 0.08 },
    fade: 0.07,
    shadowTint: [0.3, 0.5, 0.45],
    highlightTint: [0.9, 1, 0.92],
    tintStrength: 0.3,
  },
  {
    // Cross-processed slide film: yellow-green highlights, blue shadows.
    id: "cruzado",
    tone: { contrast: 0.25, saturation: 0.2 },
    curves: { lift: [0, 0, 0.08], gamma: [0.85, 0.95, 1.25], gain: [1, 1, 0.85] },
    vignette: 0.3,
  },
  {
    // Punchy black and white with deep blacks.
    id: "noir",
    tone: { contrast: 0.5, blacks: -0.25, highlights: 0.1 },
    mono: true,
    grain: 0.3,
    vignette: 0.4,
  },
  {
    // Classic 400-speed black and white: open shadows, heavy grain.
    id: "plata",
    tone: { contrast: 0.25, shadows: 0.1 },
    mono: true,
    grain: 0.5,
    vignette: 0.2,
  },
  {
    // Soft, faded black and white.
    id: "niebla",
    tone: { contrast: -0.15, highlights: -0.1 },
    mono: true,
    fade: 0.1,
    grain: 0.25,
    vignette: 0.15,
  },
  {
    // Golden-hour warmth with rosy highlights.
    id: "atardecer",
    tone: { temperature: 0.25, tint: 0.1, contrast: 0.05 },
    curves: { gain: [1, 0.93, 0.85] },
    highlightTint: [1, 0.65, 0.55],
    tintStrength: 0.35,
    fade: 0.05,
    vignette: 0.25,
  },
  {
    // 80s mint: green-leaning, gently faded.
    id: "menta",
    tone: { tint: -0.2, temperature: -0.1, contrast: -0.05 },
    curves: { gamma: [1.05, 0.95, 1] },
    fade: 0.06,
    highlightTint: [0.8, 1, 0.9],
    tintStrength: 0.3,
  },
  {
    // 90s drugstore film: warm, vivid, a little grain.
    id: "verano",
    tone: { vibrance: 0.35, temperature: 0.2, highlights: -0.15 },
    curves: { gamma: [0.94, 0.98, 1.1] },
    fade: 0.04,
    grain: 0.25,
    vignette: 0.15,
  },
];

export const LOOK_IDS: readonly LookId[] = PRESETS.map((p) => p.id);

function preset(id: LookId): LookPreset {
  return PRESETS.find((p) => p.id === id)!;
}

/** What's drawn on top of the colour, scaled by the look's strength. */
export function lookOverlays(id: LookId, amount: number): { grain: number; vignette: number } {
  const p = preset(id);
  return { grain: (p.grain ?? 0) * amount, vignette: (p.vignette ?? 0) * amount };
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0 ? 0 : c >= 1 ? 1 : c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
/** Peak of L·(1−L)³, so the shadow and highlight bumps top out at exactly 1. */
const BUMP_PEAK = 0.25 * 0.75 ** 3;

/** The look applied to one sRGB colour (0..1 channels), as PolarGrid's runPass. */
function makeTransform(p: LookPreset, amount: number): (rgb: Rgb) => Rgb {
  const v = (k: ToneKey) => p.tone[k] ?? 0;
  const gain = 2 ** (v("exposure") * 2);
  const rGain = gain * (1 + v("temperature") * 0.3) * (1 + v("tint") * 0.12);
  const gGain = gain * (1 - v("tint") * 0.25);
  const bGain = gain * (1 - v("temperature") * 0.3) * (1 + v("tint") * 0.12);
  const linear = v("exposure") !== 0 || v("temperature") !== 0 || v("tint") !== 0;
  const contrast = 1 + v("contrast") * (v("contrast") > 0 ? 0.8 : 0.6);
  const curve = (l: number) =>
    0.5 +
    (l - 0.5) * contrast +
    v("shadows") * 0.3 * ((l * (1 - l) ** 3) / BUMP_PEAK) +
    v("highlights") * 0.3 * ((l ** 3 * (1 - l)) / BUMP_PEAK) +
    v("whites") * 0.25 * l ** 3 +
    v("blacks") * 0.25 * (1 - l) ** 3;
  const saturation = 1 + v("saturation");
  const vibrance = v("vibrance");
  const lift = p.curves?.lift ?? [0, 0, 0];
  const gamma = p.curves?.gamma ?? [1, 1, 1];
  const gainC = p.curves?.gain ?? [1, 1, 1];
  const shadowTint = p.shadowTint ?? [0.5, 0.5, 0.5];
  const highlightTint = p.highlightTint ?? [0.5, 0.5, 0.5];
  const tintStrength = p.tintStrength ?? 0;
  const fade = p.fade ?? 0;
  const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const clamp = (c: number) => (c <= 0 ? 0 : c >= 1 ? 1 : c);

  return ([r0, g0, b0]) => {
    let r = r0;
    let g = g0;
    let b = b0;
    if (linear) {
      r = toSrgb(toLinear(r) * rGain);
      g = toSrgb(toLinear(g) * gGain);
      b = toSrgb(toLinear(b) * bGain);
    }
    // Tone on luminance, shifting all three channels alike to keep the hue.
    {
      const l = lum(r, g, b);
      const delta = curve(clamp(l)) - l;
      r += delta;
      g += delta;
      b += delta;
    }
    if (saturation !== 1 || vibrance !== 0 || p.mono) {
      const l = lum(r, g, b);
      let k = p.mono ? 0 : saturation;
      if (!p.mono && vibrance !== 0) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        k *= 1 + vibrance * (vibrance > 0 ? 1 - (max - min) : 1);
      }
      r = l + (r - l) * k;
      g = l + (g - l) * k;
      b = l + (b - l) * k;
    }
    if (p.curves) {
      r = lift[0] + (gainC[0] - lift[0]) * clamp(r) ** gamma[0];
      g = lift[1] + (gainC[1] - lift[1]) * clamp(g) ** gamma[1];
      b = lift[2] + (gainC[2] - lift[2]) * clamp(b) ** gamma[2];
    }
    if (tintStrength) {
      const l = clamp(lum(r, g, b));
      const ws = (1 - l) * (1 - l) * tintStrength;
      const wh = l * l * tintStrength;
      r += (shadowTint[0] - 0.5) * ws + (highlightTint[0] - 0.5) * wh;
      g += (shadowTint[1] - 0.5) * ws + (highlightTint[1] - 0.5) * wh;
      b += (shadowTint[2] - 0.5) * ws + (highlightTint[2] - 0.5) * wh;
    }
    if (fade > 0) {
      const span = 1 - fade * 1.4;
      r = fade + r * span;
      g = fade + g * span;
      b = fade + b * span;
    }
    return [clamp(r0 + (r - r0) * amount), clamp(g0 + (g - g0) * amount), clamp(b0 + (b - b0) * amount)];
  };
}

/** Points per side of the colour table. */
export const LUT_SIZE = 33;

/**
 * The look's colour table: LUT_SIZE³ RGBA entries, red varying fastest, then
 * green, then blue — the order Core Image's colour cube and a WebGL 3D
 * texture both expect. Input and output are sRGB-encoded.
 */
export function buildLut(id: LookId, amount: number): Float32Array {
  const transform = makeTransform(preset(id), amount);
  const n = LUT_SIZE;
  const data = new Float32Array(n * n * n * 4);
  let i = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const [or, og, ob] = transform([r / (n - 1), g / (n - 1), b / (n - 1)]);
        data[i++] = or;
        data[i++] = og;
        data[i++] = ob;
        data[i++] = 1;
      }
    }
  }
  return data;
}

/** The table as base64 (its float32 bytes), to hand to the native engine. */
export function lutBase64(lut: Float32Array): string {
  const bytes = new Uint8Array(lut.buffer, lut.byteOffset, lut.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
