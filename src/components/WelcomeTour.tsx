import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useT, type TourSlideId } from "../lib/i18n";
import { isNativeApp } from "../lib/native";
import { PRO_MODES, PRO_RESOLUTIONS, useIsPro } from "../lib/pro";
import { markTourSeen } from "../lib/tour";
import type { Mode, Resolution } from "../lib/boomerang";
import { NATIVE_ONLY_MODES } from "../lib/boomerangMath";
import { LockIcon } from "./BoomerangControls";
import { Headline } from "./Headline";
import { GlassArc } from "./VideoUploader";

// Matches .tour--leaving in App.css.
const LEAVE_MS = 420;
// How long each mode plays in the "Shape the loop" card before the next.
const MODE_MS = 3000;

/** A frame of "video": the sky, panning one way and then back — a loop.
 *  Given a mode, it moves the way that mode does (see .tour-clip--<mode>),
 *  starting over from the first frame whenever the mode changes. */
function SkyClip({ className = "", mode }: { className?: string; mode?: Mode }) {
  return (
    <div className={`tour-clip ${className}${mode ? ` tour-clip--${mode}` : ""}`}>
      <div key={mode} className="tour-clip__zoom">
        <div className="tour-clip__sky" />
        {/* Echo's trail: the same pan a beat behind, fading. */}
        {mode === "echo" && [1, 2].map((n) => <div key={n} className={`tour-clip__sky tour-clip__ghost tour-clip__ghost--${n}`} />)}
        {/* Mirror: the clip flipped, showing only its right half. */}
        {mode === "mirror" && (
          <div className="tour-clip__mirror">
            <div className="tour-clip__sky" />
          </div>
        )}
      </div>
    </div>
  );
}

/** The glass arc over the poster word, as on the home screen. */
function WelcomeArt() {
  const t = useT();
  return (
    <div className="tour-art tour-art--welcome">
      <GlassArc className="glass tour-glass" />
      <p className="tour-poster" style={{ "--chars": t.heroWord.length } as CSSProperties}>
        {t.heroWord}
      </p>
    </div>
  );
}

/** The two ways in: the app's record button, and a library of clips. */
function CaptureArt() {
  const t = useT();
  return (
    <div className="tour-art tour-art--capture">
      {isNativeApp && (
        <div className="tour-capture">
          <div className="tour-record">
            <span className="tour-record__dot" />
          </div>
          <span className="tour-chip">{t.recordCta}</span>
        </div>
      )}
      <div className="tour-capture">
        <div className="tour-library">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="tour-library__cell" style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <span className="tour-chip">{t.importCta}</span>
      </div>
    </div>
  );
}

/** A clip over the trimmer, its window sliding along the strip. */
function MomentArt() {
  return (
    <div className="tour-art tour-art--moment">
      <SkyClip className="tour-clip--wide" />
      <div className="tour-track">
        <div className="tour-track__strip" />
        <div className="tour-track__window" />
      </div>
    </div>
  );
}

/** The live loop over the modes: it plays each one in turn, and a tap on a
 *  mode plays that one at once. Without Pro the Pro modes carry the
 *  editor's lock, so none of them reads as free — but they can still be
 *  seen here. */
function ShapeArt() {
  const t = useT();
  const isPro = useIsPro();
  const modes = (Object.keys(t.modes) as Mode[]).filter((mode) => isNativeApp || !NATIVE_ONLY_MODES.includes(mode));
  const [active, setActive] = useState(0);
  // Bumped by a tap, so the countdown to the next mode starts over.
  const [picked, setPicked] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive((i) => (i + 1) % modes.length), MODE_MS);
    return () => window.clearInterval(timer);
  }, [modes.length, picked]);
  return (
    <div className="tour-art tour-art--shape">
      <div className="tour-live">
        <SkyClip className="tour-clip--tall" mode={modes[active]} />
        <span className="preview__live-badge">{t.live}</span>
      </div>
      <div className="tour-chips">
        {modes.map((mode, i) => {
          const locked = !isPro && PRO_MODES.includes(mode);
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={i === active}
              className={`tour-chip${locked ? " tour-chip--locked" : ""}${i === active ? " tour-chip--on" : ""}`}
              onClick={() => {
                setActive(i);
                setPicked((n) => n + 1);
              }}
            >
              {t.modes[mode]}
              {locked && <LockIcon />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The finished loop, the qualities under it, and the save button. */
function ShareArt() {
  const t = useT();
  const isPro = useIsPro();
  const qualities: { value: Resolution; label: string }[] = [
    { value: "original", label: "Original" },
    { value: "2160", label: "4K" },
    { value: "1440", label: "2K" },
    { value: "1080", label: "1080p" },
  ];
  // The best quality this person can actually pick.
  const best = isPro ? "original" : "1440";
  return (
    <div className="tour-art tour-art--share">
      <SkyClip className="tour-clip--tall" />
      <div className="tour-chips">
        {qualities.map(({ value, label }) => {
          const locked = !isPro && PRO_RESOLUTIONS.includes(value);
          return (
            <span
              key={value}
              className={`tour-chip${value === best ? " tour-chip--on" : ""}${locked ? " tour-chip--locked" : ""}`}
            >
              {label}
              {locked && <LockIcon />}
            </span>
          );
        })}
      </div>
      <span className="tour-save">{isNativeApp ? t.save : t.download}</span>
    </div>
  );
}

/** A small Pro card: what one purchase unlocks. */
function ProArt() {
  const t = useT();
  return (
    <div className="tour-art tour-art--pro">
      <div className="tour-procard">
        <p className="tour-procard__title">{t.pro.title}</p>
        <ul className="tour-procard__features">
          {t.pro.features.map((feature, i) => (
            <li key={feature} style={{ "--i": i } as CSSProperties}>
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ART: Record<TourSlideId, () => ReactNode> = {
  welcome: WelcomeArt,
  capture: CaptureArt,
  moment: MomentArt,
  shape: ShapeArt,
  share: ShareArt,
  pro: ProArt,
};

interface WelcomeTourProps {
  onClose: () => void;
  /** First launch, straight out of the launch screen: the sky is already
   *  there, so the veil darkens over it and the tour's parts ease in one
   *  after another instead of the whole view fading in at once. */
  soft?: boolean;
}

/**
 * First-launch walkthrough: a few swipeable cards showing what the app does.
 * Shown once per device (the "?" on the home screen brings it back). Native
 * scroll snapping does the swiping, so it moves like any other horizontal
 * swipe on the phone.
 */
export function WelcomeTour({ onClose, soft = false }: WelcomeTourProps) {
  const t = useT();
  const slides = t.tour.slides;
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const last = index === slides.length - 1;

  const close = () => {
    markTourSeen();
    setLeaving(true);
  };

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onClose, LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, onClose]);

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={slides[0].title.replace(/[{}]/g, "")}
      className={`tour${soft ? " tour--soft" : ""}${leaving ? " tour--leaving" : ""}`}
    >
      <div className="tour__top">
        <button type="button" className={`tour__skip${last ? " tour__skip--hidden" : ""}`} onClick={close}>
          {t.tour.skip}
        </button>
      </div>

      <div
        ref={trackRef}
        className="tour__track"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
        }}
      >
        {slides.map((slide, i) => {
          const Art = ART[slide.id];
          return (
            <section key={slide.id} className="tour__slide" aria-hidden={i !== index}>
              <div className="tour__art">
                <Art />
              </div>
              <div className="tour__text">
                <Headline text={slide.title} className="tour__title" />
                <p className="tour__body">{slide.body}</p>
              </div>
            </section>
          );
        })}
      </div>

      <div className="tour__nav">
        <div className="tour__dots">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`${i + 1} / ${slides.length}`}
              className={`tour__dot${i === index ? " tour__dot--on" : ""}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <div className="actions tour__actions">
          {/* Back as well as Next — swiping isn't the only way people page. */}
          <button type="button" className="button" onClick={() => goTo(index - 1)} disabled={index === 0}>
            {t.tour.back}
          </button>
          <button type="button" className="button button--light" onClick={() => (last ? close() : goTo(index + 1))}>
            {last ? t.tour.start : t.tour.next}
          </button>
        </div>
      </div>
    </div>
  );
}
