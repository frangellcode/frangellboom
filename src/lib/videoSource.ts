/** A video to work from: a File picked on the web, or a file on disk that the
 *  iOS picker copied into the app's cache. */
export interface VideoSource {
  name: string;
  /** What the <video> elements play. */
  url: string;
  /** What ffmpeg reads the bytes from on the web (see @ffmpeg/util fetchFile). */
  data: File | string;
  /** iOS app only: the file on disk the native engine reads. */
  path?: string;
}

/**
 * The video's shape (width / height, as displayed), read from its metadata
 * alone. The trimmer and the preview lay out a box of that shape before the
 * video has loaded — otherwise everything under it jumped down the moment it
 * arrived. Null if the metadata doesn't come in time.
 */
export function probeAspect(url: string, timeoutMs = 2500): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const done = (aspect: number | null) => {
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(aspect);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    video.muted = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => done(video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
