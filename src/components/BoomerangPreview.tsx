import { useRef, useState } from "react";
import { useLanguage, useT } from "../lib/i18n";
import { FadeText } from "./FadeText";
import { useBoomerangPreview } from "../hooks/useBoomerangPreview";
import type { Mode, Speed } from "../lib/boomerang";

interface BoomerangPreviewProps {
  videoUrl: string;
  start: number;
  duration: number;
  speed: Speed;
  mode: Mode;
}

export function BoomerangPreview({ videoUrl, start, duration, speed, mode }: BoomerangPreviewProps) {
  const t = useT();
  const lang = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  useBoomerangPreview(videoRef, { sourceKey: videoUrl, start, duration, speed, mode, playing });

  return (
    <div className="preview">
      <video ref={videoRef} src={videoUrl} className="preview__video" muted playsInline />
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
