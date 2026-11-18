"use client";
import { CSSProperties, ReactNode, RefObject, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePaneRegistration, usePanes } from "./PaneStrip";
import { MinRule } from "./PaneRules";
import { HideButton, PaneBar, Side, useDragHandlers } from "./PaneBar";
import { OnView, ViewChoice } from "./ViewIcons";
import { PopOutLink } from "./PopOutLink";
import { useRouterState } from "@tanstack/react-router";
import { isShown, viewOf } from "./paneStore";
import { applyWidth, useEdgeDrag } from "./useEdgeDrag";
import { paneElement } from "./measureRow";
import { openPopOut } from "@/app/course/[courseName]/panes/popOut";

/**
 * A pane in the strip: a bar on its left edge, then its content with its
 * name across the top. Collapsed, only the bar shows. Clicking the bar
 * collapses or expands the pane, and the bar stays where it is, so a second
 * click lands on it too; double-clicking the name focuses the pane (it open,
 * the rest collapsed). The bar sits between two panes, so dragging it moves
 * that edge. Dragged right, the pane to its left grows, shoving the panes
 * after it into the empty room at the end of the row; once that room is
 * used up, the open pane to its right shrinks, down to its minimum. Dragged
 * left, the pane to its left shrinks, down to its minimum, and the open
 * pane to its right grows. The other open panes keep their widths (see
 * widthRule); a drag from the bar's resize square is what takes a pane
 * past its limits, which then follow it, and a drag of the name on the bar
 * moves the pane along the row (see PaneBar). On a narrow window there are
 * no bars: the panes share one spot, the first open one visible and the
 * others kept as they are, scroll included.
 */
export function Pane({
  id,
  label,
  icon,
  minWidth = 120,
  defaultWidth = 432,
  keepMounted = true,
  collapsedByDefault = () => false,
  ssr = false,
  views,
  bodyRef,
  children,
}: {
  id: string;
  label: string;
  /** For the phone's view row. */
  icon?: ReactNode;
  /** In px; the pane can't get narrower. */
  minWidth?: number;
  /** In px; how wide the pane is until a drag or All sets it. */
  defaultWidth?: number;
  /** Keep the content while collapsed (scroll and state survive), or drop it (a heavy pane that fetches). */
  keepMounted?: boolean;
  /** Until the pane is first toggled (it can look at the window). */
  collapsedByDefault?: () => boolean;
  /** The server renders this pane expanded (the rest start collapsed until the remembered choices are known). */
  ssr?: boolean;
  /** The views the pane can be switched to, on its bar. */
  views?: ViewChoice[];
  bodyRef?: RefObject<HTMLDivElement | null> | ((el: HTMLDivElement | null) => void);
  children: ReactNode;
}) {
  usePaneRegistration({ id, label, icon, minWidth, defaultWidth, collapsedByDefault, ssr });
  const { panes, narrow, showing, flashing, setCollapsed, close, addPane, switchView, setLimits, setWidths, jumpTo, move } = usePanes();
  const { dragEdge, endDrag } = useEdgeDrag();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const popOutHref = { pathname, pane: viewOf(id) };
  const place = panes.findIndex((p) => p.id === id);
  const view = panes[place];
  const remembered = view?.collapsed ?? !ssr;
  const selected = narrow && showing === id;
  const collapsed = narrow ? !selected : remembered;
  const toggle = () => setCollapsed(id, !remembered);
  /** A view icon on this pane's bar: the pane shows that view; Ctrl: a new pane of it after this one; Ctrl+Shift: at the end; Shift: a new window following this one. */
  const onView: OnView = (view, e) => {
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) return openPopOut(pathname, view, true);
    if (e.ctrlKey || e.metaKey) return addPane(view, e.shiftKey ? undefined : place + 1);
    switchView(id, view);
  };
  const hide = () => close([id]);
  // a drag of the pane (its name, its menu icon or its title): the pane leaves the row for
  // the drag, a marker shows where it would land, a label by the pointer says what a drop
  // does; outside the window, the pane goes into a window of its own
  const [drag, setDrag] = useState<{ x: number; y: number; index: number; out: boolean; markerX: number; rowTop: number; rowHeight: number } | null>(null);
  const outside = (e: React.PointerEvent) => e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
  /** Where the pane would land: before the first other pane whose middle the pointer is left of, else last; and the marker's x. */
  const dropAt = (clientX: number) => {
    const rest = panes.filter((p) => p.id !== id && !p.hidden);
    const boxes = rest.map((p) => paneElement(p.id)?.getBoundingClientRect());
    let index = rest.length;
    for (let i = 0; i < rest.length; i++) {
      const box = boxes[i];
      if (box && clientX < box.left + box.width / 2) {
        index = i;
        break;
      }
    }
    const last = boxes[boxes.length - 1];
    const markerX = index < rest.length ? (boxes[index]?.left ?? 0) : (last?.right ?? 0);
    // the index among every other pane, hidden ones included (the order lists them)
    const among = panes.filter((p) => p.id !== id);
    return { index: index < rest.length ? among.indexOf(rest[index]) : among.length, markerX };
  };
  const onMove = (e: React.PointerEvent) => {
    const row = paneRef.current?.parentElement?.getBoundingClientRect();
    setDrag({ x: e.clientX, y: e.clientY, out: outside(e), ...dropAt(e.clientX), rowTop: row?.top ?? 0, rowHeight: row?.height ?? 0 });
  };
  const onMoveEnd = (e: React.PointerEvent) => {
    const d = drag;
    setDrag(null);
    if (outside(e)) {
      hide();
      openPopOut(pathname, viewOf(id));
    } else if (d && d.index !== place) move(id, d.index);
  };
  // the content is built the first time the pane is shown, then kept (scroll, state)
  const [built, setBuilt] = useState(!collapsed);
  if (!collapsed && !built) setBuilt(true);
  const mounted = built && (keepMounted || !collapsed);
  const paneRef = useRef<HTMLDivElement | null>(null);
  // the widths are applied imperatively: React keeps server-rendered
  // attributes during hydration, so a style from the document wouldn't reach the DOM
  const width = view?.width ?? defaultWidth;
  const hidden = view?.hidden ?? false;
  // re-applied when the pane comes back from hidden (that's a new element) and after a drag (which lifted it out)
  const dragging = drag !== null;
  useLayoutEffect(() => {
    if (paneRef.current && !dragging) applyWidth(paneRef.current, { minWidth, width }, place);
  }, [minWidth, width, place, hidden, dragging]);
  const effectiveMin = view?.minWidth ?? minWidth;
  const maxWidth = view?.maxWidth ?? Infinity;
  // the open panes on either side of this bar, for its resize square: the
  // nearest open pane before it and the nearest at or after it (this one
  // when it is open; a collapsed pane's bar still resizes its neighbours)
  const leftPane = panes.slice(0, place).reverse().find(isShown);
  const rightPane = panes.slice(place).find(isShown);
  const sidePane = (side?: Side) => (side === "left" ? leftPane : side === "right" ? rightPane : undefined);
  // the title drags the pane along the row as the name on the bar does
  const titleDrag = useDragHandlers(onMove, onMoveEnd);

  if (hidden) return null;
  return (
    <>
    {drag &&
      createPortal(
        <>
          {!drag.out && <div aria-hidden className="fixed z-50 w-0.5 bg-blue-400 pointer-events-none" style={{ left: drag.markerX - 1, top: drag.rowTop, height: drag.rowHeight }} />}
          <div
            aria-hidden
            className="fixed z-50 pointer-events-none flex items-center gap-1 rounded border border-slate-600 bg-gray-900/95 px-2 py-1 text-xs font-semibold text-slate-200 shadow-lg shadow-black/50"
            style={{ left: Math.min(Math.max(drag.x, 0), window.innerWidth - 220) + 12, top: Math.min(Math.max(drag.y, 0), window.innerHeight - 40) + 12 }}
          >
            {icon}
            {drag.out ? `Drop: ${label} in a window of its own` : `Drop: ${label} here`}
          </div>
        </>,
        document.body,
      )}
    <div
      ref={paneRef}
      // the panes sit in the order the user dragged them into (CSS order,
      // so the frame's markup needn't move)
      // lifted out of the row while dragged (still in the DOM: the handle keeps the pointer)
      style={{ order: place, ...(drag && { flex: "0 0 0px", width: 0, minWidth: 0, overflow: "hidden", visibility: "hidden" }) } as CSSProperties}
      className={
        "min-w-0 min-h-0 flex md:flex-row " +
        // narrow: every pane in the same grid cell, the unselected ones
        // invisible but laid out, so they keep their scroll
        "max-md:flex-col max-md:[grid-area:1/1] max-md:max-w-none! " +
        (selected ? "" : "max-md:invisible ") +
        (collapsed ? "md:flex-none! md:min-w-0! md:max-w-none! " : "") +
        // outlined for a moment: an edge bar's icon pointing at it (see usePanes().showView)
        (flashing === id ? "rounded ring-2 ring-blue-400 animate-pulse" : "")
      }
      data-pane={id}
    >
      <PaneBar
        label={label}
        collapsed={collapsed}
        maxWidth={maxWidth}
        onMax={(max) => setLimits(id, { max })}
        popOutHref={popOutHref}
        views={views}
        onView={onView}
        closeActions={[
          { label: "Close every pane", onClick: () => close(panes.map((p) => p.id)) },
          { label: "Close the panes to the left", onClick: () => close(panes.slice(0, place).map((p) => p.id)) },
          { label: "Close the panes to the right", onClick: () => close(panes.slice(place + 1).map((p) => p.id)) },
        ]}
        square={{ left: leftPane?.label, right: rightPane?.label }}
        onMove={onMove}
        onMoveEnd={onMoveEnd}
        onToggle={toggle}
        onHide={hide}
        // the bar is the edge before this pane, and follows the pointer; from the square, the pane on
        // that side is the one whose limits yield
        onDrag={(e, startX, side) => dragEdge(place, e.clientX - startX, sidePane(side)?.id)}
        onDragEnd={endDrag}
        // double-click on a half: that side's pane as it started, its own width and limits
        onReset={(side) => {
          const pane = sidePane(side);
          if (!pane) return;
          setLimits(pane.id, { min: undefined, max: undefined });
          setWidths({ [pane.id]: pane.defaultWidth });
        }}
      />
      <div
        className={"min-w-0 min-h-0 flex flex-col " + (collapsed && !narrow ? "flex-none md:w-0 overflow-hidden" : "flex-1")}
        inert={collapsed}
      >
        {!collapsed && (
          <div className="max-md:hidden flex-none flex flex-row items-center gap-2 border-b border-slate-800 text-xs font-semibold text-slate-300">
            <span className="ps-1 flex items-center">
              <PopOutLink label={label} pathname={pathname} pane={viewOf(id)} />
            </span>
            <button
              className="unstyled flex-1 min-w-0 truncate text-left !px-1 !py-1 hover:text-white touch-none cursor-move"
              title={`Drag: move ${label} along the row, or out of the window into one of its own. Double-click: focus it (it open, the rest collapsed)`}
              onDoubleClick={() => jumpTo(id)}
              {...titleDrag}
            >
              {label}
            </button>
            <button
              className="unstyled !p-0 !px-1 leading-none text-slate-500 hover:text-slate-200"
              aria-label={`Collapse ${label}`}
              title={`Collapse ${label} to its bar`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed(id, true);
              }}
            >
              &ndash;
            </button>
            <HideButton label={label} onHide={hide} />
          </div>
        )}
        {!collapsed && !narrow && (
          <MinRule
            paneRef={paneRef}
            min={effectiveMin}
            label={label}
            // past the pane's width, the pane follows the box, and keeps that width
            onLive={(min) => {
              if (paneRef.current && min > width) applyWidth(paneRef.current, { minWidth: min, width: min }, place);
            }}
            onMin={(min) => {
              setLimits(id, { min });
              if (min > width) setWidths({ [id]: min });
            }}
          />
        )}
        <div ref={bodyRef} className="min-w-0 min-h-0 flex-1 flex flex-col overflow-y-auto">
          {mounted && children}
        </div>
      </div>
    </div>
    </>
  );
}
