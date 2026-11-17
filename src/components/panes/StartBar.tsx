"use client";
import { useRouterState } from "@tanstack/react-router";
import { usePanes } from "./PaneStrip";
import { barClass, ViewChoice, ViewIcons } from "./PaneBar";
import { openPopOut, popOutUrl } from "@/app/course/[courseName]/panes/popOut";

/**
 * The bar before the first pane, with no pane of its own, the end bar's
 * mirror: the views (see ViewIcons), a click showing the view's pane (see
 * usePanes().showView) or opening a new one at the start of the row when
 * there is none (Ctrl-click: a new one regardless); Shift-click opens the
 * view in a new window following this one.
 */
export function StartBar({ views }: { views: ViewChoice[] }) {
  const { panes, narrow, addPaneFirst, showView, close } = usePanes();
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
        hint="show its pane (its first open one, else its first, expanded), or a new one at the start of the row when there is none. Ctrl: a new one at the start. Shift: in a new window following this one"
        hrefOf={(view) => popOutUrl(pathname, view)}
        onView={(view, e) => (e.shiftKey && !e.ctrlKey && !e.metaKey ? openPopOut(pathname, view, true) : e.ctrlKey || e.metaKey ? addPaneFirst(view) : showView(view, "start"))}
        menuSide="right"
        extras={[{ label: "Close every pane", onClick: () => close(panes.map((p) => p.id)) }]}
      />
    </div>
  );
}
