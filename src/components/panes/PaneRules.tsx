"use client";
import { RefObject, useLayoutEffect, useRef, useState } from "react";
import { maxRuleShare } from "./paneStore";
import { useDragHandlers } from "./PaneBar";

// A pane's narrowest and widest widths, drawn as rules: the min rule under
// its name, the max rule down its bar. Each ends in a short box that can be
// dragged to set the limit either way; a drag from the resize square on a
// bar (see PaneBar) pushes a limit it crosses.

/**
 * The pane's narrowest width, as a rule under its name from the pane's left
 * edge as far as the minimum, ending in a short thick box. Drag the box to
 * set the minimum; dragged past the pane's width, the pane widens with it
 * (`onLive` as it goes, so the pane follows the box).
 */
export function MinRule({
  paneRef,
  min,
  label,
  onMin,
  onLive,
}: {
  paneRef: RefObject<HTMLDivElement | null>;
  min: number;
  label: string;
  onMin: (min: number) => void;
  onLive?: (min: number) => void;
}) {
  // measured, and followed as the pane is resized (a drag sets widths
  // without re-rendering): the bar's width (it's in rem), so the rule ends
  // where the minimum does, and the pane's, so the rule follows a drag that
  // pushes the pane under its minimum (the minimum moves there on release)
  const [box, setBox] = useState({ bar: 20, width: Infinity });
  useLayoutEffect(() => {
    const pane = paneRef.current;
    const bar = pane?.firstElementChild;
    if (!pane || !bar) return;
    const measure = () => setBox({ bar: bar.getBoundingClientRect().width, width: pane.getBoundingClientRect().width });
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [paneRef]);
  const { bar, width } = box;
  // while the box is dragged: the minimum it points at
  const [live, setLive] = useState<number | null>(null);
  const at = (e: React.PointerEvent) => {
    const left = paneRef.current?.getBoundingClientRect().left ?? 0;
    return Math.round(Math.max(e.clientX - left, 0));
  };
  const handlers = useDragHandlers(
    (e) => {
      const v = at(e);
      setLive(v);
      onLive?.(v);
    },
    () => {
      if (live !== null) onMin(live);
      setLive(null);
    },
  );
  // the box never draws past the pane: dragged further, the pane follows it (see Pane)
  const shown = Math.min(live ?? min, width);
  const end = Math.max(shown - bar, 0);
  return (
    <div
      className="max-md:hidden relative h-1 flex-none"
      role="img"
      aria-label={`Narrowest ${label}: ${Math.round(shown)} px`}
      title={`${label} can't be made narrower than ${Math.round(min)} px by dragging a bar (a drag from a resize square can, and moves this)`}
    >
      <div className="absolute top-0 left-0 h-px bg-slate-700" style={{ width: end }} />
      {live !== null && (
        <span className="absolute top-1 z-40 whitespace-nowrap rounded bg-gray-950/90 px-1 text-[10px] text-slate-300 pointer-events-none" style={{ left: end + 6 }}>
          min width {shown} px
        </span>
      )}
      <div
        role="slider"
        aria-label={`Set the narrowest ${label}`}
        aria-valuenow={shown}
        title={`Drag to set the narrowest ${label}. Double-click: its width now`}
        className="absolute -top-px z-40 h-[3px] w-[1em] bg-slate-500 hover:bg-slate-200 cursor-ew-resize touch-none"
        style={{ left: Math.max(end - 16, 0) }}
        onDoubleClick={() => onMin(Math.round(width))}
        {...handlers}
      />
    </div>
  );
}

/**
 * The pane's widest width, as a rule down the right of its bar from under
 * the resize square: its length is how much wider the pane may still be
 * made, of what the row would allow (see maxRuleShare), so it shrinks to
 * nothing as the pane is widened to its limit, and runs the whole way when
 * the pane may take the whole row. It ends in a short thick box; drag the
 * box to set the limit: to the top, no wider than now; to the bottom, the
 * whole row.
 */
export function MaxRule({ label, maxWidth, onMax }: { label: string; maxWidth: number; onMax: (max: number | undefined) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // measured, and followed as the pane is resized (a drag sets widths
  // without re-rendering): the pane's width on screen, the rule's room down
  // the bar, and where it starts, below the resize square
  const [box, setBox] = useState({ width: 0, room: 0, height: 0, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    const bar = el?.parentElement;
    const pane = el?.closest("[data-pane]");
    if (!el || !bar || !pane) return;
    const measure = () => {
      const b = bar.getBoundingClientRect();
      const square = bar.querySelector("[data-resize-square]")?.getBoundingClientRect();
      const top = square ? square.bottom - b.top + 4 : 4;
      setBox({ width: pane.getBoundingClientRect().width, room: pane.parentElement?.clientWidth ?? 0, height: Math.max(b.height - top - 24, 0), top });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(bar);
    if (pane.parentElement) observer.observe(pane.parentElement);
    return () => observer.disconnect();
  }, []);
  const { width, room, height } = box;
  // while the box is dragged: the share of the rule it points at
  const [live, setLive] = useState<number | null>(null);
  const at = (e: React.PointerEvent) => {
    const top = ref.current?.getBoundingClientRect().top ?? 0;
    return height > 0 ? Math.min(Math.max((e.clientY - top) / height, 0), 1) : 0;
  };
  // the share back to a bound: from the width now at the top to the whole row at the bottom
  const maxFor = (share: number) => Math.round(width + share * Math.max(room - width, 0));
  // no widest width set: half the row
  const bound = Number.isFinite(maxWidth) ? maxWidth : room / 2;
  const handlers = useDragHandlers(
    (e) => setLive(at(e)),
    () => {
      if (live !== null) onMax(maxFor(live));
      setLive(null);
    },
  );
  const share = live ?? maxRuleShare(bound, width, room);
  const length = share * height;
  const liveMax = live !== null ? maxFor(live) : undefined;
  const says = (max: number) => (max >= room ? "the whole row" : `${Math.round(max)} px`);
  return (
    <div
      ref={ref}
      className="absolute right-0.5 w-1.5"
      style={{ top: box.top, height }}
      role="img"
      aria-label={`Widest ${label}: ${says(bound)}`}
      title={`${label} can't be made wider than ${says(bound)}${Number.isFinite(maxWidth) ? "" : " (half the row, until set)"} by dragging a bar (a drag from a resize square can, and moves this); the rule is how much wider it may still be made`}
    >
      <div className="absolute top-0 right-0 w-px bg-slate-700" style={{ height: length }} />
      {live !== null && (
        <span className="absolute left-full ml-1 z-40 whitespace-nowrap rounded bg-gray-950/90 px-1 text-[10px] text-slate-300 pointer-events-none" style={{ top: length - 6 }}>
          max width {liveMax === undefined ? "" : says(liveMax)}
        </span>
      )}
      <div
        role="slider"
        aria-label={`Set the widest ${label}`}
        title={`Drag to set the widest ${label}: to the top, no wider than now; to the bottom, the whole row. Double-click: its width now`}
        className="absolute right-[-1px] z-40 w-[3px] h-[1em] bg-slate-500 hover:bg-slate-200 cursor-ns-resize touch-none"
        style={{ top: Math.max(length - 16, 0) }}
        onDoubleClick={() => onMax(Math.round(box.width))}
        {...handlers}
      />
    </div>
  );
}
