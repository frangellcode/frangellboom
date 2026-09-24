import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { BoomerangMark } from "./BoomerangMark";

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
  }, []);

  return (
    <div className="processing">
      <div className="processing__spinner-wrap">
        <div className="processing__spinner" aria-hidden="true">
          <BoomerangMark className="processing__mark" />
        </div>
      </div>
      <p className="processing__label">{label}</p>
      <p className="processing__flavor">{t.flavor[flavorIndex]}</p>
      <div className="processing__bar">
        <div className="processing__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="processing__pct">{pct}%</p>
    </div>
  );
}
