"use client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { remember, subscribeToStorage } from "../storage";

// Each window keeps its own layout (sessionStorage: it survives that
// window's reloads), seeded from the last layout saved by any window
// (localStorage): new windows start where you left off, then go their own
// way, so two full windows needn't agree on what is open.
const readPaneDoc = () => sessionStorage.getItem(paneDocKey) ?? localStorage.getItem(paneDocKey);
const writePaneDoc = (json: string) => {
  sessionStorage.setItem(paneDocKey, json);
  remember(paneDocKey, json);
};
import { Effect, Layout, makeRoom, resize, restore } from "./cascade";
import { measureLayout, measureRow } from "./measureRow";
import { isShown, paneActions, PaneDoc, paneDocKey, PaneSpec, PaneView, freeId, parseDoc, showingPane, viewOf, viewPanes } from "./paneStore";
import { showWidths } from "./useEdgeDrag";

/**
 * The document with the panes `ids` open and on the page, room made for
 * them together by the cascade (see makeRoom), what it displaced
 * remembered. On a phone, or without a row to measure, simply shown.
 */
function openWithRoom(doc: PaneDoc, layout: Layout | undefined, ids: string[]): PaneDoc {
  const shown = (d: PaneDoc) => ids.reduce((x, id) => paneActions.show(x, id), d);
  const opening = layout?.slabs.filter((s) => ids.includes(s.id) && (s.collapsed || s.hidden)) ?? [];
  // already open: nothing to make room for
  if (!layout || !opening.length) return shown(doc);
  const wanted = (s: Layout["slabs"][number]) => Math.max(s.width, s.minWidth);
  // a hidden pane has no bar on the page yet: it needs its bar's room and a gap too
  const need = opening.reduce((sum, s) => sum + wanted(s) - (s.hidden ? -layout.gap : layout.bar), 0);
  const opened = { ...layout, slabs: layout.slabs.map((s) => (opening.includes(s) ? { ...s, width: wanted(s), collapsed: false, hidden: false } : s)) };
  const made = makeRoom(opened, ids, need);
  return paneActions.applyLayout(doc, made.layout, [...(doc.displaced ?? []), ...made.effects]);
}

type Strip = {
  panes: PaneView[];
  /** A narrow window (a phone): one pane at a time, the first open one. */
  narrow: boolean;
  /** The pane showing on a narrow window. */
  showing?: string;
  /** Empty room before the first pane (see withLead). */
  lead: number;
  /** Panes beyond the catalogue's: a view's second and later copies (see paneActions.add). */
  added: string[];
  /** What cascades displaced, waiting for room to come back (see cascade). */
  records: Effect[];
  /** While a drag shows what it would do: which panes it shows collapsed and off the page (see usePanes().preview). */
  previewing: { collapsed: string[]; hidden: string[] } | null;
  setPreviewing: (p: { collapsed: string[]; hidden: string[] } | null) => void;
  /** The views' order and which are kept below the menus' divider (see paneActions.setViews). */
  views: NonNullable<PaneDoc["views"]>;
  /** The pane briefly outlined, to show where it is (see usePanes().flash). */
  flashing?: string;
  flash: (id: string) => void;
  pins: Record<string, boolean>;
  register: (spec: PaneSpec) => () => void;
  updateSpec: (spec: PaneSpec) => void;
  update: (change: (doc: PaneDoc) => PaneDoc) => void;
};

const StripContext = createContext<Strip>({
  panes: [],
  lead: 0,
  added: [],
  records: [],
  previewing: null,
  setPreviewing: () => {},
  views: {},
  narrow: false,
  flash: () => {},
  pins: {},
  register: () => () => {},
  updateSpec: () => {},
  update: () => {},
});

// Tailwind's md breakpoint: below it the panes stack and one shows at a time
const narrowQuery = "(max-width: 47.99rem)";
const subscribeToWidth = (onChange: () => void) => {
  const query = window.matchMedia(narrowQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const subscribeToNothing = () => () => {};

/**
 * The row of panes on a course page. Panes register themselves as they
 * mount; the strip reads the remembered document once per change, derives
 * every pane's view from it (see paneStore), and hands the views and the
 * actions on the document to the panes and the phone's row.
 */
export function PaneStrip({
  children,
  onShowPane,
  popsOut,
  onPopOut,
}: {
  children: ReactNode;
  /** A window that shows one view (a pop-out): what a link to a view does instead, and the layout is never written. */
  onShowPane?: (view: string) => void;
  /** Views a link opens in a window of their own instead of a pane. */
  popsOut?: (view: string) => boolean;
  onPopOut?: (view: string) => void;
}) {
  const [specs, setSpecs] = useState<PaneSpec[]>([]);
  const register = useCallback((spec: PaneSpec) => {
    setSpecs((current) => (current.some((s) => s.id === spec.id) ? current : [...current, spec]));
    return () => setSpecs((current) => current.filter((s) => s.id !== spec.id));
  }, []);
  // a changed flag replaces the spec in place, keeping the pane's position
  const updateSpec = useCallback((spec: PaneSpec) => {
    setSpecs((current) => current.map((s) => (s.id === spec.id ? spec : s)));
  }, []);
  const json = useSyncExternalStore(subscribeToStorage, readPaneDoc, () => null);
  // false on the server and while hydrating: the views then use what the server renders
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const narrow = useSyncExternalStore(subscribeToWidth, () => window.matchMedia(narrowQuery).matches, () => false);
  const panes = viewPanes(specs, parseDoc(json), hydrated);
  const lead = parseDoc(json).lead ?? 0;
  const [flashing, setFlashing] = useState<string>();
  const [previewing, setPreviewing] = useState<{ collapsed: string[]; hidden: string[] } | null>(null);
  const flash = useCallback((id: string) => setFlashing(id), []);
  // timed from when the outline is on screen: a pane's first render can take a while
  useEffect(() => {
    if (!flashing) return;
    const timer = setTimeout(() => setFlashing(undefined), 3000);
    return () => clearTimeout(timer);
  }, [flashing]);
  const update = useCallback(
    (change: (doc: PaneDoc) => PaneDoc) => {
      if (onShowPane) return;
      writePaneDoc(JSON.stringify(change(parseDoc(readPaneDoc()))));
    },
    [onShowPane],
  );
  // links (showPane) open the first pane of the view on the page the way the bar
  // does, room made, on the panes as they are now; with none on the page, a new
  // pane of the view at the end of the row. A layout effect: set before any
  // child's effect runs (a page url that shows a pane does so as it mounts)
  useLayoutEffect(() => {
    opener = onShowPane ?? ((view) => {
      if (popsOut?.(view) && onPopOut) return onPopOut(view);
      // before the panes have registered (a page url that shows a pane, as the page loads), the document says what is on the page
      if (!panes.length) {
        const doc = parseDoc(readPaneDoc());
        const ids = [...Object.keys(doc.panes ?? {}), ...(doc.added ?? []), view];
        return update((d) => (doc.panes?.[view]?.hidden ? paneActions.add(d, ids, view) : paneActions.show(d, view)));
      }
      const pane = panes.find((p) => viewOf(p.id) === view && !p.hidden);
      if (!pane) return update((d) => paneActions.add(d, panes.map((p) => p.id), view));
      update((d) => openWithRoom(d, narrow ? undefined : measureLayout(panes, lead), [pane.id]));
    });
    return () => {
      opener = undefined;
    };
  });
  // a mark that the panes have hydrated, for the browser checks
  useEffect(() => {
    document.documentElement.dataset.panesReady = "true";
  }, []);
  // the window's size is part of the layout: its change is a change to look at
  const [, resized] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  // After every change to the layout or the window (not while a drag shows
  // what it would do): a row wider than its room (the window made smaller, a
  // layout from a wider window, a pane added to a full row) has its first open
  // pane keep its width and the rest give way by the cascade (see makeRoom);
  // and empty room brings back what cascades displaced (see restore)
  useLayoutEffect(() => {
    if (narrow || !hydrated || previewing) return;
    const doc = parseDoc(json);
    const records = doc.displaced ?? [];
    const layout = measureLayout(panes, lead);
    if (layout.free < -1) {
      const first = layout.slabs.find((s) => !s.collapsed && !s.hidden);
      if (!first) return;
      const made = makeRoom(layout, [first.id], 0);
      // a pane narrowed from its default width (never sized) is the default fitting the window: nothing to undo
      const effects = made.effects.filter((e) => e.kind !== "narrow" || doc.panes?.[e.id]?.width !== undefined);
      return update((d) => paneActions.applyLayout(d, made.layout, [...records, ...effects]));
    }
    if (!records.length) return;
    const back = restore(layout, records);
    if (back.changed || back.records.length !== records.length) update((d) => paneActions.applyLayout(d, back.layout, back.records));
  });
  return (
    <StripContext.Provider
      value={{
        panes,
        narrow,
        showing: showingPane(panes),
        lead,
        added: parseDoc(json).added ?? [],
        records: parseDoc(json).displaced ?? [],
        previewing,
        setPreviewing,
        views: parseDoc(json).views ?? {},
        flashing,
        flash,
        pins: parseDoc(json).pins ?? {},
        register,
        updateSpec,
        update,
      }}
    >
      {children}
    </StripContext.Provider>
  );
}

/** Shows a view's pane (the first on the page, expanded; a new one at the end when there is none) from anywhere on a page with a strip. */
/** The widths a drag is showing (see usePanes().preview), for a pane that renders meanwhile. */
export let previewWidths: Map<string, number> | undefined;

export const showPane = (id: string) => opener?.(id);

// the strip on the page, if any, opens a pane with room made (see openWithRoom)
let opener: ((id: string) => void) | undefined;

/** The panes on the page and what can be done to them; for the panes themselves and the phone's row. */
export function usePanes() {
  const { panes, narrow, showing, lead, added, records, previewing, setPreviewing, views, flashing, flash, update } = useContext(StripContext);
  const ids = panes.map((p) => p.id);
  // measured when acted on, never while rendering; on a phone the widths
  // are the screen's and aren't kept
  const row = () => (narrow ? undefined : measureRow(panes));
  const layout = () => (narrow ? undefined : measureLayout(panes, lead));
  // a toggle keeps every open pane at the width it has (a pane the row had
  // squeezed stays as it was), so the toggle only shifts the others
  const frozen = (doc: PaneDoc) => {
    const r = row();
    return r ? paneActions.setWidths(doc, Object.fromEntries(r.open.map((p) => [p.id, p.width]))) : doc;
  };
  return {
    panes,
    narrow,
    showing,
    lead,
    added,
    records,
    previewing,
    views,
    flashing,
    flash,
    /** The views' order in the menus, and which are kept below the divider, off the icon stacks. */
    setViews: (order: string[], hidden: string[]) => update((d) => paneActions.setViews(d, order, hidden)),
    /** These panes on the page and open, room made for them together (see openWithRoom); a hidden one comes on where it stands. */
    show: (...ids: string[]) => {
      const l = layout();
      update((d) => openWithRoom(d, l, ids));
    },
    /** The layout as the catalogue has it: every pane at its default, the menus in their first order; the pinned bars stay. */
    restoreDefaults: () => update((d) => ({ pins: d.pins })),
    /** Another pane of a view, open, at `index` in the row (none: at the end). */
    addPane: (view: string, index?: number) => update((d) => paneActions.add(paneActions.forget(d), ids, view, index)),
    /**
     * A view asked for by its icon: its first open pane is shown where it is
     * (outlined for a moment); with none open, its first pane is expanded and
     * outlined; with none on the page, a new one at that end of the row. On a
     * phone the pane is the one showing (see jumpTo).
     */
    showView: (view: string, end: "start" | "end") => {
      const existing = panes.filter((p) => viewOf(p.id) === view && !p.hidden);
      const pane = existing.find(isShown) ?? existing[0];
      const id = pane?.id ?? freeId(ids, view);
      const added = (d: PaneDoc) => (pane ? d : paneActions.add(d, ids, view, end === "start" ? 0 : undefined));
      if (narrow) update((d) => paneActions.jumpTo(added(d), [...ids, id], id));
      else if (!pane || !isShown(pane)) {
        const l = layout();
        update((d) => (pane ? openWithRoom(d, l, [id]) : added(d)));
      }
      flash(id);
    },
    /**
     * The title's double-click: the pane as wide as its widest width allows
     * (as wide as the row can make it when it is already wider than that, as
     * the Calendar starts), by the cascade (see resize); already that wide,
     * back to its narrowest, and what the cascade displaced comes back.
     */
    grow: (id: string) => {
      const l = layout();
      const pane = l?.slabs.find((s) => s.id === id);
      if (!l || !pane || pane.collapsed || pane.hidden) return;
      // all the room there is: the empty room and every other pane on the page
      const all = l.free + l.lead + l.slabs.reduce((sum, s) => sum + (s.id === id || s.hidden ? 0 : s.width + l.gap), 0);
      const target = pane.width > pane.maxWidth + 1 ? pane.width + all : pane.maxWidth;
      const grown = resize(l, id, target - pane.width, records);
      const got = (grown.layout.slabs.find((s) => s.id === id)?.width ?? 0) - pane.width;
      const done = got >= 1 ? grown : resize(l, id, pane.minWidth - pane.width, records);
      update((d) => paneActions.applyLayout(d, done.layout, done.records));
    },
    /**
     * Shows a layout a drag would make without writing it (null: the
     * layout again): the widths onto the panes (see showWidths), and which
     * are collapsed or off the page through the panes' own rendering.
     */
    preview: (next: Layout | null) => {
      if (!next) return setPreviewing(null);
      const collapsed = next.slabs.filter((s) => s.collapsed && !s.hidden).map((s) => s.id);
      const hidden = next.slabs.filter((s) => s.hidden).map((s) => s.id);
      if (JSON.stringify(previewing) !== JSON.stringify({ collapsed, hidden })) setPreviewing({ collapsed, hidden });
      previewWidths = new Map(next.slabs.map((s) => [s.id, s.width]));
      showWidths(next);
    },
    /** What a drag showed, written to the layout as it is, with the limits a resize square moved (see squareDrag). */
    save: (next: Layout, remaining: Effect[], limits: Record<string, { min?: number; max?: number }> = {}) => {
      previewWidths = undefined;
      setPreviewing(null);
      update((d) => Object.entries(limits).reduce((x, [id, l]) => paneActions.setLimits(x, id, l), paneActions.applyLayout(d, next, remaining)));
    },
    /** These panes closed as × closes them (see paneActions.close). */
    close: (which: string[]) => update((d) => paneActions.close(paneActions.forget(frozen(d)), which)),
    /** The pane showing another view instead, in its place (see paneActions.switchView). */
    switchView: (id: string, view: string) => update((d) => paneActions.switchView(paneActions.forget(d), ids, id, view)),
    /** Opening makes room as a drag would (see openWithRoom); closing only shifts the others. */
    setCollapsed: (id: string, collapsed: boolean) => {
      if (collapsed || narrow) return update((d) => paneActions.setCollapsed(paneActions.forget(frozen(d)), id, collapsed));
      const l = layout();
      update((d) => openWithRoom(d, l, [id]));
    },
    /** The narrowest and widest the pane may be made; undefined forgets one. */
    setLimits: (id: string, limits: { min?: number; max?: number }) => update((d) => paneActions.setLimits(d, id, limits)),
    /** This pane open, the rest collapsed: on a phone, the one showing. */
    jumpTo: (id: string) => update((d) => paneActions.jumpTo(frozen(d), ids, id)),
    move: (id: string, index: number) => update((d) => paneActions.move(paneActions.forget(d), ids, id, index)),
  };
}

/** Whether a bar stays at the top (the default) or is let go, by key; see PinButton. */
export function usePinned(key: string): [boolean, () => void] {
  const { pins, update } = useContext(StripContext);
  const pinned = pins[key] ?? true;
  return [pinned, () => update((d) => paneActions.setPinned(d, key, !pinned))];
}

/** A pane tells the strip about itself while it's mounted, and keeps its place as its flags change. */
export function usePaneRegistration(spec: PaneSpec) {
  const { register, updateSpec } = useContext(StripContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => register(spec), [spec.id, register]);
  useLayoutEffect(
    () => updateSpec(spec),
    // collapsedByDefault and icon are fresh each render; the spec is re-read when these change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec.label, spec.minWidth, spec.defaultWidth, spec.ssr, updateSpec],
  );
}
