import { Capacitor, registerPlugin } from "@capacitor/core";
import { writeToCache } from "./nativeFiles";
import type { Mode, Resolution, Speed } from "./boomerang";
import type { VideoSource } from "./videoSource";

interface PickedVideo {
  /** A URL the webview can stream the ORIGINAL file from. */
  webPath: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
}

interface VideoPickerPlugin {
  pick(): Promise<{ video?: PickedVideo }>;
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
export async function pickVideoNatively(): Promise<VideoSource | null> {
  const { video } = await VideoPicker.pick();
  if (!video) return null;
  return { name: video.name, url: video.webPath, data: video.webPath, path: video.path };
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
  "1440": 1440,
  "1080": 1080,
  "720": 720,
  "480": 480,
};

/** Builds the loop with AVFoundation on the phone's own video hardware: full
 *  source resolution, frame rate and colour (HDR included), without the
 *  webview's memory limits. */
export async function createLoopNatively(
  source: VideoSource,
  options: { start: number; duration: number; mode: Mode; speed: Speed; loops: number; resolution: Resolution },
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
