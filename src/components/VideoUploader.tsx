import { useCallback, useRef, useState } from "react";
import { useLanguage, useT } from "../lib/i18n";
import { FadeText } from "./FadeText";
import { isNativeApp } from "../lib/native";
import { importFileNatively, pickVideoNatively } from "../lib/nativeVideo";
import type { VideoSource } from "../lib/videoSource";

interface VideoUploaderProps {
  onSelect: (source: VideoSource) => void;
  error?: string | null;
}

export function VideoUploader({ onSelect, error }: VideoUploaderProps) {
  const t = useT();
  const lang = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file || !file.type.startsWith("video/")) return;
      if (isNativeApp) {
        importFileNatively(file)
          .then(onSelect)
          .catch((err) => console.error(err));
        return;
      }
      onSelect({ name: file.name, url: URL.createObjectURL(file), data: file });
    },
    [onSelect],
  );

  // The iOS app opens the system picker instead of an <input type="file">:
  // it shows only videos, and hands back the original file as it sits in
  // Photos instead of a re-compressed copy.
  const openPicker = useCallback(() => {
    if (!isNativeApp) {
      inputRef.current?.click();
      return;
    }
    pickVideoNatively()
      .then((source) => source && onSelect(source))
      .catch((err) => console.error(err));
  }, [onSelect]);

  return (
    <div
      className={`uploader${dragging ? " uploader--dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="uploader__input"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <HeroEmblem ring={t.heroRing} />
      <button type="button" className="pill pill--on-field" onClick={openPicker}>
        <FadeText value={t.importCta} trigger={lang} />
      </button>
      {!isNativeApp && (
        <p className="uploader__hint mono">
          <FadeText value={t.dropHint} trigger={lang} />
        </p>
      )}
      {error && <p className="uploader__error">{error}</p>}
      <p className="uploader__meta mono">
        <FadeText value={t.badgeOnDevice} trigger={lang} /> · <FadeText value={t.badgeQuality} trigger={lang} />
      </p>
    </div>
  );
}

/**
 * The home screen's mark: the app's arc drawn as a line, swinging forward and
 * back like the loops it makes, inside a ring of text set on a circle.
 */
function HeroEmblem({ ring }: { ring: string }) {
  return (
    <svg className="emblem" viewBox="0 0 300 300" role="img" aria-label={ring.replace(/ · $/, "")}>
      <defs>
        <path id="emblem-ring" d="M150,150 m-118,0 a118,118 0 1,1 236,0 a118,118 0 1,1 -236,0" />
      </defs>
      {/* Remounted per language so the new ring fades in instead of snapping. */}
      <text key={ring} className="emblem__ring">
        <textPath href="#emblem-ring" textLength="738" lengthAdjust="spacing">
          {ring}
        </textPath>
      </text>
      <circle className="emblem__circle" cx="150" cy="150" r="92" />
      <g className="emblem__swing">
        <path className="emblem__arc" d="M104,182 C104,142 124,106 150,106 C176,106 196,142 196,182" />
        <path className="emblem__arrow" d="M186,170 L196,184 L206,170" />
        <path className="emblem__arrow" d="M94,170 L104,184 L114,170" />
      </g>
    </svg>
  );
}
