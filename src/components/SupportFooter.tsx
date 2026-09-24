import { useState } from "react";
import { isNativeApp } from "../lib/native";
import { useLanguage, useT } from "../lib/i18n";
import { FadeText } from "./FadeText";
import { TipJarModal } from "./TipJarModal";

const INSTAGRAM_URL = "https://instagram.com/frangellgram";
/** Web only. App Store rules forbid pointing to an outside payment for a tip
 *  (guideline 3.1.1), so the iOS app shows TipJarModal (in-app purchase) in
 *  its place. */
const DONATE_URL = "https://paypal.me/frangellgram";

/** The bottom of the home screen: support the app, and follow the developer. */
export function SupportFooter() {
  const t = useT();
  const lang = useLanguage();
  const [tipJarOpen, setTipJarOpen] = useState(false);

  return (
    <div className="support">
      {isNativeApp ? (
        <button type="button" className="support__pill" onClick={() => setTipJarOpen(true)}>
          <span><FadeText value={t.tipLabel} trigger={lang} animateWidth /></span>
          <span className="support__divider" aria-hidden="true" />
          <strong><FadeText value={t.tip} trigger={lang} animateWidth /></strong>
        </button>
      ) : (
        <a className="support__pill" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
          <span><FadeText value={t.donateLabel} trigger={lang} animateWidth /></span>
          <span className="support__divider" aria-hidden="true" />
          <strong><FadeText value={t.donate} trigger={lang} animateWidth /></strong>
        </a>
      )}
      <p className="support__follow">
        <FadeText value={t.followUs} trigger={lang} animateWidth />
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          @frangellgram
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.2" cy="6.8" r="0.4" fill="currentColor" stroke="none" />
          </svg>
        </a>
      </p>
      {isNativeApp && <TipJarModal open={tipJarOpen} onClose={() => setTipJarOpen(false)} />}
    </div>
  );
}
