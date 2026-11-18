"use client";
import { ReactNode, useRef, useState } from "react";
import { PanesIcon, PopOutIcon } from "../icons/ActionIcons";
import { useDragHandlers } from "./PaneBar";
import { usePanes } from "./PaneStrip";

/** A view a pane can show, as the bars offer it; `hidden`: listed below the menus' divider, off the icon stacks. */
export type ViewChoice = { id: string; label: string; icon: ReactNode; hidden?: boolean };
const divider = "__divider";
/** A view icon clicked: which view, and the click (its modifiers say what to do with it). */
export type OnView = (view: string, e: React.MouseEvent) => void;

/**
 * The views on a bar: a menu icon that lists them by name (with their
 * icons), and, with `stack`, one icon each under it. Each is a link to the
 * view's pop-out url (the middle button opens it in a tab, tied to
 * nothing); any other click goes to `onView`. The view this bar's pane
 * shows, if any, is marked. The menu icon dragged is the bar dragged
 * (`drag`), and the menu can end in more actions (`extras`). The menu's
 * rows are dragged by their handles into another order, or below the
 * divider, which takes a view off the icon stacks (the divider itself
 * drags too); that is remembered with the layout and changes no pane.
 */
export function ViewIcons({
  views,
  current,
  stack = true,
  hint,
  hrefOf,
  onView,
  onPopOut,
  menuSide,
  drag,
  extras = [],
}: {
  views: ViewChoice[];
  current?: string;
  /** The icons under the menu icon; without, the menu alone. */
  stack?: boolean;
  /** What a click does, after the view's name in the tooltip. */
  hint: string;
  hrefOf: (view: string) => string;
  onView: OnView;
  /** The view in its own window, from the icon on its row of the menu. */
  onPopOut: (view: string) => void;
  /** Where the menu opens: beside a vertical bar, or below a button in a horizontal one. */
  menuSide: "left" | "right" | "below";
  /** A drag of the menu icon: the bar's own drag (see PaneBar). */
  drag?: { onDrag: (e: React.PointerEvent, startX: number) => void; onDragEnd: (e: React.PointerEvent) => void };
  /** More items at the end of the menu. */
  extras?: { label: string; onClick: () => void }[];
}) {
  const [menuAt, setMenuAt] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { setViews } = usePanes();
  // the menu's rows in order, the divider among them; a drag moves one row on release
  // (reordering mid-drag would move the handle in the DOM and drop the pointer capture)
  const rows = [...views.filter((v) => !v.hidden).map((v) => v.id), divider, ...views.filter((v) => v.hidden).map((v) => v.id)];
  const dragging = useRef<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const handle = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = id;
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (dragging.current !== id) return;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-view-row]");
      const overId = over?.dataset.viewRow;
      if (!over || !overId || overId === id) return setDropAt(null);
      const box = over.getBoundingClientRect();
      setDropAt({ id: overId, after: e.clientY > box.top + box.height / 2 });
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (dropAt) {
        const rest = rows.filter((r) => r !== id);
        const at = rest.indexOf(dropAt.id) + (dropAt.after ? 1 : 0);
        const next = [...rest.slice(0, at), id, ...rest.slice(at)];
        const cut = next.indexOf(divider);
        setViews(next.filter((r) => r !== divider), next.slice(cut + 1));
      }
      dragging.current = null;
      setDropAt(null);
    },
  });
  const rowClass = (id: string) =>
    "flex items-center gap-1 rounded border-y-2 " +
    (dropAt?.id === id && !dropAt.after ? "border-t-blue-500 " : "border-t-transparent ") +
    (dropAt?.id === id && dropAt.after ? "border-b-blue-500" : "border-b-transparent");
  const grip = (id: string, label: string) => (
    <span className="w-4 cursor-grab select-none touch-none text-center text-slate-600 hover:text-slate-200" title={`Drag to move ${label} in the list; below the divider, it leaves the icons`} aria-label={`Move ${label}`} {...handle(id)}>
      ⋮⋮
    </span>
  );
  const toggleMenu = () => {
    const r = menuButton.current?.getBoundingClientRect();
    if (!r) return;
    const at = menuSide === "right" ? { top: r.top, left: r.right + 2 } : menuSide === "left" ? { top: r.top, right: window.innerWidth - r.left + 2 } : { top: r.bottom + 2, left: r.left };
    setMenuAt(menuAt ? null : at);
  };
  const none = () => {};
  const menuHandlers = useDragHandlers(drag?.onDrag ?? none, drag?.onDragEnd ?? none, toggleMenu);
  const click = (view: string) => (e: React.MouseEvent) => {
    // a middle click is no click; the rest are ours
    e.preventDefault();
    e.stopPropagation();
    setMenuAt(null);
    onView(view, e);
  };
  // a touch smaller than the bar's text, so the stack sits well inside the bar
  const icon = "unstyled !p-0 flex-none flex items-center justify-center size-5 text-[0.85em] rounded ";
  return (
    <>
      <button
        ref={menuButton}
        className={icon + "text-slate-500 hover:text-slate-200 touch-none"}
        aria-label="Views by name"
        aria-expanded={menuAt !== null}
        title={`The views by name. Each: ${hint}${drag ? ". Drag: move this edge" : ""}`}
        {...menuHandlers}
      >
        <PanesIcon />
      </button>
      {menuAt && (
        <>
          <div className="fixed inset-0 z-40 cursor-default" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setMenuAt(null); }} />
          <div
            role="menu"
            className="fixed z-50 rounded-xl border border-slate-700 bg-gray-900 shadow-lg shadow-black/50 p-1 text-sm font-normal cursor-default"
            style={menuAt}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {rows.map((id) => {
              const v = views.find((x) => x.id === id);
              if (!v)
                return (
                  <div key={divider} data-view-row={divider} className={rowClass(divider) + " text-[10px] uppercase tracking-wider text-slate-600"}>
                    {grip(divider, "the divider")}
                    <span className="flex-1 border-t border-slate-700" />
                    <span className="px-1" title="Views below are listed here but kept off the icons">hidden below</span>
                    <span className="flex-1 border-t border-slate-700" />
                  </div>
                );
              return (
              <div key={v.id} data-view-row={v.id} className={rowClass(v.id)}>
                {grip(v.id, v.label)}
                <a
                  role="menuitem"
                  href={hrefOf(v.id)}
                  className={"flex flex-1 items-center gap-2 rounded px-2 py-1 hover:bg-slate-800/60 hover:text-white " + (v.id === current ? "text-blue-300" : "text-slate-300")}
                  title={`${v.label}: ${hint}`}
                  onClick={click(v.id)}
                >
                  {v.icon}
                  {v.label}
                </a>
                <a
                  href={hrefOf(v.id)}
                  className="flex-none rounded px-1 py-1 text-slate-500 hover:text-slate-200"
                  aria-label={`${v.label} in its own window`}
                  title={`${v.label} in its own window, following this one`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuAt(null);
                    onPopOut(v.id);
                  }}
                >
                  <PopOutIcon />
                </a>
              </div>
              );
            })}
            {extras.map((extra, i) => (
              <button
                key={extra.label}
                role="menuitem"
                className={"unstyled w-full rounded px-2 py-1 text-left text-slate-400 hover:bg-slate-800/60 hover:text-white " + (i === 0 ? "mt-1 border-t border-slate-800" : "")}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuAt(null);
                  extra.onClick();
                }}
              >
                {extra.label}
              </button>
            ))}
          </div>
        </>
      )}
      {stack &&
        views.filter((v) => !v.hidden).map((v) =>
          v.id === current ? (
          <span key={v.id} className={icon + "text-blue-300"} title={`${v.label}, this pane's view`}>
            {v.icon}
          </span>
        ) : (
          <a
            key={v.id}
            href={hrefOf(v.id)}
            className={icon + "text-slate-500 hover:text-slate-200"}
            aria-label={v.label}
            title={`${v.label}: ${hint}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={click(v.id)}
          >
            {v.icon}
          </a>
        ),
        )}
    </>
  );
}
