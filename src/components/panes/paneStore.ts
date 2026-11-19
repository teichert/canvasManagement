import { ReactNode } from "react";

/**
 * Everything a user has chosen about the panes, remembered as one document
 * under `panes` (the window's own in sessionStorage, the last saved in
 * localStorage, see PaneStrip): the order they dragged them into, which
 * bars are off the page, which panes are collapsed, their widths, and which
 * bars are pinned. Nothing here reads the document; PaneStrip does that
 * once and hands the derived views around.
 */
export type PaneDoc = {
  order?: string[];
  /** Empty room before the first pane, dragged in from the row's left end (teichert#81). */
  lead?: number;
  pins?: Record<string, boolean>;
  /** `min` and `max` are limits a drag from a resize square pushed (see limitsAfter); without them, the pane's own minimum and no maximum. */
  panes?: Record<string, { hidden?: boolean; collapsed?: boolean; width?: number; min?: number; max?: number }>;
  /** Panes added beyond the catalogue's one per view: a view's second and later copies, ids like `editor#2` (see viewOf). */
  added?: string[];
  /** The views as the menus and icon stacks list them: their order, and those kept below the menus' divider, off the stacks. */
  views?: { order?: string[]; hidden?: string[] };
  /** Panes a cascade (see makeRoom) collapsed or hid to make room, as they were, last first: put back as room returns (see PaneStrip). */
  displaced?: Displaced[];
};
export type Displaced = { id: string; collapsed: boolean; hidden: boolean; width: number };
/** Every pane as it is now, for a cascade's record (see paneActions.makeRoom): its state, and its width on the page (`open`). */
export const displacedNow = (panes: PaneView[], open: Sized[]): Record<string, Displaced> =>
  Object.fromEntries(panes.map((p) => [p.id, { id: p.id, collapsed: p.collapsed, hidden: p.hidden, width: open.find((o) => o.id === p.id)?.width ?? p.width }]));
export const paneDocKey = "panes";

export function parseDoc(json: string | null): PaneDoc {
  try {
    const doc = JSON.parse(json ?? "null");
    return doc && typeof doc === "object" ? doc : {};
  } catch {
    return {};
  }
}

/** What a pane says about itself when it registers with the strip. */
export type PaneSpec = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** The pane can't get narrower than this; see widthRule. */
  minWidth: number;
  /** The widest the pane gets until a drag sets it; see widthRule. */
  defaultWidth: number;
  /** Until the pane is first toggled; it can look at the window. */
  collapsedByDefault: () => boolean;
  /** Not on the page until asked for. */
  hiddenByDefault: boolean;
  /** The server renders this pane expanded; the rest start collapsed until the remembered choices are known. */
  ssr: boolean;
};

/**
 * A pane as the page shows it: its spec with the user's choices applied;
 * `width` is how wide it is (dragged, set by All, or its default),
 * `minWidth` and `maxWidth` the narrowest and widest it may be made
 * (`maxWidth` Infinity when none is set: half the row, see measureRow), `floor` the pane's own minimum,
 * the min until a drag from a resize square pushes it lower.
 */
export type PaneView = PaneSpec & { hidden: boolean; collapsed: boolean; width: number; maxWidth: number; floor: number };

/** Panes in the remembered order, then the rest in the order they registered. */
export function orderPanes<T extends { id: string }>(panes: T[], order: string[] = []): T[] {
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return panes
    .map((pane, i) => ({ pane, i }))
    .sort((a, b) => rank(a.pane.id) - rank(b.pane.id) || a.i - b.i)
    .map(({ pane }) => pane);
}

/** The panes with the document applied; before hydration, with what the server renders. */
export function viewPanes(specs: PaneSpec[], doc: PaneDoc, hydrated: boolean): PaneView[] {
  return orderPanes(specs, doc.order).map((spec) => {
    const saved = doc.panes?.[spec.id] ?? {};
    return {
      ...spec,
      hidden: saved.hidden ?? spec.hiddenByDefault,
      collapsed: saved.collapsed ?? (hydrated ? spec.collapsedByDefault() : !spec.ssr),
      width: saved.width ?? spec.defaultWidth,
      minWidth: saved.min ?? spec.minWidth,
      maxWidth: saved.max ?? Infinity,
      floor: spec.minWidth,
    };
  });
}

export const isShown = (pane: PaneView) => !pane.hidden && !pane.collapsed;

/** The view a pane shows: its id up to the `#` that numbers a copy (`editor#2` shows the editor). */
export const viewOf = (id: string) => id.split("#")[0];

/** The lowest-numbered id of `view` not among `ids`. */
export const freeId = (ids: string[], view: string) => {
  let n = 2;
  while (ids.includes(`${view}#${n}`)) n++;
  return `${view}#${n}`;
};

/** On a narrow window, the pane that shows: the first open one, else the first on the page at all. */
export const showingPane = (panes: PaneView[]) => (panes.find(isShown) ?? panes.find((p) => !p.hidden))?.id;

/**
 * An open pane in the row, as flexbox terms: exactly its width, so opening
 * or closing a pane only shifts the others and room nobody takes stays
 * empty. The rules below (moveEdge, fitOpening) decide the widths
 * whenever the user acts; this only matters when the row itself changes
 * under them (the window is resized): too narrow for every width, the panes
 * give way from the right (a shrink weight that climbs steeply with the
 * pane's place, so the rightmost gives way almost entirely before the next
 * one starts to), each down to its minimum.
 */
export const widthRule = (pane: { minWidth: number; width: number }, place: number) => {
  const width = Math.max(pane.width, pane.minWidth);
  return { flex: `0 ${16 ** place} ${width}px`, minWidth: `${pane.minWidth}px`, maxWidth: `${width}px` };
};

/** An open pane as the sizing rules see it. */
export type Sized = { id: string; width: number; minWidth: number; maxWidth: number };

/**
 * `open` with the pane `id` free to be any width, for a drag from a bar's
 * resize square: the drag gets its way, and a limit it crosses moves with
 * it (see limitsAfter).
 */
export const relax = (open: Sized[], id: string): Sized[] =>
  open.map((p) => (p.id === id ? { ...p, minWidth: 0, maxWidth: Infinity } : p));

/**
 * After a drag from a resize square left the pane `width` wide: the limit
 * it crossed, if any, moved to that width; the other stays as it is.
 */
export const limitsAfter = (pane: { minWidth: number; maxWidth: number }, width: number): { min?: number; max?: number } => ({
  ...(width < pane.minWidth ? { min: Math.round(width) } : {}),
  ...(width > pane.maxWidth ? { max: Math.round(width) } : {}),
});

/**
 * The empty room at the row's left end, to the sizing rules a pane before
 * every other that can be as narrow as nothing, so the left end behaves as
 * the right end does: the first bar dragged right leaves room behind it,
 * and a bar dragged left past every minimum takes that room back.
 */
export const leadId = "__lead";
export const withLead = (open: Sized[], lead: number): Sized[] => [
  { id: leadId, width: lead, minWidth: 0, maxWidth: Infinity },
  ...open,
];

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((total, x) => total + f(x), 0);

/** Hands `amount` out along `list`, nearest first, each taking what `room` says it can; returns what was handed out. */
function spread(widths: Record<string, number>, list: Sized[], amount: number, room: (p: Sized) => number, sign: 1 | -1) {
  let left = amount;
  for (const p of list) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(room(p), 0));
    widths[p.id] += sign * take;
    left -= take;
  }
  return amount - left;
}

/**
 * Moving the edge before `open[k]` (the open panes in order) by `d` px,
 * with `free` px empty at the row's end. Right: the panes before the edge
 * grow, nearest first, each up to its max; the room comes from the empty
 * room first (the panes after are shoved over), then from the panes after
 * the edge, nearest first, each down to its min. Left: the panes before the
 * edge shrink, nearest first, each down to its min; the panes after it
 * grow, nearest first, each up to its max, and what's left over becomes
 * empty room at the end.
 */
export function moveEdge(open: Sized[], k: number, d: number, free: number): Record<string, number> {
  const widths = Object.fromEntries(open.map((p) => [p.id, p.width]));
  const before = open.slice(0, k).reverse();
  const after = open.slice(k);
  if (d > 0) {
    const grow = Math.min(d, sum(before, (p) => p.maxWidth - p.width), free + sum(after, (p) => p.width - p.minWidth));
    spread(widths, before, grow, (p) => p.maxWidth - widths[p.id], 1);
    spread(widths, after, Math.max(grow - free, 0), (p) => widths[p.id] - p.minWidth, -1);
  } else if (d < 0) {
    const shrink = spread(widths, before, -d, (p) => widths[p.id] - p.minWidth, -1);
    spread(widths, after, shrink, (p) => p.maxWidth - widths[p.id], 1);
  }
  return widths;
}

/**
 * Room for the panes `keep` (in `open`, the open panes in order with them) to
 * open `need` px wider than their bars: from the empty room first (`free`,
 * negative when the row is already wider than its room), then the other open
 * panes shrink, those after the first kept first, nearest first, then those
 * before it, each down to its min; if that isn't enough, open panes close
 * from the right (none kept), each giving back all but its bar; `short` is
 * what is still missing after that.
 */
export function fitOpening(open: Sized[], keep: string[], need: number, free: number, bar: number) {
  const widths = Object.fromEntries(open.map((p) => [p.id, p.width]));
  const first = open.findIndex((p) => keep.includes(p.id));
  const at = first === -1 ? open.length : first;
  const others = [...open.slice(at + 1), ...open.slice(0, at).reverse()].filter((p) => !keep.includes(p.id));
  let short = need - free;
  if (short > 0) short -= spread(widths, others, short, (p) => widths[p.id] - p.minWidth, -1);
  const collapse: string[] = [];
  for (const p of [...open].reverse()) {
    if (short <= 0) break;
    if (keep.includes(p.id)) continue;
    collapse.push(p.id);
    short -= widths[p.id] - bar;
    delete widths[p.id];
  }
  return { widths, collapse, short: Math.max(short, 0) };
}

/**
 * Room for the pane `id` to be `target` wide, as fitOpening makes it (the
 * empty room at both ends of the row, then the others down to their narrowest, those after it
 * first, then open panes collapsed from the right) and then, still short,
 * panes hidden from the right, their bars' room included; the width the
 * pane ends up with, and what gave way. The title's double-click and the
 * narrowest-width box dragged past the pane's width both do this, and so
 * does a row wider than its room (`free` below zero): then `id` is the pane
 * that keeps its width, the rest give way.
 */
export function makeRoom(open: Sized[], ids: string[], id: string, target: number, free: number, lead: number, bar: number) {
  const now = open.find((p) => p.id === id);
  const need = now ? target - now.width : 0;
  // the empty room at either end goes first: the lead's share of it is given back to the row
  const { widths, collapse, short } = fitOpening(open, [id], need, free + lead, bar);
  widths[leadId] = lead - Math.max(Math.min(Math.max(need, 0), free + lead) - free, 0);
  const hide: string[] = [];
  let left = short;
  for (const other of [...ids].reverse()) {
    if (left <= 0) break;
    if (other === id) continue;
    hide.push(other);
    left -= bar;
  }
  if (now) widths[id] = target - Math.max(left, 0);
  return { widths, collapse, hide };
}

/**
 * The max rule (see PaneRules): how much wider the pane may still be made,
 * as the share of the rule's length from the top, of what the row would
 * allow: nothing when the pane is as wide as it may be, the whole rule when
 * it may take the whole row (no widest width).
 */
export const maxRuleShare = (maxWidth: number, width: number, room: number) =>
  Number.isFinite(maxWidth) && room > width ? Math.min(Math.max((maxWidth - width) / (room - width), 0), 1) : 1;

/** `order` with `id` moved to `index`. */
export function movePane(order: string[], id: string, index: number): string[] {
  const rest = order.filter((x) => x !== id);
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

const withPane = (doc: PaneDoc, id: string, change: NonNullable<PaneDoc["panes"]>[string]): PaneDoc => ({
  ...doc,
  panes: { ...doc.panes, [id]: { ...doc.panes?.[id], ...change } },
});

/** What the bars, the links and the phone's row do to the document. */
export const paneActions = {
  setHidden: (doc: PaneDoc, id: string, hidden: boolean) => withPane(doc, id, { hidden }),
  setCollapsed: (doc: PaneDoc, id: string, collapsed: boolean) => withPane(doc, id, { collapsed }),
  /** Expanded and on the page. */
  show: (doc: PaneDoc, id: string) => withPane(doc, id, { hidden: false, collapsed: false }),
  /** This pane expanded and on the page, every other collapsed: on a phone, the one showing. */
  jumpTo: (doc: PaneDoc, ids: string[], id: string) =>
    withPane(
      ids.reduce((d, each) => withPane(d, each, { collapsed: each !== id }), doc),
      id,
      { hidden: false },
    ),
  /** The narrowest and widest the pane may be made; undefined forgets one. */
  setLimits: (doc: PaneDoc, id: string, limits: { min?: number; max?: number }) => withPane(doc, id, limits),
  /** Widths from the sizing rules; the lead's, if there, is the room before the first pane. */
  setWidths: (doc: PaneDoc, { [leadId]: lead, ...widths }: Record<string, number>): PaneDoc =>
    Object.entries(widths).reduce(
      (d, [id, width]) => withPane(d, id, { width }),
      lead === undefined ? doc : { ...doc, lead: Math.max(Math.round(lead), 0) },
    ),
  move: (doc: PaneDoc, ids: string[], id: string, index: number) => ({ ...doc, order: movePane(ids, id, index) }),
  /** These panes closed as × closes them: a catalogue pane hidden, a copy removed. */
  close: (doc: PaneDoc, ids: string[]): PaneDoc =>
    ids.reduce((d, id) => (id.includes("#") ? paneActions.remove(d, id) : withPane(d, id, { hidden: true })), doc),
  setPinned: (doc: PaneDoc, key: string, pinned: boolean) => ({ ...doc, pins: { ...doc.pins, [key]: pinned } }),
  /** The views' order in the menus, and which are kept below the divider. */
  setViews: (doc: PaneDoc, order: string[], hidden: string[]): PaneDoc => ({ ...doc, views: { order, hidden } }),
  /**
   * What makeRoom decided, applied: the widths, the panes collapsed and the
   * panes hidden, each of those remembered as it was (`before`) so it can
   * be put back when room returns.
   */
  makeRoom: (
    doc: PaneDoc,
    room: { widths: Record<string, number>; collapse: string[]; hide: string[] },
    before: Record<string, Displaced>,
  ): PaneDoc => {
    // a pane the cascade changes is recorded as it was; one already collapsed or hidden keeps the
    // record it has (a row that can't fit is fitted again after every change: nothing new to remember)
    const newly = [...new Set([...room.collapse.filter((id) => !before[id]?.collapsed), ...room.hide.filter((id) => !before[id]?.hidden)])];
    const displaced = [...(doc.displaced ?? []).filter((d) => !newly.includes(d.id)), ...newly.map((id) => before[id])];
    let next = paneActions.setWidths(doc, room.widths);
    for (const id of room.collapse) next = withPane(next, id, { collapsed: true });
    for (const id of room.hide) next = withPane(next, id, { hidden: true });
    return { ...next, displaced };
  },
  /** The last pane a cascade displaced, put back as it was. */
  restore: (doc: PaneDoc, entry: Displaced): PaneDoc => ({
    ...withPane(doc, entry.id, { collapsed: entry.collapsed, hidden: entry.hidden, width: entry.width }),
    displaced: (doc.displaced ?? []).filter((d) => d !== entry && d.id !== entry.id),
  }),
  /** A pane the user collapsed or closed on purpose is not put back by a cascade's undo. */
  forget: (doc: PaneDoc, ids: string[]): PaneDoc => ({ ...doc, displaced: (doc.displaced ?? []).filter((d) => !ids.includes(d.id)) }),
  /** Another pane of `view` (its lowest free number), open, at `index` in the row (none: at the end). */
  add: (doc: PaneDoc, ids: string[], view: string, index?: number): PaneDoc => {
    const id = freeId(ids, view);
    const order = index === undefined ? undefined : [...ids.slice(0, index), id, ...ids.slice(index)];
    return { ...withPane(doc, id, { collapsed: false, hidden: false }), ...(order && { order }), added: [...(doc.added ?? []), id] };
  },
  /**
   * The pane `id` showing `view` instead: a new pane of that view takes its
   * place, width, limits and state; the old one goes (a catalogue pane is
   * hidden, since the frame always renders it; a copy is removed).
   */
  switchView: (doc: PaneDoc, ids: string[], id: string, view: string): PaneDoc => {
    if (viewOf(id) === view) return doc;
    const next = freeId(ids, view);
    // open: the icons are on an expanded pane's bar, and the new pane's own default could be collapsed
    const { hidden: _hidden, ...state } = doc.panes?.[id] ?? {};
    const moved = withPane({ ...doc, order: ids.map((x) => (x === id ? next : x)), added: [...(doc.added ?? []), next] }, next, { ...state, collapsed: false, hidden: false });
    return id.includes("#") ? paneActions.remove({ ...moved, order: moved.order }, id) : withPane(moved, id, { hidden: true });
  },
  /** An added pane taken away for good (a catalogue pane is only hidden). */
  remove: (doc: PaneDoc, id: string): PaneDoc => {
    const { [id]: _gone, ...panes } = doc.panes ?? {};
    return { ...doc, panes, added: (doc.added ?? []).filter((x) => x !== id), order: doc.order?.filter((x) => x !== id) };
  },
};
