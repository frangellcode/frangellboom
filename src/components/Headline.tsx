import { useLanguage } from "../lib/i18n";

interface HeadlineProps {
  /** The word in {braces} is set in the handwritten face. */
  text: string;
  className?: string;
}

/** Upright headline with one handwritten word in it. Remounted per language,
 *  so a language switch fades the new line in instead of snapping. */
export function Headline({ text, className = "headline" }: HeadlineProps) {
  const lang = useLanguage();
  const parts = text.split(/\{([^}]*)\}/);
  return (
    <h2 key={lang} className={className}>
      {parts.map((part, i) => (i % 2 === 1 ? <em key={i}>{part}</em> : part))}
    </h2>
  );
}
