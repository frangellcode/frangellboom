import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";

interface ProcessingOverlayProps {
  progress: number;
  label: string;
}

export function ProcessingOverlay({ progress, label }: ProcessingOverlayProps) {
  const t = useT();
  const pct = Math.round(progress * 100);
  const [flavorIndex, setFlavorIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFlavorIndex((i) => (i + 1) % t.flavor.length);
    }, 1800);
    return () => clearInterval(id);
  }, [t.flavor.length]);

  return (
    <div className="processing">
      <svg className="processing__mark" viewBox="0 0 120 80" aria-hidden="true">
        <path d="M20,68 C20,38 36,12 60,12 C84,12 100,38 100,68" pathLength="100" />
      </svg>
      <p className="processing__label">{label}</p>
      <p className="processing__pct">{pct}%</p>
      <div className="processing__bar">
        <div className="processing__bar-fill" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <p className="processing__flavor">{t.flavor[flavorIndex]}</p>
    </div>
  );
}
