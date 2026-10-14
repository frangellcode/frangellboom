import { Capacitor, registerPlugin } from "@capacitor/core";
import { writeToCache } from "./nativeFiles";
import type { Mode, Resolution, Speed } from "./boomerang";
import type { VideoSource } from "./videoSource";
import { openPaywall } from "./pro";

interface PickedVideo {
  /** A URL the webview can stream the ORIGINAL file from. */
  webPath: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  /** The video inside a Live Photo (already made 9:16 if it was upright). */
  livePhoto?: boolean;
}

interface VideoPickerPlugin {
  pick(options?: { livePhotosOnly?: boolean }): Promise<{ video?: PickedVideo }>;
}

export interface NativeLook {
  /** buildLut's table, base64 (see lutBase64). */
  lut: string;
  size: number;
  grain: number;
  vignette: number;
}

interface RenderedFile {
  /** file:// URI, for the share sheet. */
  uri: string;
  /** What the webview plays it from. */
  webPath: string;
}

interface LoopEnginePlugin {
  create(options: {
    path: string;
    start: number;
    duration: number;
    mode: Mode;
    speed: Speed;
    loops: number;
    shortSide?: number;
    /** The free version's mark in the corner (see Watermark in LoopEnginePlugin.swift). */
    watermark?: boolean;
    /** A film look: its colour table from looks.ts, and its grain and vignette. */
    look?: NativeLook;
  }): Promise<RenderedFile>;
  preview(options: { path: string; start: number; duration: number }): Promise<RenderedFile>;
  addListener(event: "progress", listener: (data: { fraction: number }) => void): Promise<{ remove(): Promise<void> }>;
}

/** ios/App/App/VideoPickerPlugin.swift */
const VideoPicker = registerPlugin<VideoPickerPlugin>("VideoPicker");
/** ios/App/App/LoopEnginePlugin.swift */
const LoopEngine = registerPlugin<LoopEnginePlugin>("LoopEngine");

/** Opens the iOS video picker. Nothing is read into memory here — the video
 *  stays on disk, streamed by URL to the <video> elements and read directly
 *  by the native engine. Cancelling resolves to null. */
export async function pickVideoNatively(livePhotosOnly = false): Promise<VideoSource | null> {
  const { video } = await VideoPicker.pick({ livePhotosOnly });
  if (!video) return null;
  return { name: video.name, url: video.webPath, data: video.webPath, path: video.path, livePhoto: video.livePhoto };
}

interface CameraPlugin {
  record(options: { maxDuration: number; hint: string; pro: boolean; slowMotion?: boolean }): Promise<{
    video?: { webPath: string; path: string; name: string; slowMotion?: boolean };
    /** A Pro extra was tapped without Pro: the camera closed for the Pro sheet. */
    paywall?: boolean;
  }>;
  close(): Promise<void>;
}

/** ios/App/App/CameraPlugin.swift */
const Camera = registerPlugin<CameraPlugin>("Camera");

/** Longest clip the camera records, as Instagram's boomerang does: 0.75 s,
 *  which in slow motion is a 3 s there-and-back played four times (12 s),
 *  and at normal speed 1.5 s eight times. A recording is the whole segment,
 *  so it goes straight to shaping the loop, no trimming. */
export const MAX_RECORDING_SECONDS = 0.75;

/** Opens the app's own camera. Resolves to null if the person closes it
 *  without recording; rejects with code "DENIED" when camera access is off.
 *  After a recording the camera stays up until closeCameraNatively(). */
export async function recordVideoNatively(hint: string, pro: boolean, slowMotion = false): Promise<VideoSource | null> {
  const { video, paywall } = await Camera.record({ maxDuration: MAX_RECORDING_SECONDS, hint, pro, slowMotion });
  if (paywall) openPaywall();
  if (!video) return null;
  return { name: video.name, url: video.webPath, data: video.webPath, path: video.path, slowMotion: video.slowMotion };
}

/** Fades the camera away — call once the screen that follows is in place. */
export async function closeCameraNatively(): Promise<void> {
  await Camera.close();
}

/** A video that reached the app as a File (not through the picker) has to be
 *  on disk for the native engine to read it. */
export async function importFileNatively(file: File): Promise<VideoSource> {
  const uri = await writeToCache(file, `imported/${Date.now()}-${file.name}`);
  const url = Capacitor.convertFileSrc(uri);
  return { name: file.name, url, data: url, path: new URL(uri).pathname };
}

const SHORT_SIDE: Record<Resolution, number | undefined> = {
  original: undefined,
  "2160": 2160,
  "1440": 1440,
  "1080": 1080,
};

/** Builds the loop with AVFoundation on the phone's own video hardware: full
 *  source resolution, frame rate and colour (HDR included), without the
 *  webview's memory limits. */
export async function createLoopNatively(
  source: VideoSource,
  options: {
    start: number;
    duration: number;
    mode: Mode;
    speed: Speed;
    loops: number;
    resolution: Resolution;
    watermark: boolean;
    look?: NativeLook;
  },
  onProgress: (fraction: number) => void,
): Promise<RenderedFile> {
  if (!source.path) throw new Error("The video isn't on disk.");
  const listener = await LoopEngine.addListener("progress", ({ fraction }) => onProgress(Math.min(fraction, 0.99)));
  try {
    return await LoopEngine.create({
      path: source.path,
      start: options.start,
      duration: options.duration,
      mode: options.mode,
      speed: options.speed,
      loops: options.loops,
      shortSide: SHORT_SIDE[options.resolution],
      watermark: options.watermark,
      look: options.look,
    });
  } finally {
    await listener.remove();
  }
}

/** The small all-keyframe clip the live preview scrubs through. */
export async function createPreviewNatively(source: VideoSource, start: number, duration: number): Promise<string> {
  if (!source.path) throw new Error("The video isn't on disk.");
  const { webPath } = await LoopEngine.preview({ path: source.path, start, duration });
  return webPath;
}
