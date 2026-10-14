import { useLanguage, useT } from "../lib/i18n";
import { FadeText } from "./FadeText";
import type { Mode, Resolution, Speed } from "../lib/boomerang";
import { openPaywall, PRO_MODES, PRO_RESOLUTIONS, useIsPro } from "../lib/pro";
import { NATIVE_ONLY_MODES } from "../lib/boomerangMath";
import { isNativeApp } from "../lib/native";

export function LockIcon() {
  return (
    <svg className="chip__lock" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1.2" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
    </svg>
  );
}


interface BoomerangControlsProps {
  speed: Speed;
  onSpeedChange: (value: Speed) => void;
  mode: Mode;
  onModeChange: (value: Mode) => void;
  resolution: Resolution;
  onResolutionChange: (value: Resolution) => void;
}

const MODES: Mode[] = (["classic", "ease", "freeze", "pulse", "zoom", "ramp", "bounce", "echo", "mirror"] as Mode[]).filter(
  (mode) => isNativeApp || !NATIVE_ONLY_MODES.includes(mode),
);

// Only "classic" exposes a speed picker (see App.tsx) — every other mode has
// a fixed, non-configurable motion, so only the two speeds that have a clear
// identity survive: normal and slow motion.
const SPEED_OPTIONS: { value: Speed; label: string }[] = [
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
];

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "2160", label: "4K" },
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
  const lang = useLanguage();
  const isPro = useIsPro();
  const row = (label: string, chips: React.ReactNode) => (
    <div className="controls__row">
      <span className="controls__label">
        <FadeText value={label} trigger={lang} />
      </span>
      <div className="chips">{chips}</div>
    </div>
  );

  return (
    <div className="controls card">
      {row(
        t.mode,
        MODES.map((value) => {
          const locked = !isPro && PRO_MODES.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={`chip${mode === value ? " chip--active" : ""}${locked ? " chip--locked" : ""}`}
              onClick={() => (locked ? openPaywall() : onModeChange(value))}
            >
              <FadeText value={t.modes[value]} trigger={lang} />
              {locked && <LockIcon />}
            </button>
          );
        }),
      )}

      {/* Only "classic" has a speed; the row eases open and shut. */}
      <div className={`controls__collapse${mode === "classic" ? " controls__collapse--open" : ""}`}>
        <div className="controls__collapse-inner">
          {row(
            t.speed,
            SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`chip${speed === opt.value ? " chip--active" : ""}`}
                onClick={() => onSpeedChange(opt.value)}
              >
                {opt.label}
              </button>
            )),
          )}
        </div>
      </div>

      {row(
        t.quality,
        RESOLUTION_OPTIONS.map((opt) => {
          const locked = !isPro && PRO_RESOLUTIONS.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className={`chip${resolution === opt.value ? " chip--active" : ""}${locked ? " chip--locked" : ""}`}
              onClick={() => (locked ? openPaywall() : onResolutionChange(opt.value))}
            >
              {opt.label}
              {locked && <LockIcon />}
            </button>
          );
        }),
      )}
    </div>
  );
}
