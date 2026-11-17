"use client";
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { showPane } from "./PaneStrip";
import { usePopOutPane } from "@/app/course/[courseName]/panes/popOut";

/**
 * What an old page url (…/compare, …/history, …/settings) does now: shows
 * the pane and goes to the url of what it was about; in a pop-out, the
 * pop-out shows that view (the layout is the full windows' own).
 */
export function ShowPaneAndGo({ pane, to }: { pane: string; to: string }) {
  const router = useRouter();
  const popOut = usePopOutPane();
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (popOut) return void router.navigate({ to: to as any, search: { pane } as any, replace: true });
    showPane(pane);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.navigate({ to: to as any, replace: true });
  }, [router, to, pane, popOut]);
  return null;
}
