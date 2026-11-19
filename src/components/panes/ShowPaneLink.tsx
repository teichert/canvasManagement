"use client";
import { MouseEvent, ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { showPane } from "./PaneStrip";
import { popOutUrl } from "@/app/course/[courseName]/panes/popOut";

/**
 * A link that also shows a pane of where it goes (an item with its Compare
 * with Canvas pane, say). Its address is the pane's pop-out url, so opened
 * in a new tab or window (the middle button, Ctrl, Shift, the context menu)
 * it shows just that view; a plain click shows the pane here and goes to
 * the item within the app.
 */
export function ShowPaneLink({
  pane,
  to,
  onClick,
  className,
  title,
  children,
}: {
  /** None: a plain link. */
  pane?: string;
  to: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  if (!pane)
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Link to={to as any} className={className} title={title} onClick={onClick}>
        {children}
      </Link>
    );
  return (
    <a
      href={popOutUrl(to, pane)}
      className={className}
      title={title}
      onClick={(e) => {
        onClick?.(e);
        // a modified click or the middle button: the browser opens the view in a new tab or window
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        showPane(pane);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.navigate({ to: to as any });
      }}
    >
      {children}
    </a>
  );
}
