"use client";
import { useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { usePanes } from "./PaneStrip";
import { CaretDownIcon, CheckMarkIcon, PanesIcon } from "../icons/ActionIcons";
import { PopOutLink } from "./PopOutLink";

const button =
  "unstyled btn-thin flex-none flex items-center gap-1 rounded border px-2 py-0.5 text-sm border-slate-700 text-slate-400 hover:text-slate-200";
const check =
  "unstyled !p-0 size-5 flex items-center justify-center rounded border border-slate-700 text-slate-300 disabled:border-slate-800 disabled:text-slate-700";
const row = "grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-x-2 rounded px-2 border-t-2 ";

/** A check in the menu: on or off, with what clicking does in its tooltip. */
function Check({ on, label, title, onClick }: { on: boolean; label: string; title: string; onClick: () => void }) {
  return (
    <button role="menuitemcheckbox" aria-checked={on} aria-label={label} title={title} className={check} onClick={onClick}>
      <span className={on ? "" : "invisible"}>
        <CheckMarkIcon />
      </span>
    </button>
  );
}

/**
 * The View menu, on the course bar and in a phone's view row: every pane in
 * its order, each with a handle to drag it to another place, Show (its bar
 * is on the page at all), Focus (this pane expanded, the rest collapsed; on
 * a phone, the pane shown) and Open (expanded or collapsed, toggled with the
 * menu staying open); an All row at the top does Show and Open for every
 * pane at once.
 */
export function PanesMenu() {
  const [open, setOpen] = useState(false);
  const { panes, setHidden, jumpTo, move, setCollapsed, setAllCollapsed, setAllHidden, openAll, reset } = usePanes();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allShown = panes.every((p) => !p.hidden);
  const allOpen = panes.every((p) => !p.collapsed);
  // a drag moves the pane only on release: reordering the rows mid-drag
  // would move the handle in the DOM, which drops the pointer capture
  const dragging = useRef<string | null>(null);
  // the row the pointer is over, and whether it's past its middle (below it)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const close = () => setOpen(false);
  return (
    <span className="relative flex items-center">
      <button
        className={button}
        aria-label="view"
        aria-expanded={open}
        title="Focus a pane, reorder the panes, show or hide bars, open or collapse panes"
        onClick={() => setOpen((o) => !o)}
      >
        <PanesIcon />
        View
        <CaretDownIcon />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            role="menu"
            className="absolute top-full left-0 z-50 mt-1 w-72 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-700 bg-gray-900 shadow-lg shadow-black/50 px-1 pb-1 text-sm font-normal"
          >
            <div className={row + "border-transparent pt-2 pb-1 text-xs uppercase tracking-wider text-slate-500"}>
              <span className="w-5" aria-hidden />
              <span title="Whether the pane's bar is on the page at all">Show</span>
              <span title="Expand this pane and collapse the others; All opens every pane, sharing the room equally">Focus</span>
              <span title="Expanded or collapsed">Open</span>
              <span title="The pane in its own window, following this one" aria-hidden />
            </div>
            <div className={row + "border-transparent"}>
              <span className="w-5" aria-hidden />
              <Check on={allShown} label="Show all" title={allShown ? "Take every bar off the page" : "Put every bar on the page"} onClick={() => setAllHidden(allShown)} />
              <button
                role="menuitem"
                className="unstyled w-full py-1 text-left text-slate-300 hover:text-white"
                title="Open every pane on the page, sharing the room equally"
                onClick={() => {
                  openAll();
                  close();
                }}
              >
                All
              </button>
              <Check on={allOpen} label="All open" title={allOpen ? "Collapse every pane" : "Expand every pane"} onClick={() => setAllCollapsed(allOpen)} />
              <span className="w-5" aria-hidden />
            </div>
            {panes.map((p) => (
              <div
                key={p.id}
                data-pane-row={p.id}
                className={
                  row +
                  "hover:bg-slate-800/60 border-b-2 " +
                  (dropAt?.id === p.id && !dropAt.after ? "border-t-blue-500 " : "border-t-transparent ") +
                  (dropAt?.id === p.id && dropAt.after ? "border-b-blue-500" : "border-b-transparent")
                }
              >
                <span
                  className="w-5 cursor-grab select-none touch-none text-center text-slate-500 hover:text-slate-200"
                  title="Drag to reorder"
                  aria-label={`Reorder ${p.label}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragging.current = p.id;
                  }}
                  onPointerMove={(e) => {
                    if (dragging.current !== p.id) return;
                    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-pane-row]");
                    const id = over?.dataset.paneRow;
                    if (!over || !id || id === p.id) return setDropAt(null);
                    const box = over.getBoundingClientRect();
                    setDropAt({ id, after: e.clientY > box.top + box.height / 2 });
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    if (dropAt) {
                      // the place among the other panes, before or after the row dropped on
                      const rest = panes.map((q) => q.id).filter((q) => q !== p.id);
                      move(p.id, rest.indexOf(dropAt.id) + (dropAt.after ? 1 : 0));
                    }
                    dragging.current = null;
                    setDropAt(null);
                  }}
                >
                  ⋮⋮
                </span>
                <Check
                  on={!p.hidden}
                  label={`Show ${p.label}`}
                  title={p.hidden ? `Put the ${p.label} bar on the page` : `Take the ${p.label} bar off the page`}
                  onClick={() => setHidden(p.id, !p.hidden)}
                />
                <button
                  role="menuitem"
                  className="unstyled w-full py-1 text-left text-slate-300 hover:text-white disabled:text-slate-600"
                  disabled={p.hidden}
                  title={p.hidden ? "Its bar is off the page" : `Expand ${p.label} and collapse the others`}
                  onClick={() => {
                    jumpTo(p.id);
                    close();
                  }}
                >
                  {p.label}
                </button>
                <Check
                  on={!p.collapsed}
                  label={`${p.label} open`}
                  title={p.collapsed ? `Expand ${p.label}` : `Collapse ${p.label}`}
                  onClick={() => setCollapsed(p.id, !p.collapsed)}
                />
                <span className="w-5 flex items-center justify-center">
                  <PopOutLink label={p.label} pathname={pathname} pane={p.id} />
                </span>
              </div>
            ))}
            <div className="px-1 pt-1">
              <button
                className="unstyled btn-thin w-full rounded border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                title="Forget the order, sizes and which panes are open or shown"
                onClick={reset}
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
