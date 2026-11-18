"use client";
import { usePanes, usePinned } from "./PaneStrip";
import { topPin } from "./PinnedBars";
import { ViewChoice } from "./ViewIcons";
import { viewOf } from "./paneStore";

/**
 * On a narrow window, which view shows: a row under the breadcrumbs (folded
 * away with them by the pin at their start) with an icon per view, the one
 * showing boxed; a tap shows the first pane of that view (it open, the rest
 * collapsed), added at the end when there is none.
 */
export function PaneSelect({ views }: { views: ViewChoice[] }) {
  const { showing, showView } = usePanes();
  const current = showing && viewOf(showing);
  const [pinned] = usePinned(topPin);
  return (
    <div className={"md:hidden flex-none flex flex-row items-center gap-1 py-0.5 " + (pinned ? "" : "hidden")}>
      {/* the icons scroll sideways on a small phone */}
      <div className="flex-1 min-w-0 flex flex-row items-center gap-1 overflow-x-auto">
        {views.map((v) => (
          <button
            key={v.id}
            className={
              "unstyled flex-none flex items-center justify-center size-7 rounded-md border text-base " +
              (v.id === current ? "border-blue-700 bg-blue-900/60 text-blue-50" : "border-transparent text-slate-400")
            }
            aria-label={v.label}
            aria-pressed={v.id === current}
            title={v.label}
            onClick={() => showView(v.id, "end")}
          >
            {v.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
