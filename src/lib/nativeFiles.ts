import { Directory, Filesystem } from "@capacitor/filesystem";

/** Bytes per trip across the native bridge. A multiple of 3, so every chunk
 *  base64-encodes on its own with no padding in the middle of the file — the
 *  appended pieces then decode back to exactly the original bytes. Chunking
 *  keeps a large file from turning into one giant base64 string at once. */
const CHUNK_BYTES = 6 * 1024 * 1024;

/** Base64 through FileReader, which WebKit does natively — much faster than
 *  building the string byte by byte in JavaScript. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Writes a blob into the app's cache and returns its file:// URI. */
export async function writeToCache(blob: Blob, path: string): Promise<string> {
  const { uri } = await Filesystem.writeFile({
    path,
    data: await toBase64(blob.slice(0, CHUNK_BYTES)),
    directory: Directory.Cache,
    recursive: true,
  });
  for (let offset = CHUNK_BYTES; offset < blob.size; offset += CHUNK_BYTES) {
    await Filesystem.appendFile({
      path,
      data: await toBase64(blob.slice(offset, offset + CHUNK_BYTES)),
      directory: Directory.Cache,
    });
  }
  return uri;
}
