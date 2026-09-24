import { useState } from "react";
import { isNativeApp } from "../lib/native";
import { useT } from "../lib/i18n";
import { TipJarModal } from "./TipJarModal";

const INSTAGRAM_URL = "https://instagram.com/frangellgram";
/** Web only. App Store rules forbid pointing to an outside payment for a tip
 *  (guideline 3.1.1), so the iOS app shows TipJarModal (in-app purchase) in
 *  its place. */
const DONATE_URL = "https://paypal.me/frangellgram";

/** The bottom of the home screen: support the app, and follow the developer. */
export function SupportFooter() {
  const t = useT();
  const [tipJarOpen, setTipJarOpen] = useState(false);

  return (
    <div className="support">
      {isNativeApp ? (
        <button type="button" className="support__pill" onClick={() => setTipJarOpen(true)}>
          <span>{t.tipLabel}</span>
          <span className="support__divider" aria-hidden="true" />
          <strong>{t.tip}</strong>
        </button>
      ) : (
        <a className="support__pill" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
          <span>{t.donateLabel}</span>
          <span className="support__divider" aria-hidden="true" />
          <strong>{t.donate}</strong>
        </a>
      )}
      <a className="support__follow" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
        {t.followUs} <span>@frangellgram</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.2" cy="6.8" r="0.4" fill="currentColor" stroke="none" />
        </svg>
      </a>
      {isNativeApp && <TipJarModal open={tipJarOpen} onClose={() => setTipJarOpen(false)} />}
    </div>
  );
}
