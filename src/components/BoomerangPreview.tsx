import { useRef, useState } from "react";
import { useT } from "../lib/i18n";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  useBoomerangPreview(videoRef, { sourceKey: videoUrl, start, duration, speed, mode, playing });

  return (
    <div className="preview">
      <video ref={videoRef} src={videoUrl} className="preview__video" muted playsInline />
      <span className="preview__live-badge">{t.live}</span>
      <button
        type="button"
        className="preview__toggle"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? t.pausePreview : t.playPreview}
      >
        {playing ? "⏸" : "▶"}
      </button>
    </div>
  );
}
