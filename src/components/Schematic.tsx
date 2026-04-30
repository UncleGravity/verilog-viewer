import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prettyName } from "@/lib/names";
import type { Instance } from "@/types";

type Props = {
  svgUrl: string;
  jsonUrl: string;
  moduleName: string;
  instances: Instance[];
  onNavigate: (moduleName: string) => void;
};

type View = { x: number; y: number; scale: number };
const IDENTITY: View = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const DRAG_THRESHOLD_PX = 4;
const ZOOM_STEP = 1.2;

type YosysBit = number | string;
type YosysPort = {
  direction: "input" | "output" | "inout";
  bits: YosysBit[];
};
type YosysCellEntry = {
  type?: string;
  connections?: Record<string, YosysBit[]>;
};
type YosysNetname = { hide_name: 0 | 1; bits: YosysBit[] };
type YosysModule = {
  ports?: Record<string, YosysPort>;
  cells?: Record<string, YosysCellEntry>;
  netnames?: Record<string, YosysNetname>;
};
type YosysNetlist = { modules: Record<string, YosysModule> };

type SignalRef = {
  name: string;
  index: number;
  width: number;
  isPort: boolean;
};

type ModuleData = {
  bitToSignal: Map<string, SignalRef>;
  cellConnections: Map<string, Map<string, YosysBit[]>>;
};

export function Schematic({
  svgUrl,
  jsonUrl,
  moduleName,
  instances,
  onNavigate,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [moduleData, setModuleData] = useState<ModuleData | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    setModuleData(null);
    fetch(jsonUrl)
      .then((r) => r.json() as Promise<YosysNetlist>)
      .then((y) => {
        if (!cancelled) setModuleData(buildModuleData(y, moduleName));
      })
      .catch(() => {
        // Tooltip/port-width info is optional; failure shouldn't break the view.
      });
    return () => {
      cancelled = true;
    };
  }, [jsonUrl, moduleName]);

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

    // Mark bus wires (multi-bit nets) so CSS can draw them thicker.
    inner.querySelectorAll<SVGElement>('[class*="net_"]').forEach((el) => {
      for (const c of el.classList) {
        if (c.startsWith("net_") && c.includes(",")) {
          el.classList.add("bus");
          break;
        }
      }
    });

    // Tag top-level port cells so CSS can color them distinctly. Use a
    // plain `g` query + getAttribute since attribute names with colons
    // (the netlistsvg `s:` namespace) need awkward CSS escaping.
    inner.querySelectorAll<SVGElement>("g").forEach((g) => {
      const t = g.getAttribute("s:type");
      if (t === "inputExt") g.classList.add("port-input");
      else if (t === "outputExt") g.classList.add("port-output");
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

    // Annotate port labels with bus widths from the netlist. This edits the
    // existing label text in place (no overlays).
    if (moduleData) {
      inner
        .querySelectorAll<SVGElement>('g[id^="port_"]')
        .forEach((portG) => {
          const id = portG.id; // port_<inst>~<port>
          const sep = id.indexOf("~");
          if (sep < 0) return;
          const inst = id.slice("port_".length, sep);
          const portName = id.slice(sep + 1);
          const bits = moduleData.cellConnections.get(inst)?.get(portName);
          if (!bits || bits.length <= 1) return;
          const text = portG.querySelector("text");
          if (!text) return;
          const base = text.dataset.label ?? text.textContent ?? portName;
          text.dataset.label = base;
          text.textContent = `${base} [${bits.length}]`;
        });
    }

    const onCellClick = (e: MouseEvent) => {
      const cell = (e.target as Element | null)?.closest(".clickable-cell");
      if (!cell) return;
      const mod = moduleByCellId.get((cell as Element).id);
      if (mod) onNavigate(mod);
    };
    inner.addEventListener("click", onCellClick);
    return () => inner.removeEventListener("click", onCellClick);
  }, [svg, instances, moduleData, onNavigate]);

  // Highlight every segment of a net when hovering any one of its segments,
  // and show a floating tooltip with the net's source-level name.
  // netlistsvg labels each wire fragment (line/circle junction) with a
  // `net_<id>` class shared across the whole net, so a single class lookup
  // collects all geometry to light up.
  useEffect(() => {
    const inner = innerRef.current;
    const tooltip = tooltipRef.current;
    if (!inner || !svg) return;

    let highlighted: Element[] = [];
    let currentNet: string | null = null;

    const netClassOf = (el: Element | null): string | null => {
      if (!el || !el.classList) return null;
      for (const c of el.classList) {
        if (c.startsWith("net_")) return c;
      }
      return null;
    };

    const clear = () => {
      for (const el of highlighted) el.classList.remove("net-highlight");
      highlighted = [];
      currentNet = null;
      if (tooltip) tooltip.style.display = "none";
    };

    const positionTooltip = (clientX: number, clientY: number) => {
      if (!tooltip) return;
      tooltip.style.left = `${clientX + 12}px`;
      tooltip.style.top = `${clientY + 12}px`;
    };

    const onOver = (e: MouseEvent) => {
      const net = netClassOf(e.target as Element | null);
      if (!net) return;
      if (net !== currentNet) {
        clear();
        currentNet = net;
        highlighted = Array.from(inner.getElementsByClassName(net));
        for (const el of highlighted) el.classList.add("net-highlight");
        if (tooltip) {
          tooltip.textContent = moduleData
            ? netLabel(net, moduleData)
            : net.slice(4);
          tooltip.style.display = "block";
        }
      }
      positionTooltip(e.clientX, e.clientY);
    };

    const onMove = (e: MouseEvent) => {
      if (currentNet) positionTooltip(e.clientX, e.clientY);
    };

    const onOut = (e: MouseEvent) => {
      if (!currentNet) return;
      const leaving = netClassOf(e.target as Element | null);
      if (leaving !== currentNet) return;
      // Stay highlighted if pointer moved onto another segment of the same net.
      const entering = netClassOf(e.relatedTarget as Element | null);
      if (entering === currentNet) return;
      clear();
    };

    inner.addEventListener("mouseover", onOver);
    inner.addEventListener("mousemove", onMove);
    inner.addEventListener("mouseout", onOut);
    return () => {
      inner.removeEventListener("mouseover", onOver);
      inner.removeEventListener("mousemove", onMove);
      inner.removeEventListener("mouseout", onOut);
      clear();
    };
  }, [svg, moduleData]);

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
      <div
        ref={tooltipRef}
        className="net-tooltip pointer-events-none fixed z-20 hidden rounded border bg-white px-2 py-1 font-mono text-xs shadow"
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

// Build per-bit signal lookup + per-instance connections from a one-module
// Yosys netlist. We resolve names by priority: top-level ports, then
// user-named nets, then synthesizer-generated nets.
function buildModuleData(
  yosys: YosysNetlist,
  moduleName: string,
): ModuleData | null {
  const mod = yosys.modules?.[moduleName];
  if (!mod) return null;
  const bitToSignal = new Map<string, SignalRef>();
  const apply = (name: string, bits: YosysBit[], isPort: boolean) => {
    for (let i = 0; i < bits.length; i++) {
      const k = String(bits[i]);
      if (bitToSignal.has(k)) continue;
      bitToSignal.set(k, { name, index: i, width: bits.length, isPort });
    }
  };
  for (const [name, port] of Object.entries(mod.ports ?? {})) {
    apply(name, port.bits, true);
  }
  const nets = Object.entries(mod.netnames ?? {});
  for (const [name, n] of nets) if (n.hide_name === 0) apply(name, n.bits, false);
  for (const [name, n] of nets) if (n.hide_name === 1) apply(name, n.bits, false);

  const cellConnections = new Map<string, Map<string, YosysBit[]>>();
  for (const [inst, cell] of Object.entries(mod.cells ?? {})) {
    if (!cell.connections) continue;
    cellConnections.set(inst, new Map(Object.entries(cell.connections)));
  }
  return { bitToSignal, cellConnections };
}

// Turn an SVG `net_<bits>` class into a human-readable label, matching the
// bit list against the bitToSignal map. Returns the signal name (with index
// or [hi:lo] when partial) or a generic fallback for constants / mixed nets.
function netLabel(netClass: string, data: ModuleData): string {
  const bitsStr = netClass.slice(4);
  const bits = bitsStr.split(",");
  const refs = bits.map((b) => data.bitToSignal.get(b));

  if (refs.every((r) => r === undefined)) {
    return bits.length === 1
      ? `const '${bits[0]}'`
      : `const ${bits.length}'b${bits.join("")}`;
  }

  const first = refs[0];
  const same =
    first &&
    refs.every((r) => r && r.name === first.name && r.width === first.width);
  if (!same) return `(${bits.length} bits)`;

  const indices = refs.map((r) => r!.index);
  const width = first!.width;
  const name = first!.name;

  if (indices.length === 1) {
    return width === 1 ? name : `${name}[${indices[0]}]`;
  }

  const step = indices[1]! - indices[0]!;
  const contiguous =
    (step === 1 || step === -1) &&
    indices.every((idx, i) => i === 0 || idx - indices[i - 1]! === step);
  if (!contiguous) return `${name} (${indices.length} of ${width} bits)`;

  const hi = Math.max(indices[0]!, indices[indices.length - 1]!);
  const lo = Math.min(indices[0]!, indices[indices.length - 1]!);
  if (lo === 0 && hi === width - 1) return `${name} [${width}]`;
  return `${name}[${hi}:${lo}]`;
}

