"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { PopOutIcon } from "../icons/ActionIcons";
import { openPopOut } from "@/app/course/[courseName]/panes/popOut";

// pointer travel that counts as a drag rather than a click on the bar
const dragThreshold = 4;

const barClass =
  "relative max-md:hidden flex-none select-none w-5 py-2 flex flex-col items-center gap-1 rounded border text-xs font-semibold ";

/**
 * A pane's bar, on its left edge: its name along it, bottom-up. A click
 * collapses or expands the pane; a drag moves the edge (the caller says
 * what that resizes; it gets where the drag started); the × at the bottom
 * hides the pane.
 */
export function PaneBar({
  label,
  collapsed,
  maxWidth,
  onMax,
  popOutHref,
  onToggle,
  onHide,
  onDrag,
  onDragEnd,
}: {
  label: string;
  collapsed: boolean;
  /** The widest the pane may be made (Infinity: no limit), for the max rule. */
  maxWidth: number;
  onMax: (max: number | undefined) => void;
  /** The pane in its own window: what the page shows, and which pane. */
  popOutHref: { pathname: string; pane: string };
  onToggle: () => void;
  onHide: () => void;
  onDrag: (e: React.PointerEvent, startX: number) => void;
  onDragEnd: () => void;
}) {
  const start = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const name = <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{label}</span>;
  const popOut = <PopOutLink label={label} pathname={popOutHref.pathname} pane={popOutHref.pane} />;
  const hide = (
    <span className="mt-auto">
      <HideButton label={label} onHide={onHide} />
    </span>
  );
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Show ${label}` : `Collapse ${label}`}
      title={(collapsed ? `Show ${label}` : `Collapse ${label}`) + "; drag to resize the pane to the left"}
      className={
        barClass +
        "touch-none cursor-col-resize " +
        (collapsed
          ? "border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          : "border-slate-800 bg-gray-900 text-slate-300 hover:bg-slate-800/60")
      }
      onPointerDown={(e) => {
        // no text selection or native drag of what the pointer crosses
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, dragged: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        if (!s.dragged && Math.hypot(e.clientX - s.x, e.clientY - s.y) < dragThreshold) return;
        s.dragged = true;
        onDrag(e, s.x);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (start.current?.dragged) onDragEnd();
        else if (start.current) onToggle();
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {popOut}
      {name}
      {collapsed && hide}
      {!collapsed && <MaxRule label={label} maxWidth={maxWidth} onMax={onMax} />}
    </div>
  );
}

/** The link that opens a pane in its own window, following this one (a plain open of the link, from the middle button say, follows nothing). */
export function PopOutLink({ label, pathname, pane }: { label: string; pathname: string; pane: string }) {
  return (
    <a
      className="flex-none text-slate-500 hover:text-slate-200"
      href={`${pathname}?pane=${pane}`}
      target="_blank"
      aria-label={`Open ${label} in its own window`}
      title={`${label} in its own window, following this one as you move between items`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openPopOut(pathname, pane);
      }}
    >
      <PopOutIcon />
    </a>
  );
}

/** The × that takes a pane off the page; the View menu puts it back. */
export function HideButton({ label, onHide }: { label: string; onHide: () => void }) {
  return (
    <button
      className="unstyled !p-0 !px-1 leading-none text-slate-500 hover:text-red-300"
      aria-label={`Hide ${label}`}
      title={`Hide ${label} (show it again from the View menu)`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onHide();
      }}
    >
      ×
    </button>
  );
}

/**
 * The pane's widest width, as a rule down the right of its bar: the
 * distance from the rule's end to the open pane's top-right corner is the
 * maximum, so the end moves by itself as the pane is resized, and reaches
 * the top when the pane is as wide as it may be. Dragging the end sets the
 * maximum; dragged to the bottom, there is none.
 */
function MaxRule({ label, maxWidth, onMax }: { label: string; maxWidth: number; onMax: (max: number | undefined) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<number | null>(null);
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
  // the maximum is the bar plus the distance from the rule's end to the
  // pane's top-right corner: across the pane's content, down the rule
  const across = Math.max(width - bar, 0);
  const fromMax = Number.isFinite(maxWidth) ? Math.sqrt(Math.max((maxWidth - bar) ** 2 - across ** 2, 0)) : Infinity;
  const length = Math.min(live ?? fromMax, height);
  const at = (e: React.PointerEvent) => {
    const rule = ref.current?.getBoundingClientRect();
    return rule ? Math.min(Math.max(e.clientY - rule.top, 0), height) : 0;
  };
  const maxFor = (l: number) => (l >= height - 4 ? undefined : Math.round(bar + Math.sqrt(across ** 2 + l ** 2)));
  return (
    <div ref={ref} className="absolute -right-px w-1" style={{ top: box.top, height }}>
      <div className="absolute top-0 right-0 w-px bg-slate-700" style={{ height: length }} />
      {/* while dragged: the diagonal whose length is the bound, from the end to the pane's top-right corner */}
      {live !== null && (
        <svg className="absolute top-0 left-full pointer-events-none overflow-visible z-20" width={across} height={Math.max(length, 1)}>
          <line x1={0} y1={length} x2={across} y2={0} className="stroke-slate-400" strokeWidth={1} strokeDasharray="4 3" />
          <text x={across / 2 + 4} y={length / 2 - 4} className="fill-slate-300 text-[10px]">
            {length >= height - 4 ? "no limit" : `${maxFor(length)} px`}
          </text>
        </svg>
      )}
      <div
        role="slider"
        aria-label={`Widest ${label}`}
        aria-valuetext={Number.isFinite(maxWidth) ? `${Math.round(maxWidth)} px` : "no limit"}
        title={`${label} can't be made wider than the distance from here to its top-right corner: drag up or down (to the bottom: no limit)`}
        className="absolute -right-[2.5px] size-1.5 -mt-[3px] rounded-full bg-slate-500 hover:bg-slate-200 cursor-ns-resize touch-none"
        style={{ top: length }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setLive(at(e));
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (live !== null) setLive(at(e));
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          e.currentTarget.releasePointerCapture(e.pointerId);
          if (live !== null) onMax(maxFor(at(e)));
          setLive(null);
        }}
      />
    </div>
  );
}
