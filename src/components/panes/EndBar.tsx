"use client";
import { usePanes } from "./PaneStrip";
import { useEdgeDrag } from "./useEdgeDrag";
import { barClass, ResizeSquare, useDragHandlers } from "./PaneBar";
import { isShown } from "./paneStore";

/**
 * The bar after the last pane, with no pane of its own: the row's right
 * edge. Dragged, it widens the last pane into the empty room or narrows it;
 * its resize square's left half resizes the last pane past its limits, as
 * any bar's does for the pane on its left; its right half, with no pane
 * there, moves the edge as the bar does.
 */
export function EndBar() {
  const { panes, narrow, setLimits } = usePanes();
  const { dragEdge, endDrag } = useEdgeDrag();
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
    </div>
  );
}
