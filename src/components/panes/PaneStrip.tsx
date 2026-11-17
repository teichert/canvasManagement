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
  // pane of the view at the end of the row
  useEffect(() => {
    opener = onShowPane ?? ((view) => {
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

/** Shows a view's pane (the first on the page, expanded; a new one at the end when there is none) from anywhere, a link outside the frame included. */
export const showPane = (id: string) => {
  if (opener) return opener(id);
  // no strip yet (the page is loading): the document alone says whether the view's pane is on the page
  const doc = parseDoc(readPaneDoc());
  const ids = [...new Set([...Object.keys(doc.panes ?? {}), ...(doc.added ?? []), id])];
  writePaneDoc(JSON.stringify(doc.panes?.[id]?.hidden ? paneActions.add(doc, ids, id) : paneActions.show(doc, id)));
};

// the strip on the page, if any, opens a pane with room made (see
// openWithRoom); a link outside a course's frame just writes the document
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
    setHidden: (id: string, hidden: boolean) => update((d) => paneActions.setHidden(d, id, hidden)),
    /** Another pane of a view, open, after the pane given or at the end of the row. */
    addPane: (view: string, after?: string) => update((d) => paneActions.add(d, ids, view, after === undefined ? undefined : ids.indexOf(after) + 1)),
    /** Another pane of a view, open, at the start of the row. */
    addPaneFirst: (view: string) => update((d) => paneActions.add(d, ids, view, 0)),
    /**
     * A view asked for from an edge bar: its first open pane is shown where it
     * is (outlined for a moment); with none open, its first pane is expanded
     * and outlined; with none on the page, a new one at that end of the row.
     */
    showView: (view: string, end: "start" | "end") => {
      const existing = panes.filter((p) => viewOf(p.id) === view && !p.hidden);
      if (!existing.length) {
        const id = freeId(ids, view);
        update((d) => paneActions.add(d, ids, view, end === "start" ? 0 : undefined));
        return flash(id);
      }
      const pane = existing.find(isShown) ?? existing[0];
      if (!isShown(pane)) {
        const r = row();
        update((d) => openWithRoom(d, panes, r, pane.id));
      }
      flash(pane.id);
    },
    /** These panes closed as × closes them (see paneActions.close). */
    close: (which: string[]) => update((d) => paneActions.close(frozen(d), which)),
    /** The pane showing another view instead, in its place (see paneActions.switchView). */
    switchView: (id: string, view: string) => update((d) => paneActions.switchView(d, ids, id, view)),
    removePane: (id: string) => update((d) => paneActions.remove(d, id)),
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
    /** On a phone: the first pane of the view showing, added at the end when there is none. */
    jumpToView: (view: string) => {
      const pane = panes.find((p) => viewOf(p.id) === view && !p.hidden);
      if (pane) return update((d) => paneActions.jumpTo(d, ids, pane.id));
      update((d) => {
        const id = freeId(ids, view);
        return paneActions.jumpTo(paneActions.add(d, ids, view), [...ids, id], id);
      });
    },
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
