import { useRef, useState } from "react";
import { useLanguage, useT } from "../lib/i18n";
import { FadeText } from "./FadeText";
import { useBoomerangPreview } from "../hooks/useBoomerangPreview";
import { useSheetOnScreen } from "../lib/pro";
import type { Mode, Speed } from "../lib/boomerang";

interface BoomerangPreviewProps {
  videoUrl: string;
  /** Width / height, known before the video loads (see probeVideo). */
  aspect: number;
  /** Fade the video in once it has a frame (off when it loads out of sight). */
  fadeIn?: boolean;
  /** Called once the video has its first frame. */
  onShown?: () => void;
  start: number;
  duration: number;
  speed: Speed;
  mode: Mode;
}

export function BoomerangPreview({ videoUrl, aspect, fadeIn = true, onShown, start, duration, speed, mode }: BoomerangPreviewProps) {
  const t = useT();
  const lang = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);

  // Rests while the Pro sheet is up (it's covered anyway): seeking the video
  // every frame underneath made the sheet's own animation stutter.
  const sheetOnScreen = useSheetOnScreen();

  useBoomerangPreview(videoRef, { sourceKey: videoUrl, start, duration, speed, mode, playing: playing && !sheetOnScreen });

  return (
    <div className="preview">
      <video
        ref={videoRef}
        src={videoUrl}
        className={`preview__video${fadeIn ? " video-fade" : ""}${fadeIn && ready ? " video-fade--ready" : ""}`}
        style={{ aspectRatio: aspect }}
        muted
        playsInline
        onLoadedData={() => {
          setReady(true);
          onShown?.();
        }}
      />
      <span className="preview__live-badge"><FadeText value={t.live} trigger={lang} /></span>
      <button
        type="button"
        className="preview__toggle"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? t.pausePreview : t.playPreview}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
            <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z" fill="currentColor" />
          </svg>
        )}
      </button>
    </div>
  );
}
