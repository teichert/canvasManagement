"use client";
import { useRouterState } from "@tanstack/react-router";
import { usePanes } from "./PaneStrip";
import { useEdgeDrag } from "./useEdgeDrag";
import { barClass, ResizeSquare, useDragHandlers, ViewChoice, ViewIcons } from "./PaneBar";
import { isShown } from "./paneStore";
import { openPopOut, popOutUrl } from "@/app/course/[courseName]/panes/popOut";

/**
 * The bar before the first pane, with no pane of its own, the end bar's
 * mirror: the row's left edge. Dragged, it moves the first pane's left edge
 * (the empty room before it, see withLead); its resize square's right half
 * resizes the first pane past its limits, its left half moves the edge as
 * the bar does. Under the square, the views (see ViewIcons): a click
 * showing the view's pane (see usePanes().showView) or opening a new one at
 * the start of the row when there is none (Ctrl-click: a new one
 * regardless); Shift-click opens the view in a new window following this one.
 */
export function StartBar({ views }: { views: ViewChoice[] }) {
  const { panes, narrow, addPaneFirst, showView, close, setLimits, setWidths } = usePanes();
  const { dragEdge, endDrag } = useEdgeDrag();
  const handlers = useDragHandlers((e, x) => dragEdge(0, e.clientX - x), endDrag);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (narrow) return null;
  const first = panes.find(isShown);
  return (
    <div
      data-pane-start
      role="separator"
      aria-orientation="vertical"
      aria-label="The row's left edge"
      title="Drag to move the first pane's left edge within its limits (the square goes past them)"
      style={{ order: -2 }}
      className={barClass + "touch-none cursor-col-resize border-slate-800 bg-gray-900 text-slate-300 hover:bg-slate-800/60"}
      {...handlers}
    >
      {first && (
        <ResizeSquare
          sides={{ right: first.label }}
          onDrag={(e, x, side) => dragEdge(0, e.clientX - x, side === "right" ? first.id : undefined)}
          onDragEnd={endDrag}
          onReset={() => {
            setLimits(first.id, { min: undefined, max: undefined });
            setWidths({ [first.id]: first.defaultWidth });
          }}
        />
      )}
      <ViewIcons
        views={views}
        hint="show its pane (its first open one, else its first, expanded), or a new one at the start of the row when there is none. Ctrl: a new one at the start. Shift: in a new window following this one"
        hrefOf={(view) => popOutUrl(pathname, view)}
        onView={(view, e) => (e.shiftKey && !e.ctrlKey && !e.metaKey ? openPopOut(pathname, view, true) : e.ctrlKey || e.metaKey ? addPaneFirst(view) : showView(view, "start"))}
        menuSide="right"
        extras={[{ label: "Close every pane", onClick: () => close(panes.map((p) => p.id)) }]}
      />
    </div>
  );
}
