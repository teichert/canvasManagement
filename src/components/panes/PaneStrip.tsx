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
import { measureRow, Row } from "./measureRow";
import {
  fitOpening,
  isShown,
  paneActions,
  PaneDoc,
  paneDocKey,
  PaneSpec,
  PaneView,
  parseDoc,
  shareRow,
  showingPane,
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
  pins: Record<string, boolean>;
  register: (spec: PaneSpec) => () => void;
  updateSpec: (spec: PaneSpec) => void;
  update: (change: (doc: PaneDoc) => PaneDoc) => void;
};

const StripContext = createContext<Strip>({
  panes: [],
  narrow: false,
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
 * actions on the document to the panes, the View menu and the phone's row.
 */
export function PaneStrip({ children }: { children: ReactNode }) {
  const [specs, setSpecs] = useState<PaneSpec[]>([]);
  const register = useCallback((spec: PaneSpec) => {
    setSpecs((current) => (current.some((s) => s.id === spec.id) ? current : [...current, spec]));
    return () => setSpecs((current) => current.filter((s) => s.id !== spec.id));
  }, []);
  // a changed flag replaces the spec in place, keeping the pane's position
  const updateSpec = useCallback((spec: PaneSpec) => {
    setSpecs((current) => current.map((s) => (s.id === spec.id ? spec : s)));
  }, []);
  const json = useSyncExternalStore(subscribeToStorage, () => localStorage.getItem(paneDocKey), () => null);
  // false on the server and while hydrating: the views then use what the server renders
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const narrow = useSyncExternalStore(subscribeToWidth, () => window.matchMedia(narrowQuery).matches, () => false);
  const panes = viewPanes(specs, parseDoc(json), hydrated);
  const update = useCallback((change: (doc: PaneDoc) => PaneDoc) => {
    remember(paneDocKey, JSON.stringify(change(parseDoc(localStorage.getItem(paneDocKey)))));
  }, []);
  // links (showPane) open panes the way the bar does: room made, on the panes as they are now
  useEffect(() => {
    opener = (id) => update((d) => openWithRoom(d, panes, narrow ? undefined : measureRow(panes), id));
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

/** Shows a pane (expanded and on the page) from anywhere, a link outside the frame included. */
export const showPane = (id: string) =>
  opener ? opener(id) : remember(paneDocKey, JSON.stringify(paneActions.show(parseDoc(localStorage.getItem(paneDocKey)), id)));

// the strip on the page, if any, opens a pane with room made (see
// openWithRoom); a link outside a course's frame just writes the document
let opener: ((id: string) => void) | undefined;

/** The panes on the page and what can be done to them; for the panes themselves, the View menu and the phone's row. */
export function usePanes() {
  const { panes, narrow, showing, update } = useContext(StripContext);
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
    setHidden: (id: string, hidden: boolean) => update((d) => paneActions.setHidden(d, id, hidden)),
    /** Opening makes room as a drag would (see openWithRoom); closing only shifts the others. */
    setCollapsed: (id: string, collapsed: boolean) => {
      if (collapsed || narrow) return update((d) => paneActions.setCollapsed(frozen(d), id, collapsed));
      const r = row();
      update((d) => openWithRoom(d, panes, r, id));
    },
    /** The narrowest and widest the pane may be made. */
    setLimits: (id: string, limits: { min?: number; max?: number }) => update((d) => paneActions.setLimits(d, id, limits)),
    /** This pane open, the rest collapsed: on a phone, the one showing. */
    jumpTo: (id: string) => update((d) => paneActions.jumpTo(frozen(d), ids, id)),
    setAllCollapsed: (collapsed: boolean) => update((d) => paneActions.setAllCollapsed(frozen(d), ids, collapsed)),
    /** Every pane on the page open, the room shared out among them. */
    openAll: () => {
      const r = row();
      if (!r) return update((d) => paneActions.setAllCollapsed(d, ids, false));
      const { widths, collapse } = shareRow(panes.filter((p) => !p.hidden), r.room, r.bar);
      update((d) => paneActions.openAll(d, widths, collapse));
    },
    setAllHidden: (hidden: boolean) => update((d) => paneActions.setAllHidden(d, ids, hidden)),
    setWidths: (widths: Record<string, number>) => update((d) => paneActions.setWidths(d, widths)),
    move: (id: string, index: number) => update((d) => paneActions.move(d, ids, id, index)),
    reset: () => update(paneActions.reset),
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
