import { useCallback, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { isNativeApp } from "../lib/native";
import { importFileNatively, pickVideoNatively } from "../lib/nativeVideo";
import type { VideoSource } from "../lib/videoSource";

interface VideoUploaderProps {
  onSelect: (source: VideoSource) => void;
  error?: string | null;
}

export function VideoUploader({ onSelect, error }: VideoUploaderProps) {
  const t = useT();
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
    <div className="uploader-group">
      <div
        className={`uploader${dragging ? " uploader--dragging" : ""}`}
        onClick={openPicker}
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
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openPicker();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="uploader__input"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="uploader__icon">🎥</div>
        <p className="uploader__title">{t.importTitle}</p>
        <p className="uploader__hint">{t.importHint}</p>
        {error && <p className="uploader__error">{error}</p>}
      </div>

      <div className="uploader__badges">
        <span className="badge">{t.badgeOnDevice}</span>
        <span className="uploader__badges-dot" aria-hidden="true" />
        <span className="badge">{t.badgeQuality}</span>
      </div>
    </div>
  );
}
