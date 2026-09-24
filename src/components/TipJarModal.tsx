import { useEffect, useState } from "react";
import { TIP_PRODUCT_IDS, TipJar, type TipProduct } from "../lib/tipJar";
import { useT } from "../lib/i18n";

const CLOSE_MS = 250;

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; products: TipProduct[]; buying: string | null; note: "failed" | null }
  | { kind: "unavailable" }
  | { kind: "done"; note: "thanks" | "pending" };

interface TipJarModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The App Store build's stand-in for the PayPal link: consumable in-app
 * purchases that unlock nothing (see TipJarPlugin.swift for why it can't just
 * link out). Prices come from the App Store already localized — this never
 * formats a price of its own.
 */
export function TipJarModal({ open, onClose }: TipJarModalProps) {
  const t = useT();
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

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
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [mounted, open]);

  // Asked fresh on every open rather than cached: prices follow the person's
  // storefront, and a first attempt made offline should get a second chance.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase({ kind: "loading" });
    TipJar.getProducts({ productIds: TIP_PRODUCT_IDS })
      .then(({ products }) => {
        if (cancelled) return;
        setPhase(products.length > 0 ? { kind: "ready", products, buying: null, note: null } : { kind: "unavailable" });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const buy = async (productId: string) => {
    if (phase.kind !== "ready" || phase.buying) return;
    const products = phase.products;
    setPhase({ kind: "ready", products, buying: productId, note: null });
    try {
      const { status } = await TipJar.purchase({ productId });
      if (status === "purchased") setPhase({ kind: "done", note: "thanks" });
      else if (status === "pending") setPhase({ kind: "done", note: "pending" });
      else setPhase({ kind: "ready", products, buying: null, note: null });
    } catch {
      setPhase({ kind: "ready", products, buying: null, note: "failed" });
    }
  };

  if (!mounted) return null;

  const busy = phase.kind === "ready" && phase.buying !== null;

  return (
    <div className={`tipjar${visible ? " tipjar--visible" : ""}`}>
      <div className="tipjar__backdrop" onClick={busy ? undefined : onClose} />
      <div className="tipjar__card" role="dialog" aria-modal="true" aria-label={t.tipJar.title}>
        <p className="tipjar__title">{t.tipJar.title}</p>
        {phase.kind === "done" ? (
          <p className="tipjar__message">{t.tipJar[phase.note]}</p>
        ) : (
          <p className="tipjar__body">{t.tipJar.body}</p>
        )}
        {phase.kind === "loading" && <p className="tipjar__status">{t.tipJar.loading}</p>}
        {phase.kind === "unavailable" && <p className="tipjar__status">{t.tipJar.unavailable}</p>}
        {phase.kind === "ready" && (
          <div className="tipjar__products">
            {phase.products.map((product) => (
              <button
                key={product.id}
                type="button"
                disabled={busy}
                onClick={() => buy(product.id)}
                className={`tipjar__product${busy && phase.buying !== product.id ? " tipjar__product--dimmed" : ""}`}
              >
                <span>{product.displayName}</span>
                <strong>{phase.buying === product.id ? "…" : product.displayPrice}</strong>
              </button>
            ))}
            {phase.note === "failed" && <p className="app__error">{t.tipJar.failed}</p>}
          </div>
        )}
        <button type="button" className="btn btn--primary tipjar__close" onClick={onClose} disabled={busy}>
          {t.tipJar.close}
        </button>
      </div>
    </div>
  );
}
