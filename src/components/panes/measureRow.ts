"use client";
import { isShown, PaneView, Sized } from "./paneStore";

export const paneElement = (id: string) => document.querySelector<HTMLElement>(`[data-pane="${id}"]`);

/** The panes' row as it is on the page, for the sizing rules (see paneStore). */
export type Row = {
  /** The open panes, in order, at their widths on the page. */
  open: Sized[];
  /** The room left empty at the row's end; below zero, how far the panes reach past it. */
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
  // a pane with no widest width set may take half the row
  const sized = (room: number) =>
    panes.filter(isShown).map((p) => ({ id: p.id, width: width(p), minWidth: p.minWidth, maxWidth: Number.isFinite(p.maxWidth) ? p.maxWidth : room / 2 }));
  const shown = panes.filter((p) => !p.hidden);
  const row = shown.map((p) => paneElement(p.id)?.parentElement).find(Boolean);
  if (!row) return { open: sized(Infinity), free: 0, bar: 23, room: 0 };
  const box = row.getBoundingClientRect();
  // the start and end bars sit outside every pane: the empty room is what's
  // left before the end bar, and the room the panes share leaves both out
  const edgeBars = [...row.querySelectorAll<HTMLElement>("[data-pane-edge]")];
  const end = Math.max(...[...row.children].filter((el) => !edgeBars.includes(el as HTMLElement)).map((el) => el.getBoundingClientRect().right));
  const endBarWidth = edgeBars.reduce((total, el) => total + el.getBoundingClientRect().width + gapOf(row), 0);
  const collapsed = shown.find((p) => p.collapsed);
  const barEl = collapsed ? paneElement(collapsed.id) : paneElement(shown[0].id)?.firstElementChild;
  const gap = gapOf(row);
  const room = row.clientWidth - endBarWidth - gap * Math.max(shown.length - 1, 0);
  return {
    open: sized(room),
    free: box.right - endBarWidth - end,
    bar: barEl?.getBoundingClientRect().width ?? 23,
    room,
  };
}

const gapOf = (row: Element) => parseFloat(getComputedStyle(row).columnGap) || 0;
