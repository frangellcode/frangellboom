import type { CSSProperties } from "react";
import { useT } from "../lib/i18n";
import type { Mode, Resolution, Speed } from "../lib/boomerang";

type AccentStyle = CSSProperties & { "--row-accent"?: string };

interface BoomerangControlsProps {
  speed: Speed;
  onSpeedChange: (value: Speed) => void;
  mode: Mode;
  onModeChange: (value: Mode) => void;
  resolution: Resolution;
  onResolutionChange: (value: Resolution) => void;
}

const MODES: Mode[] = ["classic", "ease", "freeze", "pulse", "zoom"];

// Only "classic" exposes a speed picker (see App.tsx) — every other mode has
// a fixed, non-configurable motion, so only the two speeds that have a clear
// identity survive: normal and slow motion.
const SPEED_OPTIONS: { value: Speed; label: string }[] = [
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
];

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "1440", label: "2K" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
];

export function BoomerangControls({
  speed,
  onSpeedChange,
  mode,
  onModeChange,
  resolution,
  onResolutionChange,
}: BoomerangControlsProps) {
  const t = useT();
  return (
    <div className="controls">
      <div className="controls__header">
        <span className="controls__heading">{t.settings}</span>
      </div>

      <div className="controls__row" style={{ "--row-accent": "var(--accent)" } as AccentStyle}>
        <span className="controls__label">
          <span>{t.mode}</span>
        </span>
        <div className="chips">
          {MODES.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip${mode === value ? " chip--active" : ""}`}
              onClick={() => onModeChange(value)}
            >
              {t.modes[value]}
            </button>
          ))}
        </div>
      </div>

      <div className={`controls__collapse${mode === "classic" ? " controls__collapse--open" : ""}`}>
        <div className="controls__collapse-inner controls__collapse-inner--glow">
          <div className="controls__row" style={{ "--row-accent": "var(--accent-4)" } as AccentStyle}>
            <span className="controls__label">
              <span>{t.speed}</span>
            </span>
            <div className="chips">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`chip${speed === opt.value ? " chip--active" : ""}`}
                  onClick={() => onSpeedChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="controls__row" style={{ "--row-accent": "var(--accent-2)" } as AccentStyle}>
        <span className="controls__label">
          <span>{t.quality}</span>
        </span>
        <div className="chips">
          {RESOLUTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`chip${resolution === opt.value ? " chip--active" : ""}`}
              onClick={() => onResolutionChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
