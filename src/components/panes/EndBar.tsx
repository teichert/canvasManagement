"use client";
import { useRouterState } from "@tanstack/react-router";
import { usePanes } from "./PaneStrip";
import { useEdgeDrag } from "./useEdgeDrag";
import { barClass, ResizeSquare, useDragHandlers, ViewChoice, ViewIcons } from "./PaneBar";
import { isShown } from "./paneStore";
import { openPopOut, popOutUrl } from "@/app/course/[courseName]/panes/popOut";

/**
 * The bar after the last pane, with no pane of its own: the row's right
 * edge. Dragged, it widens the last pane into the empty room or narrows it;
 * its resize square's left half resizes the last pane past its limits, as
 * any bar's does for the pane on its left; its right half, with no pane
 * there, moves the edge as the bar does. Under the square, the views (see
 * ViewIcons): a click shows the view's first open pane where it is, or
 * expands its first pane, or, with none on the page, opens a new one at the
 * end of the row (Ctrl-click: a new one regardless); Shift-click opens the
 * view in a new window following this one.
 */
export function EndBar({ views = [] }: { views?: ViewChoice[] }) {
  const { panes, narrow, setLimits, setWidths, addPane, showView, close } = usePanes();
  const { dragEdge, endDrag } = useEdgeDrag();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
          onReset={() => {
            setLimits(last.id, { min: undefined, max: undefined });
            setWidths({ [last.id]: last.defaultWidth });
          }}
        />
      )}
      {views.length > 0 && (
        <ViewIcons
          views={views}
          hint="show its pane (its first open one, else its first, expanded), or a new one at the end of the row when there is none. Ctrl: a new one at the end. Shift: in a new window following this one"
          hrefOf={(view) => popOutUrl(pathname, view)}
          onView={(view, e) => (e.shiftKey && !e.ctrlKey && !e.metaKey ? openPopOut(pathname, view, true) : e.ctrlKey || e.metaKey ? addPane(view) : showView(view, "end"))}
          menuSide="left"
          drag={{ onDrag: (e, x) => dragEdge(panes.length, e.clientX - x), onDragEnd: endDrag }}
          extras={[{ label: "Close every pane", onClick: () => close(panes.map((p) => p.id)) }]}
        />
      )}
    </div>
  );
}
