import { ReactNode } from "react";

/**
 * Everything a user has chosen about the panes, remembered as one document
 * in localStorage under `panes`: the order they dragged them into, which
 * bars are off the page, which panes are collapsed, their widths, and which
 * bars are pinned. Nothing here reads the document; PaneStrip does that
 * once and hands the derived views around.
 */
export type PaneDoc = {
  order?: string[];
  pins?: Record<string, boolean>;
  /** `min` and `max` are the widths the user set with the pane's rules (#73); without them, the pane's own minimum and no maximum. */
  panes?: Record<string, { hidden?: boolean; collapsed?: boolean; width?: number; min?: number; max?: number }>;
};
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
  /** The server renders this pane expanded; the rest start collapsed until the remembered choices are known. */
  ssr: boolean;
};

/**
 * A pane as the page shows it: its spec with the user's choices applied;
 * `width` is how wide it is (dragged, set by All, or its default),
 * `minWidth` and `maxWidth` the narrowest and widest it may be made
 * (`maxWidth` Infinity when none is set).
 */
export type PaneView = PaneSpec & { hidden: boolean; collapsed: boolean; width: number; maxWidth: number };

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
      hidden: saved.hidden ?? false,
      collapsed: saved.collapsed ?? (hydrated ? spec.collapsedByDefault() : !spec.ssr),
      width: saved.width ?? spec.defaultWidth,
      minWidth: Math.max(saved.min ?? spec.minWidth, spec.minWidth),
      maxWidth: saved.max ?? Infinity,
    };
  });
}

export const isShown = (pane: PaneView) => !pane.hidden && !pane.collapsed;

/** On a narrow window, the pane that shows: the first open one, else the first on the page at all. */
export const showingPane = (panes: PaneView[]) => (panes.find(isShown) ?? panes.find((p) => !p.hidden))?.id;

/**
 * An open pane in the row, as flexbox terms: exactly its width, so opening
 * or closing a pane only shifts the others and room nobody takes stays
 * empty. When the row is too narrow for every width, the panes give way
 * from the right (a shrink weight that climbs steeply with the pane's
 * place, so the rightmost gives way almost entirely before the next one
 * starts to), each down to its minimum. The room is shared out only by All
 * (see openAll).
 */
export const widthRule = (pane: { minWidth: number; width: number }, place: number) => {
  const width = Math.max(pane.width, pane.minWidth);
  return { flex: `0 ${16 ** place} ${width}px`, minWidth: `${pane.minWidth}px`, maxWidth: `${width}px` };
};

/** An open pane as the sizing rules see it. */
export type Sized = { id: string; width: number; minWidth: number; maxWidth: number };

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
 * Room for the pane `id` (in `open`, the open panes in order with it) to
 * open `need` px wider than its bar: from the empty room first, then the
 * other open panes shrink, those after it first, nearest first, then those
 * before it, each down to its min; if that isn't enough, open panes close
 * from the right (not `id`), each giving back all but its bar.
 */
export function fitOpening(open: Sized[], id: string, need: number, free: number, bar: number) {
  const widths = Object.fromEntries(open.map((p) => [p.id, p.width]));
  const at = open.findIndex((p) => p.id === id);
  const others = [...open.slice(at + 1), ...open.slice(0, at).reverse()];
  let short = need - free;
  if (short > 0) short -= spread(widths, others, short, (p) => widths[p.id] - p.minWidth, -1);
  const collapse: string[] = [];
  for (const p of [...open].reverse()) {
    if (short <= 0) break;
    if (p.id === id) continue;
    collapse.push(p.id);
    short -= widths[p.id] - bar;
    delete widths[p.id];
  }
  return { widths, collapse };
}

/**
 * All: every pane on the page open in a row `room` px wide. Each gets its
 * min, handed out from the left while they fit (a pane that doesn't is
 * collapsed to its bar); what's left is shared in proportion to how much
 * more each could take (max − min; no max counts as the whole row), nobody
 * passing its max.
 */
export function shareRow(panes: Sized[], room: number, bar: number) {
  const widths: Record<string, number> = {};
  const collapse: string[] = [];
  let left = room - panes.length * bar;
  for (const p of panes) {
    if (p.minWidth - bar <= left) {
      widths[p.id] = p.minWidth;
      left -= p.minWidth - bar;
    } else collapse.push(p.id);
  }
  // water-fill: share in proportion to headroom, cap at max, share again what the capped couldn't take
  let open = panes.filter((p) => !collapse.includes(p.id));
  while (left > 0.5 && open.length) {
    const headroom = (p: Sized) => Math.min(p.maxWidth, room) - p.minWidth;
    const total = sum(open, headroom);
    if (total <= 0) break;
    let handed = 0;
    for (const p of open) {
      const share = Math.min((left * headroom(p)) / total, p.maxWidth - widths[p.id]);
      widths[p.id] += share;
      handed += share;
    }
    left -= handed;
    open = open.filter((p) => p.maxWidth - widths[p.id] > 0.5);
    if (handed < 0.5) break;
  }
  return { widths, collapse };
}

/** `order` with `id` moved to `index`. */
export function movePane(order: string[], id: string, index: number): string[] {
  const rest = order.filter((x) => x !== id);
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

const withPane = (doc: PaneDoc, id: string, change: NonNullable<PaneDoc["panes"]>[string]): PaneDoc => ({
  ...doc,
  panes: { ...doc.panes, [id]: { ...doc.panes?.[id], ...change } },
});

/** What the menu, the bars and the phone's row do to the document. */
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
  setAllCollapsed: (doc: PaneDoc, ids: string[], collapsed: boolean) =>
    ids.reduce((d, id) => withPane(d, id, { collapsed }), doc),
  /** Every pane whose bar is on the page open at the widths given, those in `collapse` collapsed (see shareRow). */
  openAll: (doc: PaneDoc, widths: Record<string, number>, collapse: string[] = []) =>
    collapse.reduce(
      (d, id) => withPane(d, id, { collapsed: true }),
      Object.entries(widths).reduce((d, [id, width]) => withPane(d, id, { collapsed: false, width }), doc),
    ),
  setAllHidden: (doc: PaneDoc, ids: string[], hidden: boolean) =>
    ids.reduce((d, id) => withPane(d, id, { hidden }), doc),
  /** The narrowest and widest the pane may be made; undefined forgets it. */
  setLimits: (doc: PaneDoc, id: string, limits: { min?: number; max?: number }) => withPane(doc, id, limits),
  setWidths: (doc: PaneDoc, widths: Record<string, number>) =>
    Object.entries(widths).reduce((d, [id, width]) => withPane(d, id, { width }), doc),
  move: (doc: PaneDoc, ids: string[], id: string, index: number) => ({ ...doc, order: movePane(ids, id, index) }),
  setPinned: (doc: PaneDoc, key: string, pinned: boolean) => ({ ...doc, pins: { ...doc.pins, [key]: pinned } }),
  /** Back to how the app starts. */
  reset: (): PaneDoc => ({}),
};
