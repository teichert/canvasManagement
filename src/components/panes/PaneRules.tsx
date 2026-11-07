"use client";
import { RefObject, useLayoutEffect, useRef, useState } from "react";
import { maxWidthFor, ruleLengthFor } from "./paneStore";

// A pane's narrowest and widest widths, set by dragging the dot at the end
// of a rule (teichert#73): the min rule under its name, the max rule down
// its bar. The rules only draw and report; the pane store decides.

/**
 * The pane's narrowest width, as a rule under its name: the rule runs from
 * the pane's left edge as far as the minimum, and dragging its end sets it.
 * Dragged past the pane's width, the pane widens with it (`onWiden`, the
 * width beyond, answers how wide the pane got), and the dot goes no further
 * than the pane could; dragged back, only the minimum comes back, the pane
 * keeps its width. Double-clicked, the pane's width now becomes the minimum.
 */
export function MinRule({
  paneRef,
  min,
  floor,
  label,
  onWiden,
  onMin,
}: {
  paneRef: RefObject<HTMLDivElement | null>;
  min: number;
  floor: number;
  label: string;
  onWiden: (dx: number) => number;
  onMin: (min: number) => void;
}) {
  // while dragged: the minimum shown, and the pane's width when the drag began
  // the minimum shown while dragged; the pane's width when the drag began,
  // kept in a ref: pointer events can come faster than React renders
  const [live, setLive] = useState<number | null>(null);
  const startWidth = useRef<number | null>(null);
  const shown = live ?? min;
  // the bar's width, measured (it's in rem), so the rule ends where the minimum does
  const [bar, setBar] = useState(20);
  useLayoutEffect(() => {
    const el = paneRef.current?.firstElementChild;
    if (!el) return;
    const observer = new ResizeObserver(() => setBar(el.getBoundingClientRect().width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [paneRef]);
  const at = (e: React.PointerEvent) => {
    const box = paneRef.current?.getBoundingClientRect();
    return box ? Math.round(Math.max(e.clientX - box.left, floor)) : min;
  };
  return (
    <div className="max-md:hidden relative h-1 flex-none" title={`${label} can't be made narrower than this rule: drag its end`}>
      <div className="absolute top-0 left-0 h-px bg-slate-700" style={{ width: Math.max(shown - bar, 0) }} />
      {live !== null && (
        <span
          className="absolute top-1 z-40 whitespace-nowrap rounded bg-gray-950/90 px-1 text-[10px] text-slate-300 pointer-events-none"
          style={{ left: Math.max(shown - bar, 0) + 6 }}
        >
          min width {Math.round(shown)} px
        </span>
      )}
      <div
        role="slider"
        aria-label={`Narrowest ${label}`}
        aria-valuenow={shown}
        className="absolute z-40 -top-[2.5px] size-1.5 -ml-[3px] rounded-full bg-slate-500 hover:bg-slate-200 cursor-ew-resize touch-none"
        style={{ left: Math.max(shown - bar, 0) }}
        // double-click: the pane's width now becomes its narrowest
        onDoubleClick={() => onMin(Math.round(paneRef.current?.getBoundingClientRect().width ?? min))}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          startWidth.current = paneRef.current?.getBoundingClientRect().width ?? min;
          setLive(min);
        }}
        onPointerMove={(e) => {
          if (startWidth.current === null) return;
          const next = at(e);
          // no further than the pane got: where the bar after it could go
          const reached = onWiden(Math.max(next - startWidth.current, 0));
          setLive(Math.min(next, Math.max(reached, startWidth.current)));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          if (startWidth.current !== null) onMin(at(e));
          startWidth.current = null;
          setLive(null);
        }}
      />
    </div>
  );
}

/**
 * The pane's widest width, as a rule down the right of its bar: the
 * distance from the rule's end to the open pane's top-right corner is the
 * maximum, so the end moves by itself as the pane is resized, and reaches
 * the top when the pane is as wide as it may be. Dragging the end sets the
 * maximum; dragged to the bottom, there is none. Double-clicked, the
 * pane's width now becomes the maximum.
 */
export function MaxRule({ label, maxWidth, onMax }: { label: string; maxWidth: number; onMax: (max: number | undefined) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<number | null>(null);
  // whether it's being dragged, in a ref: pointer events can come faster than React renders
  const dragged = useRef(false);
  // measured, and followed as the pane is resized (a drag sets widths
  // without re-rendering): the pane's width on screen, the rule's room down
  // the bar, and where it starts, below the bar's icon
  const [box, setBox] = useState({ width: 0, height: 0, top: 0, bar: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    const bar = el?.parentElement;
    const pane = el?.closest("[data-pane]");
    if (!el || !bar || !pane) return;
    const measure = () => {
      const b = bar.getBoundingClientRect();
      const icon = bar.querySelector("a")?.getBoundingClientRect();
      const top = icon ? icon.bottom - b.top + 4 : 4;
      setBox({ width: pane.getBoundingClientRect().width, height: Math.max(b.height - top - 24, 0), top, bar: b.width });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  const { width, height, bar } = box;
  // the bound is the bar plus the diagonal from the rule's end to the pane's top-right corner (see ruleLengthFor)
  const across = Math.max(width - bar, 0);
  const fromMax = ruleLengthFor(maxWidth, width, bar);
  const length = Math.min(live ?? fromMax, height);
  const at = (e: React.PointerEvent) => {
    const rule = ref.current?.getBoundingClientRect();
    return rule ? Math.min(Math.max(e.clientY - rule.top, 0), height) : 0;
  };
  const maxFor = (l: number) => maxWidthFor(l, width, bar, height);
  return (
    <div ref={ref} className="absolute right-0.5 w-1.5 z-40" style={{ top: box.top, height }}>
      <div className="absolute top-0 right-0 w-px bg-slate-700" style={{ height: length }} />
      {/* while dragged: the diagonal whose length is the bound, from the end to the pane's top-right corner */}
      {live !== null && (
        <svg className="absolute top-0 left-full pointer-events-none overflow-visible z-20" width={across} height={Math.max(length, 1)}>
          <line x1={0} y1={length} x2={across} y2={0} className="stroke-slate-400" strokeWidth={1} strokeDasharray="4 3" />
          <text x={across / 2 + 4} y={length / 2 - 4} className="fill-slate-300 text-[10px]">
            {length >= height - 4 ? "max width: no limit" : `max width ${maxFor(length)} px`}
          </text>
        </svg>
      )}
      <div
        role="slider"
        aria-label={`Widest ${label}`}
        aria-valuetext={Number.isFinite(maxWidth) ? `${Math.round(maxWidth)} px` : "no limit"}
        title={`${label} can't be made wider than the distance from here to its top-right corner: drag up or down (to the bottom: no limit)`}
        className="absolute right-0 size-1.5 -mt-[3px] rounded-full bg-slate-500 hover:bg-slate-200 cursor-ns-resize touch-none"
        style={{ top: length }}
        // double-click: the pane's width now becomes its widest
        onDoubleClick={(e) => {
          e.stopPropagation();
          onMax(Math.round(width));
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragged.current = true;
          setLive(at(e));
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (dragged.current) setLive(at(e));
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          e.currentTarget.releasePointerCapture(e.pointerId);
          if (dragged.current) onMax(maxFor(at(e)));
          dragged.current = false;
          setLive(null);
        }}
      />
    </div>
  );
}
