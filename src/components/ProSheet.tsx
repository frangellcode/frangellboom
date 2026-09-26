import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { closePaywall, Pro, setPro, usePaywallOpen, type ProProduct } from "../lib/pro";
import { useT } from "../lib/i18n";

// Matches the close transition in App.css (.prosheet__backdrop).
const CLOSE_MS = 280;

type Note = "unlocked" | "pending" | "failed" | "nothingToRestore" | null;

/**
 * Frangellboom Pro: what it unlocks, the price straight from the App Store
 * (never formatted here), buy, and the Restore button Apple requires for a
 * non-consumable. Opens from the footer and from any locked option.
 */
export function ProSheet() {
  const t = useT();
  const open = usePaywallOpen();
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [product, setProduct] = useState<ProProduct | "loading" | "unavailable">("loading");
  const [busy, setBusy] = useState<"buying" | "restoring" | null>(null);
  const [note, setNote] = useState<Note>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  // The card eases to its new height when what's inside changes (a note
  // appears, the buttons turn into Done) instead of jumping to it.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => setHeight(content.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [mounted]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) return;
    // Two frames: the closed state has to be on screen once before the
    // switch, or the browser skips straight to open with no transition.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [mounted, open]);

  // Asked fresh on every open: the price follows the person's storefront,
  // and a first attempt made offline should get a second chance.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProduct("loading");
    setNote(null);
    Pro.getProduct()
      .then((found) => !cancelled && setProduct(found))
      .catch(() => !cancelled && setProduct("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const buy = async () => {
    setBusy("buying");
    setNote(null);
    try {
      const { status } = await Pro.purchase();
      if (status === "purchased") {
        setPro(true);
        setNote("unlocked");
      } else if (status === "pending") {
        setNote("pending");
      }
    } catch {
      setNote("failed");
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy("restoring");
    setNote(null);
    try {
      const { isPro } = await Pro.restore();
      setPro(isPro);
      setNote(isPro ? "unlocked" : "nothingToRestore");
    } catch {
      setNote("nothingToRestore");
    } finally {
      setBusy(null);
    }
  };

  if (!mounted) return null;

  const unlocked = note === "unlocked";
  const price = typeof product === "object" ? product.displayPrice : null;

  return (
    <div className={`prosheet${visible ? " prosheet--visible" : ""}`}>
      <div className="prosheet__backdrop" onClick={busy ? undefined : closePaywall} />
      <div
        className="prosheet__card"
        role="dialog"
        aria-modal="true"
        aria-label={t.pro.title}
        style={height === null ? undefined : { height }}
      >
        <div ref={contentRef} className="prosheet__content">
        <p className="prosheet__title">{t.pro.title}</p>
        <p className="prosheet__body">{t.pro.subtitle}</p>
        <ul className="prosheet__features">
          {t.pro.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        {note && <p className={note === "unlocked" ? "prosheet__message" : "prosheet__status"}>{t.pro[note]}</p>}

        {unlocked ? (
          <button type="button" className="button button--ink prosheet__wide" onClick={closePaywall}>
            {t.pro.done}
          </button>
        ) : (
          <>
            {/* Loading, the price, or not available: always the same button,
                so the card doesn't change size while the App Store answers. */}
            <button
              type="button"
              className="button prosheet__buy prosheet__wide"
              onClick={buy}
              disabled={!price || busy !== null}
            >
              {busy === "buying"
                ? "…"
                : price
                  ? t.pro.unlock(price)
                  : product === "unavailable"
                    ? t.pro.unavailable
                    : t.pro.loadingPrice}
            </button>
            <button type="button" className="button button--ink prosheet__wide" onClick={restore} disabled={busy !== null}>
              {busy === "restoring" ? t.pro.restoring : t.pro.restore}
            </button>
            <button type="button" className="link prosheet__not-now" onClick={closePaywall} disabled={busy !== null}>
              {t.pro.notNow}
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
