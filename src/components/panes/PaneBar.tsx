"use client";
import { useRef } from "react";
import { PopOutLink } from "./PopOutLink";
import { MaxRule } from "./PaneRules";

// pointer travel that counts as a drag rather than a click
const dragThreshold = 4;

export const barClass =
  "relative max-md:hidden flex-none select-none w-5 py-2 flex flex-col items-center gap-1 rounded border text-xs font-semibold ";

export type Side = "left" | "right";

/**
 * Pointer handlers for something dragged sideways: `onDrag` once the
 * pointer has travelled, with where it started; `onDragEnd` on release
 * after a drag; `onClick` on release without one. The pointer is captured,
 * so the drag goes on outside the element.
 */
export function useDragHandlers(onDrag: (e: React.PointerEvent, startX: number) => void, onDragEnd: () => void, onClick?: () => void) {
  const start = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      // no text selection or native drag of what the pointer crosses, and no drag of the bar behind
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY, dragged: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
      if (!s.dragged && Math.hypot(e.clientX - s.x, e.clientY - s.y) < dragThreshold) return;
      s.dragged = true;
      onDrag(e, s.x);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (start.current?.dragged) onDragEnd();
      else if (start.current) onClick?.();
      start.current = null;
    },
  };
}

/**
 * The resize square on a bar, below the pop-out icon, in three columns. A
 * drag from either third moves this edge like a drag of the bar, but the
 * pane on that side gives or takes past its limits: from the left third
 * the pane on the bar's left, from the right third the pane on its right.
 * The drag gets its way, and a limit of that pane it crosses
 * moves with it, that pane's only; double-clicking a third puts that pane's
 * limits back to its own. A drag from the middle third moves the bar's own
 * pane along the row (the cursor says which: resize, move, resize). A third
 * with nothing to do is blank.
 */
export function ResizeSquare({
  sides,
  onDrag,
  onDragEnd,
  onReset,
  move,
}: {
  /** The label of the open pane on each side that has one. */
  sides: Partial<Record<Side, string>>;
  onDrag: (e: React.PointerEvent, startX: number, side: Side) => void;
  onDragEnd: () => void;
  /** Double-click on a third: that side's pane's limits back to its own. */
  onReset: (side: Side) => void;
  /** The bar's own pane, moved along the row to where the pointer is as it is dragged. */
  move?: { label: string; onMove: (e: React.PointerEvent) => void };
}) {
  return (
    <div
      data-resize-square
      className="flex-none grid grid-cols-3 w-full h-6 rounded-sm border border-slate-600 overflow-hidden divide-x divide-slate-600"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {sides.left === undefined ? <Blank /> : <Third side="left" label={sides.left} onDrag={onDrag} onDragEnd={onDragEnd} onReset={onReset} />}
      {move ? <Mover {...move} /> : <Blank />}
      {sides.right === undefined ? <Blank /> : <Third side="right" label={sides.right} onDrag={onDrag} onDragEnd={onDragEnd} onReset={onReset} />}
    </div>
  );
}

const Blank = () => <div className="h-full bg-slate-800/40" />;

function Mover({ label, onMove }: { label: string; onMove: (e: React.PointerEvent) => void }) {
  const handlers = useDragHandlers((e) => onMove(e), () => {});
  return (
    <div
      role="slider"
      aria-label={`Move ${label}`}
      title={`Drag: move ${label} along the row`}
      className="h-full touch-none cursor-move hover:bg-slate-500"
      {...handlers}
    />
  );
}

function Third({
  side,
  label,
  onDrag,
  onDragEnd,
  onReset,
}: {
  side: Side;
  label: string;
  onDrag: (e: React.PointerEvent, startX: number, side: Side) => void;
  onDragEnd: () => void;
  onReset: (side: Side) => void;
}) {
  const handlers = useDragHandlers((e, x) => onDrag(e, x, side), onDragEnd);
  return (
    <div
      role="slider"
      aria-label={`Resize ${label}`}
      title={`Drag: move this edge, with ${label} giving or taking room past its narrowest or widest width if need be (they follow). Double-click: its limits back to its own`}
      className={"h-full touch-none hover:bg-slate-500 " + (side === "left" ? "cursor-w-resize" : "cursor-e-resize")}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset(side);
      }}
      {...handlers}
    />
  );
}

/**
 * A pane's bar, on its left edge: its name along it, bottom-up. A click
 * collapses or expands the pane; a drag moves the edge within every pane's
 * limits (the caller says what that resizes; it gets where the drag
 * started); the resize square under the pop-out icon resizes one pane past
 * its limits, which then follow; the × at the bottom hides the pane.
 */
export function PaneBar({
  label,
  collapsed,
  maxWidth,
  onMax,
  popOutHref,
  square,
  onMove,
  onToggle,
  onHide,
  onDrag,
  onDragEnd,
  onReset,
}: {
  label: string;
  collapsed: boolean;
  /** The widest the pane may be made (Infinity: no limit), for the max rule, and setting it from the rule. */
  maxWidth: number;
  onMax: (max: number | undefined) => void;
  /** The pane in its own window: what the page shows, and which pane. */
  popOutHref: { pathname: string; pane: string };
  /** The open panes on either side of the bar, for the resize square. */
  square: Partial<Record<Side, string>>;
  /** Moves this pane along the row to where the pointer is (the square's middle third). */
  onMove: (e: React.PointerEvent) => void;
  onToggle: () => void;
  onHide: () => void;
  onDrag: (e: React.PointerEvent, startX: number, side?: Side) => void;
  onDragEnd: () => void;
  onReset: (side: Side) => void;
}) {
  const handlers = useDragHandlers((e, x) => onDrag(e, x), onDragEnd, onToggle);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Show ${label}` : `Collapse ${label}`}
      title={(collapsed ? `Show ${label}` : `Collapse ${label}`) + "; drag to move this edge within the panes' limits (the square goes past them)"}
      className={
        barClass +
        "touch-none cursor-col-resize " +
        (collapsed
          ? "border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          : "border-slate-800 bg-gray-900 text-slate-300 hover:bg-slate-800/60")
      }
      {...handlers}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <PopOutLink label={label} pathname={popOutHref.pathname} pane={popOutHref.pane} />
      <ResizeSquare sides={square} onDrag={onDrag} onDragEnd={onDragEnd} onReset={onReset} move={{ label, onMove }} />
      <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{label}</span>
      {collapsed && (
        <span className="mt-auto">
          <HideButton label={label} onHide={onHide} />
        </span>
      )}
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
