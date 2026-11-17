"use client";
import { usePanes, usePinned } from "./PaneStrip";
import { topPin } from "./PinnedBars";

/**
 * On a narrow window, which pane shows: a row under the breadcrumbs (folded
 * away with them by the pin at their start) with an icon per pane in the
 * panes' order, the one showing boxed; a tap focuses a pane (it open, the
 * rest collapsed), which is what shows.
 */
export function PaneSelect() {
  const { panes, showing, jumpTo } = usePanes();
  const [pinned] = usePinned(topPin);
  return (
    <div className={"md:hidden flex-none flex flex-row items-center gap-1 py-0.5 " + (pinned ? "" : "hidden")}>
      {/* the icons scroll sideways on a small phone */}
      <div className="flex-1 min-w-0 flex flex-row items-center gap-1 overflow-x-auto">
        {panes
          .filter((p) => !p.hidden)
          .map((p) => (
            <button
              key={p.id}
              className={
                "unstyled flex-none flex items-center justify-center size-7 rounded-md border text-base " +
                (p.id === showing ? "border-blue-700 bg-blue-900/60 text-blue-50" : "border-transparent text-slate-400")
              }
              aria-label={p.label}
              aria-pressed={p.id === showing}
              title={p.label}
              onClick={() => jumpTo(p.id)}
            >
              {p.icon}
            </button>
          ))}
      </div>
    </div>
  );
}
