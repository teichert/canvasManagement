"use client";
import { PopOutIcon } from "../icons/ActionIcons";
import { openPopOut } from "@/app/course/[courseName]/panes/popOut";

/** The link that opens a pane in its own window, following this one (a plain open of the link, from the middle button say, follows nothing). */
export function PopOutLink({ label, pathname, pane }: { label: string; pathname: string; pane: string }) {
  return (
    <a
      className="flex-none text-slate-500 hover:text-slate-200"
      href={`${pathname}?pane=${pane}`}
      target="_blank"
      aria-label={`Open ${label} in its own window`}
      title={`${label} in its own window, following this one as you move between items`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openPopOut(pathname, pane);
      }}
    >
      <PopOutIcon />
    </a>
  );
}
