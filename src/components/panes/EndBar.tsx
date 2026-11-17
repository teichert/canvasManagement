"use client";
import { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { usePanes } from "./PaneStrip";
import { useEdgeDrag } from "./useEdgeDrag";
import { barClass, ResizeSquare, useDragHandlers } from "./PaneBar";
import { isShown } from "./paneStore";
import { openPopOut, popOutUrl } from "@/app/course/[courseName]/panes/popOut";

/**
 * The bar after the last pane, with no pane of its own: the row's right
 * edge. Dragged, it widens the last pane into the empty room or narrows it;
 * its resize square's left half resizes the last pane past its limits, as
 * any bar's does for the pane on its left; its right half, with no pane
 * there, moves the edge as the bar does. Under the square, an icon per
 * view, acting on the current pane (the last one clicked, added or shown):
 * a click makes it show that view; Ctrl-click adds a pane of the view
 * after it; Ctrl-Shift-click adds one at the end of the row; Shift-click
 * opens the view in a new window, following this one. Each is a link to
 * the view's pop-out url, so the middle button opens it in a tab, tied to nothing.
 */
export function EndBar({ views = [] }: { views?: { id: string; label: string; icon: ReactNode }[] }) {
  const { panes, narrow, setLimits, current, addPane, switchView } = usePanes();
  const { dragEdge, endDrag } = useEdgeDrag();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentPane = panes.find((p) => p.id === current && !p.hidden);
  const handlers = useDragHandlers((e, x) => dragEdge(panes.length, e.clientX - x), endDrag);
  if (narrow) return null;
  const last = [...panes].reverse().find(isShown);
  return (
    <div
      data-pane-end
      role="separator"
      aria-orientation="vertical"
      aria-label="The row's right edge"
      title="Drag to resize the last pane within its limits (the square goes past them)"
      style={{ order: 9999 }}
      className={barClass + "touch-none cursor-col-resize border-slate-800 bg-gray-900 text-slate-300 hover:bg-slate-800/60"}
      {...handlers}
    >
      {last && (
        <ResizeSquare
          sides={{ left: last.label }}
          onDrag={(e, x, side) => dragEdge(panes.length, e.clientX - x, side === "left" ? last.id : undefined)}
          onDragEnd={endDrag}
          onReset={() => setLimits(last.id, { min: undefined, max: undefined })}
        />
      )}
      {views.map((v) => (
        <a
          key={v.id}
          href={popOutUrl(pathname, v.id)}
          className="flex-none text-slate-500 hover:text-slate-200"
          aria-label={`${v.label} view`}
          title={`${v.label}: show it in the current pane${currentPane ? ` (${currentPane.label})` : ""}. Ctrl: a new pane of it next to the current. Ctrl+Shift: at the end. Shift: in a new window following this one`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey && !e.ctrlKey && !e.metaKey) return openPopOut(pathname, v.id, true);
            if (e.ctrlKey || e.metaKey) return addPane(v.id, e.shiftKey ? undefined : currentPane?.id);
            if (currentPane) switchView(currentPane.id, v.id);
            else addPane(v.id);
          }}
        >
          {v.icon}
        </a>
      ))}
    </div>
  );
}
