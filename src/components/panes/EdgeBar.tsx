"use client";
import { useRouterState } from "@tanstack/react-router";
import { usePanes } from "./PaneStrip";
import { useEdgeDrag } from "./useEdgeDrag";
import { barClass, ResizeSquare, Side, useDragHandlers } from "./PaneBar";
import { ViewChoice, ViewIcons } from "./ViewIcons";
import { isShown } from "./paneStore";
import { paneElement } from "./measureRow";
import { openPopOut, popOutUrl } from "@/app/course/[courseName]/panes/popOut";

/**
 * The bar at either end of the row, with no pane of its own: the row's
 * left or right edge. Dragged, it moves the edge of the pane at that end
 * (into the empty room, or the room before the first pane, see withLead);
 * its resize square's inner half resizes that pane past its limits, the
 * outer half moves the edge as the bar does, a double-click makes the
 * pane's narrowest width its current width. Under the square, the views (see
 * ViewIcons): a click shows the view's first open pane where it is, or
 * expands its first pane, or opens a new one at this end of the row when
 * there is none (Ctrl-click: a new one regardless); Shift-click opens the
 * view in a new window following this one.
 */
export function EdgeBar({ end, views }: { end: "start" | "end"; views: ViewChoice[] }) {
  const { panes, narrow, setLimits, addPane, showView, close, restoreDefaults } = usePanes();
  const { dragEdge, endDrag } = useEdgeDrag();
  const at = end === "start" ? 0 : panes.length;
  const handlers = useDragHandlers((e, x) => dragEdge(at, e.clientX - x), endDrag);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (narrow) return null;
  const shown = panes.filter(isShown);
  const pane = end === "start" ? shown[0] : shown[shown.length - 1];
  // the pane is on the row's inner side of this bar
  const inner: Side = end === "start" ? "right" : "left";
  const add = (view: string) => addPane(view, end === "start" ? 0 : undefined);
  return (
    <div
      data-pane-edge={end}
      role="separator"
      aria-orientation="vertical"
      aria-label={`The row's ${end === "start" ? "left" : "right"} edge`}
      title={`Drag to resize the ${end === "start" ? "first" : "last"} pane within its limits (the square goes past them)`}
      style={{ order: end === "start" ? -2 : 9999 }}
      className={barClass + "touch-none cursor-col-resize border-slate-800 bg-gray-900 text-slate-300 hover:bg-slate-800/60"}
      {...handlers}
    >
      {pane && (
        <ResizeSquare
          sides={{ [inner]: pane.label }}
          onDrag={(e, x, side) => dragEdge(at, e.clientX - x, side === inner ? pane.id : undefined)}
          onDragEnd={endDrag}
          onReset={() => setLimits(pane.id, { min: Math.round(paneElement(pane.id)?.getBoundingClientRect().width ?? pane.width) })}
        />
      )}
      <ViewIcons
        views={views}
        hint={`show its pane (its first open one, else its first, expanded), or a new one at the ${end} of the row when there is none. Ctrl: a new one at the ${end}. Shift: in a new window following this one`}
        hrefOf={(view) => popOutUrl(pathname, view)}
        onPopOut={(view) => openPopOut(pathname, view)}
        onView={(view, e) => (e.shiftKey && !e.ctrlKey && !e.metaKey ? openPopOut(pathname, view, true) : e.ctrlKey || e.metaKey ? add(view) : showView(view, end))}
        menuSide={inner}
        drag={{ onDrag: (e, x) => dragEdge(at, e.clientX - x), onDragEnd: endDrag }}
        extras={[
          { label: "Close every pane", onClick: () => close(panes.map((p) => p.id)) },
          { label: "Restore the default layout", onClick: restoreDefaults },
        ]}
      />
    </div>
  );
}
