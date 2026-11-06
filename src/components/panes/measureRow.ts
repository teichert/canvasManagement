"use client";
import { isShown, PaneView, Sized } from "./paneStore";

export const paneElement = (id: string) => document.querySelector<HTMLElement>(`[data-pane="${id}"]`);

/** The panes' row as it is on the page, for the sizing rules (see paneStore). */
export type Row = {
  /** The open panes, in order, at their widths on the page. */
  open: Sized[];
  /** The room left empty at the row's end. */
  free: number;
  /** How wide a collapsed pane is: its bar. */
  bar: number;
  /** The room the row has for the panes whose bars are on the page, gaps taken out. */
  room: number;
};

/**
 * Measures the row. The only place the sizing reads the page: everything
 * it decides is from these numbers, by the pure rules in paneStore.
 */
export function measureRow(panes: PaneView[]): Row {
  const width = (p: PaneView) => paneElement(p.id)?.getBoundingClientRect().width ?? p.width;
  const open = panes.filter(isShown).map((p) => ({ id: p.id, width: width(p), minWidth: p.minWidth, maxWidth: p.maxWidth }));
  const shown = panes.filter((p) => !p.hidden);
  const row = shown.map((p) => paneElement(p.id)?.parentElement).find(Boolean);
  if (!row) return { open, free: 0, bar: 23, room: 0 };
  const box = row.getBoundingClientRect();
  const end = Math.max(...[...row.children].map((el) => el.getBoundingClientRect().right));
  const collapsed = shown.find((p) => p.collapsed);
  const barEl = collapsed ? paneElement(collapsed.id) : paneElement(shown[0].id)?.firstElementChild;
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  return {
    open,
    free: Math.max(box.right - end, 0),
    bar: barEl?.getBoundingClientRect().width ?? 23,
    room: row.clientWidth - gap * Math.max(shown.length - 1, 0),
  };
}
