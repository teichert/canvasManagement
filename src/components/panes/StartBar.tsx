"use client";
import { useRouterState } from "@tanstack/react-router";
import { usePanes } from "./PaneStrip";
import { barClass, ViewChoice, ViewIcons } from "./PaneBar";
import { openPopOut, popOutUrl } from "@/app/course/[courseName]/panes/popOut";

/**
 * The bar before the first pane, with no pane of its own, the end bar's
 * mirror: the views (see ViewIcons), a click opening a new pane of that
 * view at the start of the row; Shift-click opens the view in a new window
 * following this one.
 */
export function StartBar({ views }: { views: ViewChoice[] }) {
  const { narrow, addPaneFirst, setAllCollapsed } = usePanes();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (narrow) return null;
  return (
    <div
      data-pane-start
      role="toolbar"
      aria-orientation="vertical"
      aria-label="The row's left edge"
      style={{ order: -2 }}
      className={barClass + "pt-2 border-slate-800 bg-gray-900 text-slate-300"}
    >
      <ViewIcons
        views={views}
        hint="a new pane of it at the start of the row. Shift: in a new window following this one"
        hrefOf={(view) => popOutUrl(pathname, view)}
        onView={(view, e) => (e.shiftKey && !e.ctrlKey && !e.metaKey ? openPopOut(pathname, view, true) : addPaneFirst(view))}
        menuSide="right"
        extra={{ label: "Collapse every pane", onClick: () => setAllCollapsed(true) }}
      />
    </div>
  );
}
