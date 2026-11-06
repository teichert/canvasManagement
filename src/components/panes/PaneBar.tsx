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
  width,
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
  /** How wide the pane is, and the widest it may be made (Infinity: no limit), for the max rule. */
  width: number;
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
      {!collapsed && <MaxRule label={label} width={width} maxWidth={maxWidth} onMax={onMax} />}
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
function MaxRule({ label, width, maxWidth, onMax }: { label: string; width: number; maxWidth: number; onMax: (max: number | undefined) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<number | null>(null);
  // the rule's room down the bar, measured
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fromMax = Number.isFinite(maxWidth) ? Math.sqrt(Math.max(maxWidth * maxWidth - width * width, 0)) : Infinity;
  const length = Math.min(live ?? fromMax, height);
  const at = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    return box ? Math.min(Math.max(e.clientY - box.top, 0), box.height) : 0;
  };
  const maxFor = (l: number) => (l >= height - 4 ? undefined : Math.round(Math.sqrt(width * width + l * l)));
  return (
    <div ref={ref} className="absolute top-1 bottom-6 -right-px w-1" aria-hidden={false}>
      <div className="absolute top-0 right-0 w-px bg-slate-600" style={{ height: length }} />
      <div
        role="slider"
        aria-label={`Widest ${label}`}
        aria-valuetext={Number.isFinite(maxWidth) ? `${Math.round(maxWidth)} px` : "no limit"}
        title={`${label} can't be made wider than the distance from here to its top-right corner: drag up or down (to the bottom: no limit)`}
        className="absolute -right-1 size-2.5 -mt-1 rounded-full bg-slate-500 hover:bg-slate-200 cursor-ns-resize touch-none"
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
