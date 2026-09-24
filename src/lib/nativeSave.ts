import { Share } from "@capacitor/share";

/** Opens the real iOS share sheet on the finished loop — "Save Video" lands
 *  it in Photos, and it can go straight to any other app from there. */
export async function shareVideoNatively(uri: string): Promise<"shared" | "dismissed" | "failed"> {
  try {
    await Share.share({ files: [uri] });
    return "shared";
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return "dismissed";
    return "failed";
  }
}
