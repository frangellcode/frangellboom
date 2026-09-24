import { useEffect, useLayoutEffect, useRef, useState } from "react"

interface FadeTextProps {
  /** The text to render. */
  value: string
  /** What re-triggers the crossfade — defaults to `value` itself, but pass a
   *  shared key (e.g. the current language) when several FadeText instances
   *  need to fade in lockstep even if some of their own values happen not to
   *  change between languages (e.g. "Collage"). Without this, an unchanged
   *  value never fades, so it sits static while everything around it dips —
   *  reading as a stray leftover instead of part of one crossfade. */
  trigger?: string | number
  className?: string
  /** Also smoothly animates this element's own rendered width to the
   *  incoming text's natural width, instead of letting it snap. Needed
   *  whenever this text sits inline before other content (an icon, a
   *  static handle, a sibling button) that would otherwise visibly jump
   *  the instant the text's length changes between languages. */
  animateWidth?: boolean
}

const FADE_MS = 300
const WIDTH_MS = 300
// offsetWidth rounds to a whole pixel, but the actual rendered text (letter-
// spacing especially compounds sub-pixel rounding across every character
// gap) can come out a hair wider than that rounded measurement — enough to
// clip the last character against this box's overflow-hidden edge. A small
// fixed pad costs nothing visually (the box is otherwise invisible, no
// border/background of its own) and removes the clip regardless of which
// exact sub-pixel mismatch caused it.
const WIDTH_PAD_PX = 3

/** Crossfades text content whenever `trigger` changes, instead of swapping instantly. */
export function FadeText({ value, trigger, className, animateWidth = false }: FadeTextProps) {
  const key = trigger ?? value
  const [display, setDisplay] = useState(value)
  const [visible, setVisible] = useState(true)
  const [width, setWidth] = useState<number | undefined>(undefined)
  const prevKey = useRef(key)
  const measureRef = useRef<HTMLSpanElement>(null)
  const measuredWidthRef = useRef<number | undefined>(undefined)

  // Keeps measuredWidthRef pointed at the CURRENT target's natural width on every
  // render, but only ever pushes it into state (triggering a resize) on first
  // mount here — later resizes are deliberately deferred to the fade-cycle
  // effect below, once the old text has actually finished fading out.
  //
  // Skipped entirely while the custom font isn't confirmed loaded yet: on a
  // cold PWA launch the font hasn't necessarily swapped in by this first
  // layout pass, so measuring now would lock in the FALLBACK font's
  // (narrower) width. The effect below corrects that once fonts are ready,
  // but there's a real window between this mount and that correction where
  // the text is already painting in the real (wider) font against a
  // too-narrow, overflow-hidden box — clipping a trailing letter. Leaving
  // width unset for that window instead sizes the box to its content
  // naturally (no clip risk); the moment fonts are ready, this effect's own
  // `value`-keyed rerun (unrelated to the ready-check) locks in the correct
  // measurement anyway.
  useLayoutEffect(() => {
    if (!animateWidth) return
    if (document.fonts && document.fonts.status !== 'loaded') return
    const w = measureRef.current?.offsetWidth
    measuredWidthRef.current = w === undefined ? undefined : w + WIDTH_PAD_PX
    setWidth((current) => (current === undefined ? measuredWidthRef.current : current))
  }, [animateWidth, value])

  // The mount measurement above can land before the custom font has actually
  // loaded (more likely on a cold PWA launch, which has its own separate
  // cache from the browser and so re-fetches the font from scratch) — it
  // then reflects the fallback font's metrics instead, leaving a stray gap
  // (or clip) once the real font swaps in and the wrapper's width doesn't
  // move to match. Re-measuring once fonts are actually ready corrects that
  // single case; guarded on `key` so it never stomps a fade already in
  // flight by the time fonts finish loading.
  useEffect(() => {
    if (!animateWidth || !document.fonts) return
    const keyAtMount = key
    document.fonts.ready.then(() => {
      if (prevKey.current !== keyAtMount) return
      const w = measureRef.current?.offsetWidth
      if (w !== undefined) {
        measuredWidthRef.current = w + WIDTH_PAD_PX
        setWidth(measuredWidthRef.current)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever needs to run once, right after mount
  }, [])

  // A value that changes on its own (a live number, not a language switch)
  // swaps in straight away. Declared before the key effect below, so on a
  // language switch prevKey still holds the old key here and this stays out
  // of the crossfade's way.
  useEffect(() => {
    if (prevKey.current === key) setDisplay(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever reacts to the value itself
  }, [value])

  useEffect(() => {
    if (prevKey.current === key) return
    prevKey.current = key
    setVisible(false)
    const t = setTimeout(() => {
      setDisplay(value)
      if (animateWidth) setWidth(measuredWidthRef.current)
      setVisible(true)
    }, FADE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `key`, not `value`, on purpose
  }, [key])

  const textSpan = (
    <span
      className={animateWidth ? undefined : className}
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      {display}
    </span>
  )

  if (!animateWidth) return textSpan

  return (
    <span className={className} style={{ position: "relative", display: "inline-block", verticalAlign: "top" }}>
      <span
        aria-hidden="true"
        ref={measureRef}
        style={{ pointerEvents: "none", visibility: "hidden", position: "absolute", left: 0, top: 0, whiteSpace: "nowrap" }}
      >
        {value}
      </span>
      <span
        style={{
          display: "inline-block",
          overflow: "hidden",
          verticalAlign: "top",
          whiteSpace: "nowrap",
          width,
          transition: `width ${WIDTH_MS}ms cubic-bezier(0.22,1,0.36,1)`,
        }}
      >
        {textSpan}
      </span>
    </span>
  )
}
