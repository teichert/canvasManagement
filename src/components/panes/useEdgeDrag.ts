"use client";
import { useRef } from "react";
import { Effect, Layout, pushEdge, resize, restore, squareDrag } from "./cascade";
import { usePanes } from "./PaneStrip";
import { measureLayout, paneElement } from "./measureRow";
import { widthRule } from "./paneStore";

/** The width rule onto a pane's element; the widths are applied imperatively (see Pane). */
export const applyWidth = (el: HTMLElement, pane: { minWidth: number; width: number }, place: number) => {
  const rule = widthRule(pane, place);
  el.style.flex = rule.flex;
  el.style.minWidth = rule.minWidth;
  el.style.maxWidth = rule.maxWidth;
};

/**
 * A drag that resizes the row: a bar (the edge before its pane), the bars
 * at either end, a resize square, or the narrowest box. Every step of the
 * drag is worked out by the rules (see cascade) from the row as it was when
 * the drag began, so dragging back undoes, step by step, what dragging on
 * did; it is shown live (see usePanes().preview) and written to the layout on
 * release, with what it displaced remembered so later room brings it back.
 */
export function useRowDrag() {
  const { panes, lead, preview, save, records } = usePanes();
  type Result = { layout: Layout; records: Effect[]; limits?: Record<string, { min?: number; max?: number }> };
  const drag = useRef<{ layout: Layout; records: Effect[]; result?: Result } | null>(null);
  const begin = () => (drag.current ??= { layout: measureLayout(panes, lead), records });
  const show = (result: Result) => {
    drag.current!.result = result;
    preview(result.layout);
  };
  return {
    /**
     * Moves the edge before `panes[from]` (`panes.length`: the row's right
     * end) `dx` px from where it was when the drag began; from a resize
     * square for the pane `relaxed`, past the limits (see squareDrag).
     */
    edge: (from: number, dx: number, relaxed?: string) => {
      const d = begin();
      const pushed: { layout: Layout; effects: Effect[]; limits?: Result["limits"] } = relaxed ? squareDrag(d.layout, from, dx, relaxed) : pushEdge(d.layout, from, dx);
      // room the drag frees brings back what earlier cascades displaced; dragging back undoes its own
      const back = restore(pushed.layout, d.records);
      show({ layout: back.layout, records: [...back.records, ...pushed.effects], limits: pushed.limits });
    },
    /** The pane `id` `width` wide by the cascade (the narrowest box dragged past the pane's width, or back); how wide it got. */
    resize: (id: string, width: number) => {
      const d = begin();
      const now = d.layout.slabs.find((s) => s.id === id)?.width ?? width;
      const result = resize(d.layout, id, width - now, d.records);
      show(result);
      return result.layout.slabs.find((s) => s.id === id)?.width ?? now;
    },
    /** The drag over: what it showed, written to the layout as it is, with the limits a resize square moved. */
    end: () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.result) return preview(null);
      save(d.result.layout, d.result.records, d.result.limits);
    },
  };
}

/** Shows `layout`'s widths on the page without writing them, straight onto the panes' elements (Pane shows what is collapsed or hidden). */
export function showWidths(layout: Layout) {
  const spacer = document.querySelector<HTMLElement>("[data-pane-lead]");
  if (spacer) {
    spacer.style.width = `${layout.lead}px`;
    spacer.style.marginRight = layout.lead > 0 ? "0" : "-0.125rem";
  }
  layout.slabs.forEach((s, place) => {
    const el = paneElement(s.id);
    if (el && !s.collapsed && !s.hidden) applyWidth(el, { minWidth: 0, width: s.width }, place);
  });
}
