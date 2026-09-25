import { useCallback, useRef, useState } from "react";
import { useLanguage, useT } from "../lib/i18n";
import { FadeText } from "./FadeText";
import { isNativeApp } from "../lib/native";
import { importFileNatively, pickVideoNatively } from "../lib/nativeVideo";
import type { VideoSource } from "../lib/videoSource";
import { Headline } from "./Headline";

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
      <GlassArc />
      <div className="poster">
        <p key={t.heroWord} className="poster__word" style={{ "--chars": t.heroWord.length } as React.CSSProperties}>
          {[...t.heroWord].map((letter, i) => (
            <span key={i} className="poster__letter" style={{ "--i": i } as React.CSSProperties}>
              {letter}
            </span>
          ))}
        </p>
        <Headline text={t.heroLine} className="poster__line" />
      </div>
      <button type="button" className="button button--light" onClick={openPicker}>
        <FadeText value={t.importCta} trigger={lang} />
      </button>
      {!isNativeApp && (
        <p className="uploader__hint">
          <FadeText value={t.dropHint} trigger={lang} />
        </p>
      )}
      {error && <p className="uploader__error">{error}</p>}
      <p className="uploader__meta">
        <FadeText value={t.badgeOnDevice} trigger={lang} /> · <FadeText value={t.badgeQuality} trigger={lang} />
      </p>
    </div>
  );
}

/** The app's arc as a piece of glass floating in the sky — the home screen's
 *  counterpart to the sculptural glass forms in the Air style reference. */
function GlassArc() {
  const arc = "M40,150 C40,86 76,30 120,30 C164,30 200,86 200,150";
  return (
    <svg className="glass" viewBox="0 0 240 180" aria-hidden="true">
      <defs>
        <filter id="glass-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      {/* body: frosted, lets the sky show through */}
      <path d={arc} className="glass__body" />
      {/* rim light along the outer edge and a bright streak on top */}
      <path d={arc} className="glass__rim" />
      <path d="M58,104 C68,66 92,42 120,40" className="glass__streak" filter="url(#glass-soft)" />
    </svg>
  );
}
