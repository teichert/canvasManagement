"use client";
import { useEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { showPane, usePanes } from "@/components/panes/PaneStrip";
import { isShown, viewOf } from "@/components/panes/paneStore";
import { currentItemFromPath } from "../currentItem";
import { announcePath, followPaths, followPopOuts, tellInstance, tiedTo, usePopOutPane } from "./popOut";

/**
 * What going to another url does to the panes. On a phone, an item opens
 * into its editor and the course into its calendar, whatever was showing
 * before. On a wide window, a link to the course shows its calendar, as the
 * course page always did; the first load keeps the remembered choices. A
 * full instance also tells its pop-outs where it went, and goes where a
 * pop-out went on its own (a link clicked there); a pop-out (see popOut)
 * follows its instance and does nothing to the panes.
 */
export function FollowNavigation() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const popOut = usePopOutPane();
  const { narrow, panes, jumpTo, setCollapsed, addPane } = usePanes();
  const onItem = !!currentItemFromPath(pathname);
  // a pop-out follows the instance it's tied to (its ?pane stays, the route keeps it), and
  // tells it where a link took the pop-out itself; a full instance announces where it goes
  // and goes where its pop-outs went
  const followed = useRef<string>(undefined);
  useEffect(() => {
    if (!popOut) {
      announcePath(pathname);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return followPopOuts((path) => router.navigate({ to: path as any }));
    }
    const id = tiedTo();
    if (!id) return;
    if (followed.current !== pathname) tellInstance(id, pathname);
    // the path is whatever the instance went to, so the router can't type it
    return followPaths(id, (path) => {
      followed.current = path;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.navigate({ to: path as any });
    });
  }, [popOut, pathname, router]);
  // the path acted on, on a phone: the first run is during hydration, when
  // the window still counts as wide, so it's acted on once the phone layout is known
  const actedOn = useRef<string>(undefined);
  const previous = useRef<string>(undefined);
  useEffect(() => {
    if (popOut) return;
    if (narrow) {
      if (pathname !== actedOn.current) jumpTo(onItem ? "editor" : "calendar");
      actedOn.current = pathname;
    } else if (previous.current && previous.current !== pathname) {
      // going to an item (within the app: a page loaded or reloaded keeps the panes as they
      // were) shows it, as the item page of old did: an Editor or Preview already open is
      // enough; one of them alone on the page but collapsed is expanded; otherwise (both
      // collapsed, or neither on the page) both are added at the end of the row. Back to
      // the course page: the calendar.
      if (onItem) {
        const itemPanes = panes.filter((p) => ["editor", "preview"].includes(viewOf(p.id)) && !p.hidden);
        if (itemPanes.some(isShown)) {
          // enough
        } else if (itemPanes.length === 1) setCollapsed(itemPanes[0].id, false);
        else {
          addPane("editor");
          addPane("preview");
        }
      } else showPane("calendar");
    }
    previous.current = pathname;
    // the actions are fresh each render; the path and the layout are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, narrow, popOut]);
  return null;
}
