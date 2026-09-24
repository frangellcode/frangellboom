import { useCallback, useEffect, useState } from "react";
import { useLanguage, useT } from "../lib/i18n";
import { FadeText } from "./FadeText";
import { Confetti } from "./Confetti";
import { isNativeApp } from "../lib/native";
import { shareVideoNatively } from "../lib/nativeSave";

/** A finished loop: rendered by ffmpeg.wasm into memory on the web, or by the
 *  native engine into a file on disk in the iOS app. */
export type LoopResult = { blob: Blob } | { url: string; uri: string };

interface ResultViewProps {
  result: LoopResult;
  onReset: () => void;
}

// Matches the .result--leaving transition duration in App.css — gives the
// fade-out time to actually play before onReset swaps the whole screen out
// from under it, instead of "Crear otro" cutting straight back to "upload".
const LEAVE_MS = 250;

export function ResultView({ result, onReset }: ResultViewProps) {
  const t = useT();
  const lang = useLanguage();
  // Create and revoke the object URL inside the same effect (rather than a
  // useMemo + separate cleanup effect) so React StrictMode's dev-only
  // mount→cleanup→remount doesn't revoke a URL that never gets recreated —
  // that mismatch was leaving `url` pointing at a dead blob in dev mode.
  const [url, setUrl] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!("blob" in result)) {
      setUrl(result.url);
      return;
    }
    const objectUrl = URL.createObjectURL(result.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [result]);

  // The iOS app saves through the share sheet, straight from the file the
  // native engine wrote.
  const [saveFailed, setSaveFailed] = useState(false);
  const handleNativeSave = useCallback(async () => {
    if ("blob" in result) return;
    setSaveFailed(false);
    if ((await shareVideoNatively(result.uri)) === "failed") setSaveFailed(true);
  }, [result]);

  const handleReset = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onReset, LEAVE_MS);
  }, [onReset]);

  if (!url) return null;

  return (
    <div className={`result${leaving ? " result--leaving" : ""}`}>
      <Confetti />
      <p className="result__headline"><FadeText value={t.ready} trigger={lang} /></p>
      <video src={url} className="result__video" autoPlay loop muted playsInline controls />
      <div className="result__actions">
        {isNativeApp ? (
          <button type="button" className="btn btn--primary" onClick={handleNativeSave}>
            <FadeText value={t.save} trigger={lang} />
          </button>
        ) : (
          <a className="btn btn--primary" href={url} download="frangellboom.mp4">
            <FadeText value={t.download} trigger={lang} />
          </a>
        )}
        <button type="button" className="btn btn--ghost" onClick={handleReset}>
          <FadeText value={t.another} trigger={lang} />
        </button>
      </div>
      {saveFailed && <p className="app__error"><FadeText value={t.saveFailed} trigger={lang} /></p>}
    </div>
  );
}
