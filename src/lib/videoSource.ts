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
