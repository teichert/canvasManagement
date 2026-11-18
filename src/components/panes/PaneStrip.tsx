"use client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
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
  fitOpening,
  isShown,
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
function openWithRoom(doc: PaneDoc, panes: PaneView[], row: Row | undefined, id: string): PaneDoc {
  const pane = panes.find((p) => p.id === id);
  // already open: nothing to make room for
  if (!pane || !row || isShown(pane)) return paneActions.show(doc, id);
  const measured = Object.fromEntries(row.open.map((p) => [p.id, p.width]));
  const opening = panes
    .filter((p) => measured[p.id] !== undefined || p.id === id)
    .map((p) => ({ id: p.id, width: p.id === id ? Math.max(p.width, p.minWidth) : measured[p.id], minWidth: p.minWidth, maxWidth: p.maxWidth }));
  // a hidden pane has no bar on the page yet: it needs its bar's room too
  const need = Math.max(pane.width, pane.minWidth) - (pane.hidden ? 0 : row.bar);
  const { widths, collapse } = fitOpening(opening, id, need, row.free, row.bar);
  return paneActions.show(
    collapse.reduce((d, other) => paneActions.setCollapsed(d, other, true), paneActions.setWidths(doc, widths)),
    id,
  );
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
}: {
  children: ReactNode;
  /** A window that shows one view (a pop-out): what a link to a view does instead, and the layout is never written. */
  onShowPane?: (view: string) => void;
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
      // before the panes have registered (a page url that shows a pane, as the page loads), the document says what is on the page
      if (!panes.length) {
        const doc = parseDoc(readPaneDoc());
        const ids = [...Object.keys(doc.panes ?? {}), ...(doc.added ?? []), view];
        return update((d) => (doc.panes?.[view]?.hidden ? paneActions.add(d, ids, view) : paneActions.show(d, view)));
      }
      const pane = panes.find((p) => viewOf(p.id) === view && !p.hidden);
      if (!pane) return update((d) => paneActions.add(d, panes.map((p) => p.id), view));
      update((d) => openWithRoom(d, panes, narrow ? undefined : measureRow(panes), pane.id));
    });
    return () => {
      opener = undefined;
    };
  });
  // a mark that the panes have hydrated, for the browser checks
  useEffect(() => {
    document.documentElement.dataset.panesReady = "true";
  }, []);
  return (
    <StripContext.Provider
      value={{
        panes,
        narrow,
        showing: showingPane(panes),
        lead: parseDoc(json).lead ?? 0,
        added: parseDoc(json).added ?? [],
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
  const { panes, narrow, showing, lead, added, flashing, flash, update } = useContext(StripContext);
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
    flashing,
    flash,
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
        update((d) => (pane ? openWithRoom(d, panes, r, id) : added(d)));
      }
      flash(id);
    },
    /**
     * The pane as wide as its widest width (the row, with none) allows: the
     * others narrow to their narrowest, then collapse, then close, from the
     * right (see fitOpening), as far as needed. Already that wide: back to
     * its narrowest, the collapsed panes reopening at their narrowest, in
     * row order, as far as the room freed allows.
     */
    grow: (id: string) => {
      const r = row();
      const pane = panes.find((p) => p.id === id);
      const now = r?.open.find((p) => p.id === id);
      if (!r || !pane || !now) return;
      const target = Math.min(pane.maxWidth, r.room);
      if (now.width >= target - 1) {
        const widths: Record<string, number> = { [id]: pane.minWidth };
        let freed = now.width - pane.minWidth;
        const reopen: string[] = [];
        for (const p of panes) {
          if (p.id === id || p.hidden || !p.collapsed || p.minWidth - r.bar > freed) continue;
          reopen.push(p.id);
          widths[p.id] = p.minWidth;
          freed -= p.minWidth - r.bar;
        }
        return update((d) => reopen.reduce((x, c) => paneActions.setCollapsed(x, c, false), paneActions.setWidths(d, widths)));
      }
      const { widths, collapse, short } = fitOpening(r.open, id, target - now.width, r.free, r.bar);
      const hide: string[] = [];
      let left = short;
      for (const p of [...panes].reverse()) {
        if (left <= 0) break;
        if (p.id === id || p.hidden) continue;
        hide.push(p.id);
        left -= r.bar;
      }
      widths[id] = target - Math.max(left, 0);
      update((d) => paneActions.close(collapse.reduce((x, c) => paneActions.setCollapsed(x, c, true), paneActions.setWidths(d, widths)), hide));
    },
    /** These panes closed as × closes them (see paneActions.close). */
    close: (which: string[]) => update((d) => paneActions.close(frozen(d), which)),
    /** The pane showing another view instead, in its place (see paneActions.switchView). */
    switchView: (id: string, view: string) => update((d) => paneActions.switchView(d, ids, id, view)),
    /** Opening makes room as a drag would (see openWithRoom); closing only shifts the others. */
    setCollapsed: (id: string, collapsed: boolean) => {
      if (collapsed || narrow) return update((d) => paneActions.setCollapsed(frozen(d), id, collapsed));
      const r = row();
      update((d) => openWithRoom(d, panes, r, id));
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
