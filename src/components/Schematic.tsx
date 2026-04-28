import { useEffect, useRef, useState } from "react";
import type { Instance } from "@/types";

type Props = {
  svgUrl: string;
  instances: Instance[];
  onNavigate: (moduleName: string) => void;
};

export function Schematic({ svgUrl, instances, onNavigate }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setError(null);

    fetch(svgUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`${svgUrl} -> ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setSvg(makeResponsive(text));
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [svgUrl]);

  useEffect(() => {
    const root = container.current;
    if (!root || !svg) return;

    const cleanups: (() => void)[] = [];

    for (const inst of instances) {
      if (!inst.navigable) continue;
      const cell = root.querySelector<SVGElement>(
        `#cell_${CSS.escape(inst.name)}`,
      );
      if (!cell) continue;
      cell.classList.add("clickable-cell");
      const handler = () => onNavigate(inst.module);
      cell.addEventListener("click", handler);
      cleanups.push(() => cell.removeEventListener("click", handler));
    }

    return () => cleanups.forEach((c) => c());
  }, [svg, instances, onNavigate]);

  if (error) {
    return (
      <div className="text-sm text-destructive">Failed to load: {error}</div>
    );
  }

  return (
    <div
      ref={container}
      className="schematic w-full h-full min-h-0"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function makeResponsive(svgText: string): string {
  return svgText.replace(
    /<svg\b([^>]*)>/,
    (_match, attrs: string) => {
      const w = /\bwidth="([^"]+)"/.exec(attrs)?.[1];
      const h = /\bheight="([^"]+)"/.exec(attrs)?.[1];
      const hasViewBox = /\bviewBox=/.test(attrs);
      let next = attrs
        .replace(/\s*\bwidth="[^"]*"/, "")
        .replace(/\s*\bheight="[^"]*"/, "");
      if (!hasViewBox && w && h) {
        next += ` viewBox="0 0 ${w} ${h}"`;
      }
      next += ' preserveAspectRatio="xMidYMid meet"';
      return `<svg${next}>`;
    },
  );
}
