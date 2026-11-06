"use client";
import { CSSProperties, ReactNode, RefObject, useLayoutEffect, useRef, useState } from "react";
import { paneElement, renderedWidths, usePaneRegistration, usePanes } from "./PaneStrip";
import { HideButton, PaneBar } from "./PaneBar";
import { useRouterState } from "@tanstack/react-router";
import { isShown, widthRule } from "./paneStore";

/** The room left empty at the end of the row the pane `id` is in. */
const emptyRoom = (id: string) => {
  const row = paneElement(id)?.parentElement;
  if (!row) return 0;
  const end = Math.max(...[...row.children].map((el) => el.getBoundingClientRect().right));
  return Math.max(row.getBoundingClientRect().right - end, 0);
};

const applyWidth = (el: HTMLElement, pane: { minWidth: number; width: number }, place: number) => {
  const rule = widthRule(pane, place);
  el.style.flex = rule.flex;
  el.style.minWidth = rule.minWidth;
  el.style.maxWidth = rule.maxWidth;
};

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
 * widthRule). On a narrow window
 * there are no bars: the panes share one spot, the first open one visible
 * and the others kept as they are, scroll included.
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
  bodyRef?: RefObject<HTMLDivElement | null> | ((el: HTMLDivElement | null) => void);
  children: ReactNode;
}) {
  usePaneRegistration({ id, label, icon, minWidth, defaultWidth, collapsedByDefault, ssr });
  const { panes, narrow, showing, setCollapsed, setHidden, setWidths, jumpTo } = usePanes();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const popOutHref = { pathname, pane: id };
  const place = panes.findIndex((p) => p.id === id);
  const view = panes[place];
  const remembered = view?.collapsed ?? !ssr;
  const selected = narrow && showing === id;
  const collapsed = narrow ? !selected : remembered;
  const toggle = () => setCollapsed(id, !remembered);
  const hide = () => setHidden(id, true);
  // the content is built the first time the pane is shown, then kept (scroll, state)
  const [built, setBuilt] = useState(!collapsed);
  if (!collapsed && !built) setBuilt(true);
  const mounted = built && (keepMounted || !collapsed);
  const paneRef = useRef<HTMLDivElement | null>(null);
  // the widths are applied imperatively: React keeps server-rendered
  // attributes during hydration, so a style from the document wouldn't reach the DOM
  const width = view?.width ?? defaultWidth;
  const hidden = view?.hidden ?? false;
  // re-applied when the pane comes back from hidden: that's a new element
  useLayoutEffect(() => {
    if (paneRef.current) applyWidth(paneRef.current, { minWidth, width }, place);
  }, [minWidth, width, place, hidden]);
  // while a bar is dragged, the open panes are resized live from how they
  // were when it started; the widths are remembered on release
  const dragging = useRef<{ startX: number; was: Record<string, number>; free: number; now?: Record<string, number> } | null>(null);

  if (hidden) return null;
  return (
    <div
      ref={paneRef}
      // the panes sit in the order the user dragged them into (CSS order,
      // so the frame's markup needn't move)
      style={{ order: place } as CSSProperties}
      className={
        "min-w-0 min-h-0 flex md:flex-row " +
        // narrow: every pane in the same grid cell, the unselected ones
        // invisible but laid out, so they keep their scroll
        "max-md:flex-col max-md:[grid-area:1/1] max-md:max-w-none! " +
        (selected ? "" : "max-md:invisible ") +
        (collapsed ? "md:flex-none! md:min-w-0! md:max-w-none!" : "")
      }
      data-pane={id}
    >
      <PaneBar
        label={label}
        collapsed={collapsed}
        popOutHref={popOutHref}
        onToggle={toggle}
        onHide={hide}
        onDrag={(e, startX) => {
          // every open pane as wide as it is now, and the empty room at the end of the row
          if (!dragging.current) dragging.current = { startX, was: renderedWidths(panes), free: emptyRoom(id) };
          const { startX: x0, was, free } = dragging.current;
          // the nearest open panes on either side of this bar, in the panes' order
          const left = panes.slice(0, place).reverse().find(isShown);
          const right = panes.slice(place).find(isShown);
          // how far the edge moves: left, until the left pane reaches its
          // minimum; right, through the empty room, then until the right
          // pane reaches its minimum
          const move = Math.max(
            left ? left.minWidth - was[left.id] : 0,
            Math.min(e.clientX - x0, free + (right ? was[right.id] - right.minWidth : 0)),
          );
          // moving right, the empty room goes first (the panes after are shoved), then the right pane
          const fromRight = move > 0 ? Math.max(move - free, 0) : move;
          const now = { ...was };
          if (left) now[left.id] = was[left.id] + move;
          if (right) now[right.id] = was[right.id] - fromRight;
          for (const p of panes) {
            const element = now[p.id] !== undefined && paneElement(p.id);
            if (element) applyWidth(element, { minWidth: p.minWidth, width: now[p.id] }, panes.indexOf(p));
          }
          dragging.current.now = now;
        }}
        onDragEnd={() => {
          if (dragging.current?.now) setWidths(dragging.current.now);
          dragging.current = null;
        }}
      />
      <div
        className={"min-w-0 min-h-0 flex flex-col " + (collapsed && !narrow ? "flex-none md:w-0 overflow-hidden" : "flex-1")}
        inert={collapsed}
      >
        {!collapsed && (
          <div className="max-md:hidden flex-none flex flex-row items-center gap-2 border-b border-slate-800 text-xs font-semibold text-slate-300">
            <button
              className="unstyled flex-1 min-w-0 truncate text-left !px-1 !py-1 hover:text-white"
              title={`Double-click to focus ${label} (it open, the rest collapsed)`}
              onDoubleClick={() => jumpTo(id)}
            >
              {label}
            </button>
            <HideButton label={label} onHide={hide} />
          </div>
        )}
        <div ref={bodyRef} className="min-w-0 min-h-0 flex-1 flex flex-col overflow-y-auto">
          {mounted && children}
        </div>
      </div>
    </div>
  );
}
