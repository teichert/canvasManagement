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
  Sized,
  viewPanes,
} from "./paneStore";

export const paneElement = (id: string) => document.querySelector<HTMLElement>(`[data-pane="${id}"]`);

/** Every open pane's width as it is on the page right now. */
export const renderedWidths = (panes: PaneView[]) =>
  Object.fromEntries(panes.filter(isShown).map((p) => [p.id, paneElement(p.id)?.getBoundingClientRect().width ?? p.width]));

/** The open panes as the sizing rules see them, at their widths on the page. */
export const sized = (panes: PaneView[]): Sized[] => {
  const widths = renderedWidths(panes);
  return panes.filter(isShown).map((p) => ({ id: p.id, width: widths[p.id], minWidth: p.minWidth, maxWidth: p.maxWidth }));
};

const rowOf = (panes: PaneView[]) => panes.map((p) => paneElement(p.id)?.parentElement).find(Boolean);

/** The room left empty at the end of the panes' row. */
export const emptyRoom = (panes: PaneView[]) => {
  const row = rowOf(panes);
  if (!row) return 0;
  const end = Math.max(...[...row.children].map((el) => el.getBoundingClientRect().right));
  return Math.max(row.getBoundingClientRect().right - end, 0);
};

/** How wide a collapsed pane is: its bar. */
const barWidth = (panes: PaneView[]) => {
  const collapsed = panes.find((p) => !p.hidden && p.collapsed);
  const el = collapsed ? paneElement(collapsed.id) : paneElement(panes.find((p) => !p.hidden)?.id ?? "")?.firstElementChild;
  return el?.getBoundingClientRect().width ?? 23;
};

/** All: the room of the row shared out among the panes whose bars are on the page (see shareRow). */
function sharedWidths(panes: PaneView[]) {
  const shown = panes.filter((p) => !p.hidden);
  const row = rowOf(panes);
  if (!row) return { widths: {}, collapse: [] };
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const room = row.clientWidth - gap * Math.max(shown.length - 1, 0);
  return shareRow(
    shown.map((p) => ({ id: p.id, width: p.width, minWidth: p.minWidth, maxWidth: p.maxWidth })),
    room,
    barWidth(panes),
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
  remember(paneDocKey, JSON.stringify(paneActions.show(parseDoc(localStorage.getItem(paneDocKey)), id)));

/** The panes on the page and what can be done to them; for the panes themselves, the View menu and the phone's row. */
export function usePanes() {
  const { panes, narrow, showing, update } = useContext(StripContext);
  const ids = panes.map((p) => p.id);
  // a toggle keeps every open pane at the width it has (a pane the row had
  // squeezed stays as it was), so the toggle only shifts the others; on a
  // phone the widths are the screen's and aren't kept
  const frozen = (doc: PaneDoc) => (narrow ? doc : paneActions.setWidths(doc, renderedWidths(panes)));
  return {
    panes,
    narrow,
    showing,
    setHidden: (id: string, hidden: boolean) => update((d) => paneActions.setHidden(d, id, hidden)),
    /** Opening makes room as a drag would: the empty room first, then the others shrink to their min, then close from the right (see fitOpening). */
    setCollapsed: (id: string, collapsed: boolean) => {
      const pane = panes.find((p) => p.id === id);
      if (collapsed || narrow || !pane) return update((d) => paneActions.setCollapsed(frozen(d), id, collapsed));
      const bar = barWidth(panes);
      const opening = sized(panes.map((p) => (p.id === id ? { ...p, collapsed: false } : p)));
      const self = opening.find((p) => p.id === id);
      if (self) self.width = Math.max(pane.width, pane.minWidth);
      const { widths, collapse } = fitOpening(opening, id, (self?.width ?? pane.width) - bar, emptyRoom(panes), bar);
      update((d) =>
        paneActions.setCollapsed(
          collapse.reduce((doc, other) => paneActions.setCollapsed(doc, other, true), paneActions.setWidths(d, widths)),
          id,
          false,
        ),
      );
    },
    /** The narrowest and widest the pane may be made. */
    setLimits: (id: string, limits: { min?: number; max?: number }) => update((d) => paneActions.setLimits(d, id, limits)),
    /** This pane open, the rest collapsed: on a phone, the one showing. */
    jumpTo: (id: string) => update((d) => paneActions.jumpTo(frozen(d), ids, id)),
    setAllCollapsed: (collapsed: boolean) => update((d) => paneActions.setAllCollapsed(frozen(d), ids, collapsed)),
    /** Every pane on the page open, the room shared out among them. */
    openAll: () => {
      const { widths, collapse } = sharedWidths(panes);
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
