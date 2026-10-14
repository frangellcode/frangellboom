import { useEffect, useRef, useState } from "react";
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useFrameEffect(videoRef, canvasRef, mode);

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
      {(mode === "echo" || mode === "mirror") && <canvas ref={canvasRef} className="preview__effect" aria-hidden="true" />}
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

/** Echo: how much of the trail each new frame keeps — as in LoopEnginePlugin.swift. */
const ECHO_TRAIL = 0.55;

/**
 * Echo and mirror change the picture itself, which a <video> can't show: a
 * canvas over it redraws every frame the preview seeks to — mirror as the
 * left half and its reflection, echo over a fading copy of the frames
 * before, like the export.
 */
function useFrameEffect(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  mode: Mode,
) {
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !ctx || (mode !== "echo" && mode !== "mirror")) return;
    let first = true;

    const draw = () => {
      const { videoWidth: vw, videoHeight: vh } = video;
      if (!vw || !vh) return;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * scale);
      const height = Math.round(canvas.clientHeight * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        first = true;
      }
      // Where the video's picture sits in its box (object-fit: contain).
      const fit = Math.min(width / vw, height / vh);
      const w = vw * fit;
      const h = vh * fit;
      const x = (width - w) / 2;
      const y = (height - h) / 2;
      if (mode === "mirror") {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(video, x, y, w, h);
        ctx.save();
        ctx.translate(x + w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, vw / 2, vh, 0, y, w / 2, h);
        ctx.restore();
      } else {
        ctx.globalAlpha = first ? 1 : 1 - ECHO_TRAIL;
        ctx.drawImage(video, x, y, w, h);
        ctx.globalAlpha = 1;
      }
      first = false;
    };
    video.addEventListener("seeked", draw);
    video.addEventListener("loadeddata", draw);
    draw();
    return () => {
      video.removeEventListener("seeked", draw);
      video.removeEventListener("loadeddata", draw);
    };
  }, [videoRef, canvasRef, mode]);
}
