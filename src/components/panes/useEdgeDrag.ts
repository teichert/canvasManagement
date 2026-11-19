"use client";
import { useRef } from "react";
import { usePanes } from "./PaneStrip";
import { measureRow, paneElement } from "./measureRow";
import { leadId, limitsAfter, moveEdge, relax, Sized, widthRule, withLead } from "./paneStore";

/** The width rule onto a pane's element; the widths are applied imperatively (see Pane). */
export const applyWidth = (el: HTMLElement, pane: { minWidth: number; width: number }, place: number) => {
  const rule = widthRule(pane, place);
  el.style.flex = rule.flex;
  el.style.minWidth = rule.minWidth;
  el.style.maxWidth = rule.maxWidth;
};

/**
 * Dragging an edge of the row: a bar (the edge before its pane) or the end
 * bar (the edge after the last pane). While dragged, the open panes are
 * resized live from how they were when the drag began (see moveEdge); the
 * widths are remembered on release. A drag from a resize square names the
 * pane it is for (`relaxed`): that pane alone is freed of its limits for the
 * drag, and a limit the drag crossed moves to where it ended (see limitsAfter).
 */
export function useEdgeDrag() {
  const { panes, lead, setWidths } = usePanes();
  const dragging = useRef<{ open: Sized[]; free: number; now?: Record<string, number>; relaxed?: string } | null>(null);
  /** Moves the edge before the first open pane at or after `from` (`panes.length`: the end of the row) by `dx` from where it was when this drag began, live. */
  const dragEdge = (from: number, dx: number, relaxed?: string) => {
    // every open pane as wide as it is now, and the empty room at the end of the row;
    // the room before the first pane is part of the row too (see withLead)
    if (!dragging.current) {
      const row = measureRow(panes);
      const open = relaxed ? relax(row.open, relaxed) : row.open;
      dragging.current = { free: row.free, relaxed, open: withLead(open, lead) };
    }
    const { open, free } = dragging.current;
    const k = open.findIndex((p) => p.id !== leadId && panes.findIndex((q) => q.id === p.id) >= from);
    const now = moveEdge(open, k === -1 ? open.length : k, dx, free);
    const spacer = document.querySelector<HTMLElement>("[data-pane-lead]");
    if (spacer && now[leadId] !== undefined) {
      spacer.style.width = `${now[leadId]}px`;
      spacer.style.marginRight = now[leadId] > 0 ? "0" : "-0.125rem";
    }
    for (const p of panes) {
      const element = now[p.id] !== undefined && paneElement(p.id);
      if (element) applyWidth(element, { minWidth: p.id === relaxed ? 0 : p.minWidth, width: now[p.id] }, panes.indexOf(p));
    }
    dragging.current.now = now;
  };
  /** The widths the drag set, remembered, with the limit the relaxed pane was pushed past moved to where it ended. */
  const endDrag = () => {
    const d = dragging.current;
    dragging.current = null;
    if (!d?.now) return;
    // the pane's limits as the row sees them (no widest width set: half the row)
    const pane = measureRow(panes).open.find((p) => p.id === d.relaxed);
    const width = d.relaxed ? d.now[d.relaxed] : undefined;
    setWidths(d.now, pane && width !== undefined ? { id: pane.id, ...limitsAfter(pane, width) } : undefined);
  };
  return { dragEdge, endDrag };
}
