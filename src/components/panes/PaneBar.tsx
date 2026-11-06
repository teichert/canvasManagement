"use client";
import { useRef } from "react";
import { PopOutLink } from "./PopOutLink";
import { MaxRule } from "./PaneRules";

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
