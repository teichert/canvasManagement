"use client";
import { CSSProperties, ReactNode, RefObject, useLayoutEffect, useRef, useState } from "react";
import { emptyRoom, paneElement, sized, usePaneRegistration, usePanes } from "./PaneStrip";
import { HideButton, PaneBar } from "./PaneBar";
import { useRouterState } from "@tanstack/react-router";
import { moveEdge, Sized, widthRule } from "./paneStore";

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
  const { panes, narrow, showing, setCollapsed, setHidden, setWidths, setLimits, jumpTo } = usePanes();
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
  const dragging = useRef<{ startX: number; open: Sized[]; free: number; now?: Record<string, number> } | null>(null);
  const effectiveMin = view?.minWidth ?? minWidth;
  const maxWidth = view?.maxWidth ?? Infinity;

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
        width={width}
        maxWidth={maxWidth}
        onMax={(max) => setLimits(id, { max })}
        popOutHref={popOutHref}
        onToggle={toggle}
        onHide={hide}
        onDrag={(e, startX) => {
          // every open pane as wide as it is now, and the empty room at the end of the row
          if (!dragging.current) dragging.current = { startX, open: sized(panes), free: emptyRoom(panes) };
          const { startX: x0, open, free } = dragging.current;
          // the edge sits before the first open pane at or after this bar (see moveEdge)
          const k = open.findIndex((p) => panes.findIndex((q) => q.id === p.id) >= place);
          const now = moveEdge(open, k === -1 ? open.length : k, e.clientX - x0, free);
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
        {!collapsed && !narrow && (
          <MinRule paneRef={paneRef} min={effectiveMin} floor={minWidth} label={label} onMin={(min) => setLimits(id, { min })} />
        )}
        <div ref={bodyRef} className="min-w-0 min-h-0 flex-1 flex flex-col overflow-y-auto">
          {mounted && children}
        </div>
      </div>
    </div>
  );
}

/**
 * The pane's narrowest width, as a rule under its name: the rule runs from
 * the pane's left edge as far as the minimum, and dragging its end sets it,
 * from the pane's own floor up to its width now.
 */
function MinRule({
  paneRef,
  min,
  floor,
  label,
  onMin,
}: {
  paneRef: RefObject<HTMLDivElement | null>;
  min: number;
  floor: number;
  label: string;
  onMin: (min: number) => void;
}) {
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? min;
  // the bar's width, measured (it's in rem), so the rule ends where the minimum does
  const [bar, setBar] = useState(20);
  useLayoutEffect(() => {
    const el = paneRef.current?.firstElementChild;
    if (!el) return;
    const observer = new ResizeObserver(() => setBar(el.getBoundingClientRect().width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [paneRef]);
  const at = (e: React.PointerEvent) => {
    const box = paneRef.current?.getBoundingClientRect();
    return box ? Math.round(Math.min(Math.max(e.clientX - box.left, floor), box.width)) : min;
  };
  return (
    <div className="max-md:hidden relative h-1.5 flex-none" title={`${label} can't be made narrower than this rule: drag its end`}>
      <div className="absolute top-0.5 left-0 h-px bg-slate-600" style={{ width: Math.max(shown - bar, 0) }} />
      <div
        role="slider"
        aria-label={`Narrowest ${label}`}
        aria-valuenow={shown}
        className="absolute -top-0.5 size-2.5 -ml-1 rounded-full bg-slate-500 hover:bg-slate-200 cursor-ew-resize touch-none"
        style={{ left: Math.max(shown - bar, 0) }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setLive(min);
        }}
        onPointerMove={(e) => {
          if (live !== null) setLive(at(e));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          if (live !== null) onMin(at(e));
          setLive(null);
        }}
      />
    </div>
  );
}
