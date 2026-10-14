import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage, useT } from "../lib/i18n";
import { FadeText } from "./FadeText";
import type { Mode, Resolution, Speed } from "../lib/boomerang";
import { openPaywall, PRO_MODES, PRO_RESOLUTIONS, useIsPro } from "../lib/pro";
import { NATIVE_ONLY_MODES } from "../lib/boomerangMath";
import { isNativeApp } from "../lib/native";
import { LOOK_IDS, type LookId } from "../lib/looks";

export function LockIcon() {
  return (
    <svg className="chip__lock" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1.2" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
    </svg>
  );
}


/**
 * A row of chips on one line that scrolls sideways. While there's more past
 * the right edge, an arrow there says so (a tap on it scrolls on); it fades
 * away once the end is in view.
 */
function ScrollChips({ children, moreLabel }: { children: React.ReactNode; moreLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const update = useCallback(() => {
    const el = ref.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  // Every render: a language switch or a lock appearing changes how wide
  // the chips are without changing the row's own size.
  useEffect(update);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The chosen chip in view to begin with, wherever it sits in the row.
    const active = el.querySelector<HTMLElement>(".chip--active");
    if (active && active.offsetLeft + active.offsetWidth > el.clientWidth) {
      el.scrollLeft = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2;
    }
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);
  return (
    <div className="scroller">
      <div ref={ref} className="chips chips--scroll" onScroll={update}>
        {children}
      </div>
      <button
        type="button"
        className={`scroller__more${more ? " scroller__more--on" : ""}`}
        aria-label={moreLabel}
        tabIndex={more ? 0 : -1}
        onClick={() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.7, behavior: "smooth" })}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.5 2.5 8 6l-3.5 3.5" />
        </svg>
      </button>
    </div>
  );
}

interface BoomerangControlsProps {
  speed: Speed;
  onSpeedChange: (value: Speed) => void;
  mode: Mode;
  onModeChange: (value: Mode) => void;
  resolution: Resolution;
  onResolutionChange: (value: Resolution) => void;
  /** Film look (iOS app, Pro); null for none. */
  look: LookId | null;
  onLookChange: (value: LookId | null) => void;
  lookAmount: number;
  onLookAmountChange: (value: number) => void;
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
];

export function BoomerangControls({
  speed,
  onSpeedChange,
  mode,
  onModeChange,
  resolution,
  onResolutionChange,
  look,
  onLookChange,
  lookAmount,
  onLookAmountChange,
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
      <div className="controls__row">
        <span className="controls__label">
          <FadeText value={t.mode} trigger={lang} />
        </span>
        <ScrollChips moreLabel={t.moreOptions}>
          {MODES.map((value) => {
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
          })}
        </ScrollChips>
      </div>

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

      {/* Film looks: the iOS app only, like the modes its engine alone makes. */}
      {isNativeApp && (
        <div className="controls__row">
          <span className="controls__label">
            <FadeText value={t.look} trigger={lang} />
          </span>
          <ScrollChips moreLabel={t.moreOptions}>
            <button type="button" className={`chip${look === null ? " chip--active" : ""}`} onClick={() => onLookChange(null)}>
              <FadeText value={t.lookNone} trigger={lang} />
            </button>
            {LOOK_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip${look === id ? " chip--active" : ""}${isPro ? "" : " chip--locked"}`}
                onClick={() => (isPro ? onLookChange(id) : openPaywall())}
              >
                {t.looks[id]}
                {!isPro && <LockIcon />}
              </button>
            ))}
          </ScrollChips>
          <div className={`controls__collapse controls__collapse--inline${look ? " controls__collapse--open" : ""}`}>
            <div className="controls__collapse-inner">
              <label className="controls__amount">
                <span>
                  <FadeText value={t.lookAmount} trigger={lang} />
                </span>
                <input
                  className="range"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={lookAmount}
                  onChange={(e) => onLookAmountChange(Number(e.target.value))}
                />
              </label>
            </div>
          </div>
        </div>
      )}

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
