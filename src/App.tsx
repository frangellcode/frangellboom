import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toggleLanguage, useLanguage, useT } from "./lib/i18n";
import { FadeText } from "./components/FadeText";
import { SupportFooter } from "./components/SupportFooter";
import { Headline } from "./components/Headline";
import { introPending, prepareIntro } from "./lib/intro";
import { VideoUploader } from "./components/VideoUploader";
import { VideoTrimmer } from "./components/VideoTrimmer";
import { BoomerangPreview } from "./components/BoomerangPreview";
import { BoomerangControls } from "./components/BoomerangControls";
import { ProcessingOverlay } from "./components/ProcessingOverlay";
import { ResultView, type LoopResult } from "./components/ResultView";
import { getFFmpeg, withFFmpeg, resetFFmpeg } from "./lib/ffmpegClient";
import { createBoomerang, type Resolution, type Speed, type Mode } from "./lib/boomerang";
import { extractPreviewClip } from "./lib/previewClip";
import { totalBoomerangDuration, deriveLoops } from "./lib/boomerangMath";
import { requestWakeLock, releaseWakeLock } from "./lib/wakeLock";
import { probeVideo, type VideoSource } from "./lib/videoSource";
import { isNativeApp } from "./lib/native";
import { closeCameraNatively, createLoopNatively, createPreviewNatively, recordVideoNatively } from "./lib/nativeVideo";
import { PRO_MODES, PRO_RESOLUTIONS, useIsPro } from "./lib/pro";
import { ProSheet } from "./components/ProSheet";
import "./App.css";

type Step = "upload" | "trim" | "adjust" | "processing" | "result";

const DEFAULT_SEGMENT = 2;
const MIN_SEGMENT = 0.5;
const MAX_SEGMENT = 2;
// How long the processing overlay fades out before "result" takes over —
// without this the overlay (a full-screen blurred backdrop + spinner) just
// vanished the instant the export finished, which read as an abrupt cut
// even though the result screen itself fades in underneath it.
const OVERLAY_LEAVE_MS = 280;
// How long a step takes to fade out before the next one fades in (see
// .screen--leaving in App.css).
const SCREEN_LEAVE_MS = 200;

function App() {
  const t = useT();
  const lang = useLanguage();
  const [step, setStep] = useState<Step>("upload");
  // Cold start: the sky waits (matching the launch screen) until everything
  // is loaded, then the home screen assembles itself; see App.css.
  const [intro, setIntro] = useState<"waiting" | "playing" | "done">(() => (introPending() ? "waiting" : "done"));
  useEffect(() => {
    if (intro !== "waiting") return;
    prepareIntro().then(() => setIntro("playing"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on the cold start
  }, []);
  // The intro's classes stay on for as long as the home screen it built is
  // up. Taking them off any earlier swaps each element back to its everyday
  // entrance animation, which the browser then plays all over again.
  useEffect(() => {
    if (step !== "upload" && intro === "playing") setIntro("done");
  }, [step, intro]);
  const [source, setSource] = useState<VideoSource | null>(null);
  // Width / height of the source, so its box is laid out before it loads.
  const [aspect, setAspect] = useState(9 / 16);
  const videoUrl = source?.url ?? null;
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [segmentDuration, setSegmentDuration] = useState(DEFAULT_SEGMENT);
  const [speed, setSpeed] = useState<Speed>(1);
  const [mode, setMode] = useState<Mode>("classic");
  const [resolution, setResolution] = useState<Resolution>("original");
  const isPro = useIsPro();

  // Without Pro, a Pro choice falls back to the best free one: Classic, and
  // 1080p. (Original is the default for someone with Pro.)
  useEffect(() => {
    if (isPro) return;
    if (PRO_MODES.includes(mode)) setMode("classic");
    if (PRO_RESOLUTIONS.includes(resolution)) setResolution("1080");
  }, [isPro, mode, resolution]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<LoopResult | null>(null);
  const [previewClipUrl, setPreviewClipUrl] = useState<string | null>(null);
  const [preparingPreview, setPreparingPreview] = useState(false);
  const [overlayLeaving, setOverlayLeaving] = useState(false);
  const [screenLeaving, setScreenLeaving] = useState(false);

  // Between trimming and shaping the loop: the step on screen fades out
  // first, so the next one never replaces it in a single frame.
  const leaveTo = useCallback(async (next: Step) => {
    setScreenLeaving(true);
    await new Promise((resolve) => window.setTimeout(resolve, SCREEN_LEAVE_MS));
    setScreenLeaving(false);
    setStep(next);
  }, []);
  const ffmpegPreload = useRef(false);

  // Kick off the (large) ffmpeg-core download as soon as the user lands,
  // so it's likely ready by the time they hit "Crear boomerang". The iOS app
  // never loads ffmpeg: it builds loops natively.
  useEffect(() => {
    if (isNativeApp || ffmpegPreload.current) return;
    ffmpegPreload.current = true;
    getFFmpeg().catch(() => {
      /* swallow — a real error will surface again when processing starts */
    });
  }, []);

  // The wake lock is auto-released whenever the tab loses visibility (the
  // spec requires this) — re-request it if the person switches back while
  // an export is still running, instead of leaving the screen free to lock
  // again for the rest of that export.
  useEffect(() => {
    if (step !== "processing") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [step]);

  // Makes a new video the one being worked on, from the start.
  const adoptSource = useCallback((selected: VideoSource, probed: { aspect: number; duration: number } | null) => {
    setAspect(probed?.aspect ?? 9 / 16);
    setError(null);
    setSource((prev) => {
      if (prev) releaseSource(prev);
      return selected;
    });
    setDuration(probed?.duration ?? 0);
    setStart(0);
    setSegmentDuration(DEFAULT_SEGMENT);
    setPreviewClipUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const handleSelect = useCallback(
    async (selected: VideoSource) => {
      adoptSource(selected, await probeVideo(selected.url));
      setStep("trim");
    },
    [adoptSource],
  );

  // A recording is already a loop's length, so it skips trimming: straight
  // to shaping the loop. The camera stays up (dimmed, spinner going) while
  // that screen is put in place underneath it — with no transition, since
  // nobody sees it — and its live preview is made; then the camera fades
  // away onto it. The home screen never shows in between.
  //
  // underCamera: the veil jumps instead of easing, while the camera covers it.
  // enteredFromCamera: that editor screen, for as long as it's up, skips its
  // entrance (switching the entrance back on would replay it) and its
  // video shows as-is; it also offers "Record again" in place of "Trim".
  const [underCamera, setUnderCamera] = useState(false);
  const [enteredFromCamera, setEnteredFromCamera] = useState(false);
  const previewShown = useRef<(() => void) | null>(null);
  const handleRecord = useCallback(
    async (recorded: VideoSource) => {
      try {
        const probed = await probeVideo(recorded.url);
        adoptSource(recorded, probed);
        const length = Math.min(Math.max(probed?.duration ?? DEFAULT_SEGMENT, MIN_SEGMENT), MAX_SEGMENT);
        setSegmentDuration(length);
        setPreparingPreview(true);
        setUnderCamera(true);
        setEnteredFromCamera(true);
        setStep("adjust");
        // Until the live preview has its first frame on screen...
        const shown = new Promise<void>((resolve) => {
          previewShown.current = resolve;
        });
        createPreviewNatively(recorded, 0, length)
          .then((clipUrl) => setPreviewClipUrl(clipUrl))
          .catch((err) => {
            console.error(err);
            previewShown.current?.();
          })
          .finally(() => setPreparingPreview(false));
        // ...but not forever: past this the preview box's own spinner takes over.
        await Promise.race([shown, new Promise((resolve) => window.setTimeout(resolve, 4000))]);
        // Two frames, so the editor has been drawn before the camera goes —
        // or a moment, if the webview isn't drawing frames right now.
        await Promise.race([
          new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          new Promise((resolve) => window.setTimeout(resolve, 150)),
        ]);
      } finally {
        await closeCameraNatively().catch(() => {});
        setUnderCamera(false);
      }
    },
    [adoptSource],
  );

  const recordAgain = useCallback(() => {
    recordVideoNatively(t.recordHint)
      .then((recorded) => recorded && handleRecord(recorded))
      .catch((err) => console.error(err));
  }, [t.recordHint, handleRecord]);

  // Any other way onto a screen brings back the usual entrances.
  useEffect(() => {
    if (step !== "adjust" && step !== "processing") setEnteredFromCamera(false);
  }, [step]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setSource((prev) => {
      if (prev) releaseSource(prev);
      return null;
    });
    setResult(null);
    setError(null);
    setProgress(0);
    setPreviewClipUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const maxSegmentDuration = duration > 0 ? Math.min(duration, MAX_SEGMENT) : DEFAULT_SEGMENT;
  const clampedSegmentDuration = Math.min(segmentDuration, maxSegmentDuration);

  // Only "classic" exposes a speed picker — every other mode has a fixed,
  // baked-in motion (see legsFor in boomerangMath), so its effective speed
  // is always 1 regardless of whatever the (hidden) speed picker last held.
  const effectiveSpeed: Speed = mode === "classic" ? speed : 1;

  // No more a user-editable loop count: it's derived to land close to a
  // fixed target total duration per mode/speed (Instagram-style — normal
  // vs. slow motion each have one "right" length, not a range to pick from).
  const loops = useMemo(
    () => deriveLoops(mode, effectiveSpeed, clampedSegmentDuration, isNativeApp),
    [mode, effectiveSpeed, clampedSegmentDuration],
  );

  const handleCreate = useCallback(async () => {
    if (!source) return;
    setStep("processing");
    setProgress(0);
    setError(null);
    setOverlayLeaving(false);
    requestWakeLock();
    try {
      const options = { start, duration: clampedSegmentDuration, loops, resolution, speed: effectiveSpeed, mode };
      if (isNativeApp) {
        const { webPath, uri } = await createLoopNatively(source, { ...options, watermark: !isPro }, setProgress);
        setResult({ url: webPath, uri });
      } else {
        const blob = await withFFmpeg((ffmpeg) => createBoomerang(ffmpeg, source, { ...options, onProgress: setProgress }));
        setResult({ blob });
      }
      setOverlayLeaving(true);
      await new Promise((resolve) => window.setTimeout(resolve, OVERLAY_LEAVE_MS));
      setStep("result");
    } catch (err) {
      console.error(err);
      setError(t.processFailed);
      setStep("adjust");
    } finally {
      // (Web only.) Exporting is by far the heaviest thing ffmpeg does here (especially
      // with chunked reverses at 2K/Original), so its memory footprint is
      // what eventually trips the "memory access out of bounds" crash after
      // a few runs. Starting the next export from a freshly-loaded instance
      // — win or lose — keeps that from ever accumulating that far.
      if (!isNativeApp) resetFFmpeg().catch(() => {});
      releaseWakeLock();
    }
  }, [source, start, clampedSegmentDuration, loops, resolution, effectiveSpeed, mode, t, isPro]);

  const handleGoToAdjust = useCallback(async () => {
    if (!source) return;
    setPreparingPreview(true);
    setError(null);
    try {
      const clipUrl = isNativeApp
        ? await createPreviewNatively(source, start, clampedSegmentDuration)
        : URL.createObjectURL(
            await withFFmpeg((ffmpeg) => extractPreviewClip(ffmpeg, source, { start, duration: clampedSegmentDuration })),
          );
      setPreviewClipUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return clipUrl;
      });
    } catch (err) {
      console.error(err);
      // Non-fatal: BoomerangPreview falls back to scrubbing the original
      // file directly, just less smoothly.
    } finally {
      await leaveTo("adjust");
      setPreparingPreview(false);
    }
  }, [source, start, clampedSegmentDuration, leaveTo]);

  const totalDuration = useMemo(
    () => totalBoomerangDuration(mode, effectiveSpeed, clampedSegmentDuration, loops),
    [mode, effectiveSpeed, clampedSegmentDuration, loops],
  );

  const headline = (text: string) => <Headline text={text} />;

  return (
    <div
      className={`app${step === "upload" ? " app--hero" : ""}${intro === "waiting" ? " app--waiting" : intro === "playing" ? " app--intro" : ""}${underCamera ? " app--under-camera" : ""}`}
    >
      <header className="bar">
        <h1 className="bar__wordmark">Frangellboom</h1>
        <button type="button" className="bar__lang" onClick={toggleLanguage} aria-label={t.langToggleLabel}>
          <FadeText value={t.langToggle} trigger={lang} />
        </button>
      </header>

      <main className="app__main">
        {step === "upload" && (
          <div className="screen hero" key="upload">
            <VideoUploader onSelect={handleSelect} onRecord={handleRecord} error={error} />
            <SupportFooter />
          </div>
        )}

        {step === "trim" && videoUrl && (
          <div className={`screen${screenLeaving ? " screen--leaving" : ""}`} key="trim">
            {headline(t.trimEyebrow)}
            <VideoTrimmer
              videoUrl={videoUrl}
              aspect={aspect}
              duration={duration}
              start={start}
              segmentDuration={clampedSegmentDuration}
              onStartChange={setStart}
              onDurationChange={setDuration}
            />

            <div className="field card">
              <label className="field__label" htmlFor="segment-duration">
                <span>
                  <FadeText value={t.segmentLength} trigger={lang} />
                </span>
                <span className="field__value">{clampedSegmentDuration.toFixed(1)}s</span>
              </label>
              <input
                id="segment-duration"
                className="range"
                type="range"
                min={MIN_SEGMENT}
                max={Math.max(maxSegmentDuration, MIN_SEGMENT)}
                step={0.1}
                value={clampedSegmentDuration}
                onChange={(e) => setSegmentDuration(Number(e.target.value))}
              />
            </div>

            <div className="actions">
              <button type="button" className="button button--ghost" onClick={handleReset}>
                <FadeText value={t.back} trigger={lang} />
              </button>
              <button
                type="button"
                className="button button--light"
                onClick={handleGoToAdjust}
                disabled={duration === 0 || preparingPreview}
              >
                <FadeText value={preparingPreview ? t.preparing : t.next} trigger={lang} />
              </button>
            </div>
          </div>
        )}

        {(step === "adjust" || step === "processing") && videoUrl && (
          <div
            className={`screen${screenLeaving ? " screen--leaving" : ""}${enteredFromCamera ? " screen--instant" : ""}`}
            key="adjust"
          >
            {headline(t.adjustEyebrow)}
            {preparingPreview && !previewClipUrl ? (
              <div className="preview preview--waiting">
                <div className="preview__placeholder" style={{ aspectRatio: aspect }} />
              </div>
            ) : (
              <BoomerangPreview
                videoUrl={previewClipUrl ?? videoUrl}
                aspect={aspect}
                start={previewClipUrl ? 0 : start}
                duration={clampedSegmentDuration}
                speed={effectiveSpeed}
                mode={mode}
                fadeIn={!enteredFromCamera}
                onShown={() => previewShown.current?.()}
              />
            )}

            <p className="meta">
              <FadeText value={t.segment} trigger={lang} /> {clampedSegmentDuration.toFixed(1)}s ·{" "}
              <FadeText value={t.totalLength} trigger={lang} /> {totalDuration.toFixed(1)}s
            </p>

            <BoomerangControls
              speed={speed}
              onSpeedChange={setSpeed}
              mode={mode}
              onModeChange={setMode}
              resolution={resolution}
              onResolutionChange={setResolution}
            />

            {error && <p className="error">{error}</p>}

            <div className="actions">
              {enteredFromCamera ? (
                <button type="button" className="button button--ghost" onClick={recordAgain}>
                  <FadeText value={t.recordAgain} trigger={lang} />
                </button>
              ) : (
                <button type="button" className="button button--ghost" onClick={() => leaveTo("trim")}>
                  <FadeText value={t.trimBack} trigger={lang} />
                </button>
              )}
              <button type="button" className="button button--light" onClick={handleCreate} disabled={step === "processing"}>
                <FadeText value={t.create} trigger={lang} />
              </button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className={`overlay${overlayLeaving ? " overlay--leaving" : ""}`}>
            <ProcessingOverlay progress={progress} label={t.creating} />
          </div>
        )}

        {step === "result" && result && (
          <div className="screen" key="result">
            <ResultView result={result} aspect={aspect} onReset={handleReset} />
          </div>
        )}
      </main>
      {isNativeApp && <ProSheet />}
    </div>
  );
}

/** A web-picked video is played through an object URL that has to be freed;
 *  a natively picked one is a plain file URL. */
function releaseSource(source: VideoSource) {
  if (source.url.startsWith("blob:")) URL.revokeObjectURL(source.url);
}

export default App;
