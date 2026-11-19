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
import { measureRow, Row } from "./measureRow";
import {
  Displaced,
  displacedNow,
  fitOpening,
  isShown,
  leadId,
  makeRoom,
  paneActions,
  PaneDoc,
  paneDocKey,
  PaneSpec,
  PaneView,
  freeId,
  parseDoc,
  showingPane,
  viewOf,
  viewPanes,
} from "./paneStore";

/**
 * The document with `id` opened, room made as a drag would make it (see
 * fitOpening): the empty room first, then the other open panes narrowed to
 * their narrowest, those after it first, then open panes closed from the
 * right. On a phone, or without a row to measure, simply shown.
 */
function openWithRoom(doc: PaneDoc, panes: PaneView[], row: Row | undefined, ids: string[], lead = 0): PaneDoc {
  const shown = (d: PaneDoc) => ids.reduce((x, id) => paneActions.show(x, id), d);
  const opening = panes.filter((p) => ids.includes(p.id) && !isShown(p));
  // already open: nothing to make room for
  if (!opening.length || !row) return shown(doc);
  const measured = Object.fromEntries(row.open.map((p) => [p.id, p.width]));
  const wanted = (p: PaneView) => Math.max(p.width, p.minWidth);
  const sized = panes
    .filter((p) => measured[p.id] !== undefined || opening.includes(p))
    .map((p) => ({ id: p.id, width: opening.includes(p) ? wanted(p) : measured[p.id], minWidth: p.minWidth, maxWidth: p.maxWidth }));
  // a hidden pane has no bar on the page yet: it needs its bar's room too
  const need = opening.reduce((sum, p) => sum + wanted(p) - (p.hidden ? 0 : row.bar), 0);
  // the empty room at either end of the row goes first
  const { widths, collapse } = fitOpening(sized, ids, need, row.free + lead, row.bar);
  widths[leadId] = lead - Math.max(Math.min(Math.max(need, 0), row.free + lead) - row.free, 0);
  return shown(collapse.reduce((d, other) => paneActions.setCollapsed(d, other, true), paneActions.setWidths(doc, widths)));
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
      update((d) => openWithRoom(d, panes, narrow ? undefined : measureRow(panes), [pane.id], lead));
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
  // After every change to the layout or the window: a row wider than its room
  // (the window made smaller, a layout from a wider window, a pane added to a
  // full row) has its first open pane keep its width and the rest give way as a
  // cascade does (see makeRoom), remembered; and what a cascade displaced comes
  // back, last first, as the room allows: the last entry is put back if it fits now
  useLayoutEffect(() => {
    if (narrow || !hydrated) return;
    const r = measureRow(panes);
    if (r.free < -1 && r.open.length) {
      const first = r.open[0];
      const made = makeRoom(r.open, panes.filter((p) => !p.hidden).map((p) => p.id), first.id, first.width, r.free, lead, r.bar);
      return update((d) => paneActions.makeRoom(d, made, displacedNow(panes, r.open)));
    }
    const entry = parseDoc(json).displaced?.at(-1);
    if (!entry) return;
    const pane = panes.find((p) => p.id === entry.id);
    if (!pane) return update((d) => paneActions.restore(d, entry));
    const has = pane.hidden ? 0 : pane.collapsed ? r.bar : r.open.find((o) => o.id === pane.id)?.width ?? pane.width;
    const wants = entry.hidden ? 0 : entry.collapsed ? r.bar : Math.max(entry.width, pane.minWidth);
    if (wants - has <= r.free + 1) update((d) => paneActions.restore(d, entry));
  });
  return (
    <StripContext.Provider
      value={{
        panes,
        narrow,
        showing: showingPane(panes),
        lead,
        added: parseDoc(json).added ?? [],
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
export const showPane = (id: string) => opener?.(id);

// the strip on the page, if any, opens a pane with room made (see openWithRoom)
let opener: ((id: string) => void) | undefined;

/** The panes on the page and what can be done to them; for the panes themselves and the phone's row. */
export function usePanes() {
  const { panes, narrow, showing, lead, added, views, flashing, flash, update } = useContext(StripContext);
  const ids = panes.map((p) => p.id);
  // measured when acted on, never while rendering; on a phone the widths
  // are the screen's and aren't kept
  const row = () => (narrow ? undefined : measureRow(panes));
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
    views,
    flashing,
    flash,
    /** The views' order in the menus, and which are kept below the divider, off the icon stacks. */
    setViews: (order: string[], hidden: string[]) => update((d) => paneActions.setViews(d, order, hidden)),
    /** These panes on the page and open, room made for them together (see openWithRoom); a hidden one comes on where it stands. */
    show: (...ids: string[]) => {
      const r = row();
      update((d) => openWithRoom(d, panes, r, ids, lead));
    },
    /** The layout as the catalogue has it: every pane at its default, the menus in their first order; the pinned bars stay. */
    restoreDefaults: () => update((d) => ({ pins: d.pins })),
    /** Another pane of a view, open, at `index` in the row (none: at the end). */
    addPane: (view: string, index?: number) => update((d) => paneActions.add(d, ids, view, index)),
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
        const r = row();
        update((d) => (pane ? openWithRoom(d, panes, r, [id], lead) : added(d)));
      }
      flash(id);
    },
    /**
     * The pane `target` wide, room made by the cascade (see makeRoom): the
     * others narrow to their narrowest, then collapse, then hide, from the
     * right, as far as needed; what gave way is remembered and comes back as
     * room returns.
     */
    widen: (id: string, target: number) => {
      const r = row();
      if (!r) return;
      const made = makeRoom(r.open, panes.filter((p) => !p.hidden).map((p) => p.id), id, target, r.free, lead, r.bar);
      update((d) => paneActions.makeRoom(d, made, displacedNow(panes, r.open)));
    },
    /**
     * The pane as wide as its widest width (the row, with none) allows, by
     * the cascade (see widen). Already that wide: back to its narrowest,
     * and what the cascade displaced comes back as the room allows.
     */
    grow: (id: string) => {
      const r = row();
      const pane = panes.find((p) => p.id === id);
      const now = r?.open.find((p) => p.id === id);
      if (!r || !pane || !now) return;
      const target = Math.min(now.maxWidth, r.room);
      const made = makeRoom(r.open, panes.filter((p) => !p.hidden).map((p) => p.id), id, target, r.free, lead, r.bar);
      // growing would change nothing: it is as wide as it may be, so back to its narrowest instead
      if (made.widths[id] - now.width < 2) return update((d) => paneActions.setWidths(d, { [id]: pane.minWidth }));
      update((d) => paneActions.makeRoom(d, made, displacedNow(panes, r.open)));
    },
    /** What a cascade decided (see makeRoom), written to the layout with what it displaced remembered. */
    applyRoom: (made: { widths: Record<string, number>; collapse: string[]; hide: string[] }, before: Record<string, Displaced>) =>
      update((d) => paneActions.makeRoom(d, made, before)),
    /** These panes closed as × closes them (see paneActions.close). */
    close: (which: string[]) => update((d) => paneActions.close(paneActions.forget(frozen(d), which), which)),
    /** The pane showing another view instead, in its place (see paneActions.switchView). */
    switchView: (id: string, view: string) => update((d) => paneActions.switchView(d, ids, id, view)),
    /** Opening makes room as a drag would (see openWithRoom); closing only shifts the others. */
    setCollapsed: (id: string, collapsed: boolean) => {
      if (collapsed || narrow) return update((d) => paneActions.setCollapsed(paneActions.forget(frozen(d), [id]), id, collapsed));
      const r = row();
      update((d) => openWithRoom(d, panes, r, [id], lead));
    },
    /** The narrowest and widest the pane may be made; undefined forgets one. */
    setLimits: (id: string, limits: { min?: number; max?: number }) => update((d) => paneActions.setLimits(d, id, limits)),
    /** This pane open, the rest collapsed: on a phone, the one showing. */
    jumpTo: (id: string) => update((d) => paneActions.jumpTo(frozen(d), ids, id)),
    /** Widths from the sizing rules, and the limits a drag from a resize square moved (see limitsAfter). */
    setWidths: (widths: Record<string, number>, moved?: { id: string; min?: number; max?: number }) =>
      update((d) => {
        const withWidths = paneActions.setWidths(d, widths);
        const limits = { ...(moved?.min !== undefined && { min: moved.min }), ...(moved?.max !== undefined && { max: moved.max }) };
        return moved && Object.keys(limits).length ? paneActions.setLimits(withWidths, moved.id, limits) : withWidths;
      }),
    move: (id: string, index: number) => update((d) => paneActions.move(d, ids, id, index)),
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
