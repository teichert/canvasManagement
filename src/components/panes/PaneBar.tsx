"use client";
import { useRef } from "react";
import { MaxRule } from "./PaneRules";
import { OnView, ViewChoice, ViewIcons } from "./ViewIcons";
import { openPopOut } from "@/app/course/[courseName]/panes/popOut";

// pointer travel that counts as a drag rather than a click
const dragThreshold = 4;

export const barClass =
  "relative max-md:hidden flex-none select-none w-5 pb-2 flex flex-col items-center gap-1 rounded border text-xs font-semibold ";

export type Side = "left" | "right";

/**
 * Pointer handlers for something dragged sideways: `onDrag` once the
 * pointer has travelled, with where it started; `onDragEnd` on release
 * after a drag; `onClick` on release without one. The pointer is captured,
 * so the drag goes on outside the element.
 */
export function useDragHandlers(onDrag: (e: React.PointerEvent, startX: number) => void, onDragEnd: (e: React.PointerEvent) => void, onClick?: () => void) {
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
      if (start.current?.dragged) onDragEnd(e);
      else if (start.current) onClick?.();
      start.current = null;
    },
  };
}

/**
 * The resize square at the top of a bar, in two halves. A drag from either
 * half moves this edge like a drag of the bar, but the pane on that side
 * gives or takes past its limits: from the left half the nearest open pane
 * on the bar's left, from the right half the nearest on its right (so a
 * collapsed pane's bar resizes its open neighbours). The drag gets its way,
 * and a limit of that pane it crosses moves with it, that pane's only;
 * double-clicking a half makes that pane's narrowest width its current width. A half
 * with no open pane on its side moves the edge as a drag of the bar does,
 * within every pane's limits. No part of the square drags the bar itself.
 */
export function ResizeSquare({
  sides,
  onDrag,
  onDragEnd,
  onReset,
}: {
  /** The label of the nearest open pane on each side that has one. */
  sides: Partial<Record<Side, string>>;
  onDrag: (e: React.PointerEvent, startX: number, side: Side) => void;
  onDragEnd: () => void;
  /** Double-click on a half: that side's pane's narrowest width becomes its current width. */
  onReset: (side: Side) => void;
}) {
  return (
    <div
      data-resize-square
      // flush with the bar's top, its border over the bar's; the square is the square's, border
      // included: the bar's edge-drag cursor stops at it
      className="relative flex-none grid grid-cols-2 w-[calc(100%+2px)] -mx-px -mt-px h-6 rounded border border-slate-600 overflow-hidden divide-x divide-slate-600 cursor-default"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Half side="left" label={sides.left} onDrag={onDrag} onDragEnd={onDragEnd} onReset={onReset} />
      <Half side="right" label={sides.right} onDrag={onDrag} onDragEnd={onDragEnd} onReset={onReset} />
      {/* says what the square is for; the halves under it take the pointer */}
      <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-slate-400">
        ↔
      </span>
    </div>
  );
}

function Half({
  side,
  label,
  onDrag,
  onDragEnd,
  onReset,
}: {
  side: Side;
  /** The pane that yields; none: a plain drag of the edge. */
  label?: string;
  onDrag: (e: React.PointerEvent, startX: number, side: Side) => void;
  onDragEnd: () => void;
  onReset: (side: Side) => void;
}) {
  const handlers = useDragHandlers((e, x) => onDrag(e, x, side), onDragEnd);
  return (
    <div
      role="slider"
      aria-label={label ? `Resize ${label}` : "Move this edge"}
      title={
        label
          ? `Drag: move this edge, with ${label} giving or taking room past its narrowest or widest width if need be (they follow). Double-click: ${label} can't be made narrower than it is now`
          : "Drag: move this edge within the panes' limits"
      }
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
 * A pane's bar, on its left edge: under the resize square a menu of the
 * views (a pick gives the pane that view, see Pane), then its name along
 * it, bottom-up. A click
 * collapses or expands the pane; a drag moves the edge within every pane's
 * limits (the caller says what that resizes; it gets where the drag
 * started); the resize square at the top resizes one pane past its limits,
 * which then follow; a drag of the name moves
 * the pane along the row, and dropped outside the window, the pane goes
 * into a window of its own; the × at the bottom hides the pane.
 */
export function PaneBar({
  label,
  collapsed,
  maxWidth,
  onMax,
  popOutHref,
  views,
  onView,
  closeActions,
  square,
  onMove,
  onMoveEnd,
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
  /** What the page shows and which view this pane shows: the view icons' pop-out urls, and the marked one. */
  popOutHref: { pathname: string; pane: string };
  /** The views the pane can show, offered in the bar's menu. */
  views?: ViewChoice[];
  onView?: OnView;
  /** Closing panes in bulk, at the end of the view menu. */
  closeActions?: { label: string; onClick: () => void }[];
  /** The nearest open pane on either side of the bar, for the resize square. */
  square: Partial<Record<Side, string>>;
  /** Moves this pane along the row to where the pointer is (a drag of its name). */
  onMove: (e: React.PointerEvent) => void;
  /** Where a drag of the name ended. */
  onMoveEnd: (e: React.PointerEvent) => void;
  onToggle: () => void;
  onHide: () => void;
  onDrag: (e: React.PointerEvent, startX: number, side?: Side) => void;
  onDragEnd: () => void;
  onReset: (side: Side) => void;
}) {
  const handlers = useDragHandlers((e, x) => onDrag(e, x), onDragEnd, onToggle);
  const nameHandlers = useDragHandlers(onMove, onMoveEnd, onToggle);
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
      <ResizeSquare sides={square} onDrag={onDrag} onDragEnd={onDragEnd} onReset={onReset} />
      {views && onView && (
        <ViewIcons
          views={views}
          current={popOutHref.pane}
          stack={false}
          hint="show it in this pane. Ctrl: a new pane of it next to this one. Ctrl+Shift: at the end of the row. Shift: in a new window following this one"
          hrefOf={(view) => `${popOutHref.pathname}?pane=${view}`}
          onView={onView}
          onPopOut={(view) => openPopOut(popOutHref.pathname, view)}
          menuSide="right"
          drag={{ onDrag: (e, x) => onDrag(e, x), onDragEnd }}
          extras={closeActions}
        />
      )}
      <span
        className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap touch-none cursor-move hover:text-white"
        title={`Drag: move ${label} along the row, or out of the window into one of its own`}
        {...nameHandlers}
      >
        {label}
      </span>
      {/* a grip under the name: the name is the handle to move the pane by */}
      <span
        aria-hidden
        className="select-none touch-none cursor-move leading-none text-slate-500 hover:text-slate-200"
        title={`Drag: move ${label} along the row, or out of the window into one of its own`}
        {...nameHandlers}
      >
        ⋮⋮
      </span>
      {collapsed && (
        <span className="mt-auto">
          <HideButton label={label} onHide={onHide} />
        </span>
      )}
      {!collapsed && <MaxRule label={label} maxWidth={maxWidth} onMax={onMax} />}
    </div>
  );
}

/** The × that takes a pane off the page; the bar after the last pane adds views back. */
export function HideButton({ label, onHide }: { label: string; onHide: () => void }) {
  return (
    <button
      className="unstyled !p-0 !px-1 leading-none text-slate-500 hover:text-red-300"
      aria-label={`Hide ${label}`}
      title={`Take ${label} off the page (the bar after the last pane adds views)`}
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
