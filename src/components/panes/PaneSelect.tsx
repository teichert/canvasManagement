"use client";
import { usePanes, usePinned } from "./PaneStrip";
import { topPin } from "./PinnedBars";
import { PanesMenu } from "./PanesMenu";

/**
 * The view row under the breadcrumbs (on a phone, folded away with them by
 * the pin at their start): the View menu and an icon per pane in the
 * panes' order. On a narrow window the pane showing is boxed, and a tap
 * focuses a pane (it open, the rest collapsed), which is what shows. On a
 * wide window the current pane is boxed (the last switched to, added or
 * shown by a link), and a click opens a pane, leaving the others as they are.
 */
export function PaneSelect() {
  const { panes, narrow, showing, current, jumpTo, setCollapsed, setCurrent } = usePanes();
  const marked = narrow ? showing : current;
  const [pinned] = usePinned(topPin);
  return (
    <div className={"flex-none flex flex-row items-center gap-1 py-0.5 " + (pinned ? "" : "max-md:hidden")}>
      <PanesMenu />
      {/* the icons scroll sideways on a small phone; the menu stays outside, or the scroller would clip its drop-down */}
      <div className="flex-1 min-w-0 flex flex-row items-center gap-1 overflow-x-auto">
        {panes
          .filter((p) => !p.hidden)
          .map((p) => (
            <button
              key={p.id}
              className={
                "unstyled flex-none flex items-center justify-center size-7 rounded-md border text-base " +
                (p.id === marked ? "border-blue-700 bg-blue-900/60 text-blue-50" : "border-transparent text-slate-400")
              }
              aria-label={p.label}
              aria-pressed={p.id === marked}
              title={narrow ? p.label : `${p.label}: open it and switch to it`}
              onClick={() => {
                if (narrow) return jumpTo(p.id);
                setCollapsed(p.id, false);
                setCurrent(p.id);
              }}
            >
              {p.icon}
            </button>
          ))}
      </div>
    </div>
  );
}
