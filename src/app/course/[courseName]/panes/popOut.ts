"use client";
import { useRouterState } from "@tanstack/react-router";

/**
 * A pane in its own window (teichert#74). The window's url is the course's
 * or item's url plus `?pane=<id>`, which the course route keeps across
 * navigations; bookmarked, it opens the one view for that item, tied to
 * nothing. Opened from a full instance, the window is named after that
 * instance, so it follows it: when the instance goes to another item, the
 * pop-out goes there too, over a BroadcastChannel named after the
 * instance's id. Only two things are kept, both in the tab: a full
 * instance's id (session storage) and a pop-out's tie (its window name).
 */
const instanceKey = "instance";
const namePrefix = "canvas-management-popout:";
const channel = (id: string) => new BroadcastChannel(`canvas-management-instance-${id}`);

/** This tab's id as a full instance, made on first use. */
export function instanceId(): string {
  let id = sessionStorage.getItem(instanceKey);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(instanceKey, id);
  }
  return id;
}

/** The url that opens `pane` in its own window for what `pathname` shows (untied; a bookmark). */
export const popOutUrl = (pathname: string, pane: string) => `${pathname}?pane=${pane}`;

/** Opens `pane` in its own tab (or window), tied to this instance (from a pop-out: to the one it follows); the same pane again reuses it. */
export const openPopOut = (pathname: string, pane: string, newWindow = false) => {
  window.open(popOutUrl(pathname, pane), `${namePrefix}${tiedTo() ?? instanceId()}:${pane}`, newWindow ? "popup" : undefined);
};

/** The instance this pop-out follows, if it was opened from one. */
export const tiedTo = () =>
  window.name.startsWith(namePrefix) ? window.name.slice(namePrefix.length).split(":")[0] : undefined;

/** The pop-out becomes a full instance of its own: untied, with a fresh id. */
export function leavePopOut() {
  window.name = "";
  sessionStorage.removeItem(instanceKey);
  own?.close();
  own = undefined;
}

// the instance's own channel, kept open: a message posted on a channel
// that's closed right after may never arrive
let own: BroadcastChannel | undefined;

/** A full instance tells the pop-outs tied to it where it went. */
export function announcePath(pathname: string) {
  own ??= channel(instanceId());
  own.postMessage(pathname);
}

/** A full instance goes where a pop-out tied to it went on its own (a link clicked there); returns the way to stop. */
export function followPopOuts(onPath: (pathname: string) => void) {
  own ??= channel(instanceId());
  own.onmessage = (e) => {
    if (typeof e.data === "object" && e.data?.from === "popOut") onPath(String(e.data.path));
  };
  return () => {
    if (own) own.onmessage = null;
  };
}

// a pop-out's channel to its instance, kept open like the instance's own (see above)
let toInstance: BroadcastChannel | undefined;

/** A pop-out tells the instance it's tied to where it went on its own. */
export function tellInstance(id: string, pathname: string) {
  toInstance ??= channel(id);
  toInstance.postMessage({ from: "popOut", path: pathname });
}

/** A pop-out follows the instance it's tied to (a path, not a pop-out's message); returns the way to stop. */
export function followPaths(id: string, onPath: (pathname: string) => void) {
  const c = channel(id);
  c.onmessage = (e) => {
    if (typeof e.data === "string") onPath(e.data);
  };
  return () => c.close();
}

/** Which pane this window is the pop-out of, if any: the url says. */
export const usePopOutPane = () =>
  useRouterState({ select: (s) => (s.location.search as { pane?: string }).pane });
