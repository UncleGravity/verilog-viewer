import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prettyName } from "@/lib/names";
import type { Instance } from "@/types";

type Props = {
  svgUrl: string;
  instances: Instance[];
  onNavigate: (moduleName: string) => void;
};

type View = { x: number; y: number; scale: number };
const IDENTITY: View = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const DRAG_THRESHOLD_PX = 4;
const ZOOM_STEP = 1.2;

export function Schematic({ svgUrl, instances, onNavigate }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(IDENTITY);

  // Keep latest view in a ref so event handlers can read it without re-binding.
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setError(null);
    setView(IDENTITY);
    fetch(svgUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`${svgUrl} -> ${r.status}`);
        return r.text();
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

  // Memoize the dangerouslySetInnerHTML object so React skips the prop update
  // when only the view (zoom/pan) changes. React 19 diffs this prop by
  // reference; a stable object means innerHTML is not reset on re-render, so
  // the class additions and <title> nodes below survive.
  const innerHtml = useMemo(() => ({ __html: svg }), [svg]);

  // Decorate cells after React commits the SVG.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || !svg) return;

    inner.querySelectorAll("text").forEach((t) => {
      const txt = t.textContent ?? "";
      const pretty = prettyName(txt);
      if (pretty !== txt) t.textContent = pretty;
    });

    const moduleByCellId = new Map<string, string>();
    for (const inst of instances) {
      const cell = inner.querySelector<SVGElement>(
        `#cell_${CSS.escape(inst.name)}`,
      );
      if (!cell) continue;
      // Native browser tooltip for any cell so the user can identify it on hover.
      if (!cell.querySelector(":scope > title")) {
        const title = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "title",
        );
        title.textContent = `${inst.name} : ${prettyName(inst.module)}`;
        cell.insertBefore(title, cell.firstChild);
      }
      if (inst.navigable) {
        cell.classList.add("clickable-cell");
        moduleByCellId.set(cell.id, inst.module);
      }
    }

    const onCellClick = (e: MouseEvent) => {
      const cell = (e.target as Element | null)?.closest(".clickable-cell");
      if (!cell) return;
      const mod = moduleByCellId.get((cell as Element).id);
      if (mod) onNavigate(mod);
    };
    inner.addEventListener("click", onCellClick);
    return () => inner.removeEventListener("click", onCellClick);
  }, [svg, instances, onNavigate]);

  // Wheel zoom + drag pan. Stable handlers, fresh state via viewRef.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const zoomAt = (factor: number, cx: number, cy: number) => {
      const v = viewRef.current;
      const next = clampScale(v.scale * factor);
      const ratio = next / v.scale;
      setView({
        scale: next,
        x: cx - (cx - v.x) * ratio,
        y: cy - (cy - v.y) * ratio,
      });
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = outer.getBoundingClientRect();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };

    let dragging = false;
    let didMove = false;
    let activePointerId = -1;
    let startClientX = 0;
    let startClientY = 0;
    let startX = 0;
    let startY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      dragging = true;
      didMove = false;
      activePointerId = e.pointerId;
      startClientX = e.clientX;
      startClientY = e.clientY;
      startX = viewRef.current.x;
      startY = viewRef.current.y;
      // Note: don't capture the pointer yet. Capturing on pointerdown
      // retargets the subsequent `click` to `outer`, which would prevent
      // clicks on the floating zoom buttons and on cells from working.
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (
        !didMove &&
        (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)
      ) {
        didMove = true;
        outer.style.cursor = "grabbing";
        try {
          outer.setPointerCapture(e.pointerId);
        } catch {
          // pointer may already be gone
        }
      }
      if (didMove) setView((v) => ({ ...v, x: startX + dx, y: startY + dy }));
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      outer.style.cursor = "";
      if (activePointerId >= 0 && outer.hasPointerCapture(activePointerId)) {
        try {
          outer.releasePointerCapture(activePointerId);
        } catch {
          // pointer capture may already be released
        }
      }
      activePointerId = -1;
    };

    // Listen on window so a release outside the schematic still ends the drag.
    const onWindowPointerUp = () => endDrag();

    // Swallow the click that follows a drag so we don't accidentally navigate.
    const onClickCapture = (e: MouseEvent) => {
      if (didMove) {
        didMove = false;
        e.stopPropagation();
        e.preventDefault();
      }
    };

    outer.addEventListener("wheel", onWheel, { passive: false });
    outer.addEventListener("pointerdown", onPointerDown);
    outer.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
    outer.addEventListener("click", onClickCapture, true);

    return () => {
      outer.removeEventListener("wheel", onWheel);
      outer.removeEventListener("pointerdown", onPointerDown);
      outer.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
      outer.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView((v) => {
      const next = clampScale(v.scale * factor);
      const ratio = next / v.scale;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      return {
        scale: next,
        x: cx - (cx - v.x) * ratio,
        y: cy - (cy - v.y) * ratio,
      };
    });
  }, []);

  const reset = useCallback(() => setView(IDENTITY), []);

  if (error) {
    return (
      <div className="text-sm text-destructive">Failed to load: {error}</div>
    );
  }

  return (
    <div
      ref={outerRef}
      className="relative w-full h-full overflow-hidden rounded-md border bg-white cursor-grab"
    >
      <div
        ref={innerRef}
        className="schematic absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
        dangerouslySetInnerHTML={innerHtml}
      />
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() => zoomBy(ZOOM_STEP)}
          title="Zoom in"
        >
          <ZoomIn />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          title="Zoom out"
        >
          <ZoomOut />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={reset}
          title="Reset view"
        >
          <Maximize2 />
        </Button>
      </div>
    </div>
  );
}

function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

function makeResponsive(svgText: string): string {
  return svgText.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const w = /\bwidth="([^"]+)"/.exec(attrs)?.[1];
    const h = /\bheight="([^"]+)"/.exec(attrs)?.[1];
    const hasViewBox = /\bviewBox=/.test(attrs);
    let next = attrs
      .replace(/\s*\bwidth="[^"]*"/, "")
      .replace(/\s*\bheight="[^"]*"/, "");
    if (!hasViewBox && w && h) next += ` viewBox="0 0 ${w} ${h}"`;
    next += ' preserveAspectRatio="xMidYMid meet"';
    return `<svg${next}>`;
  });
}
