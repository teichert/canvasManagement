"use client";
import { ReactNode, useMemo } from "react";
import { useMatches } from "@tanstack/react-router";
import { Pane } from "@/components/panes/Pane";
import { PaneStrip, usePanes, usePinned } from "@/components/panes/PaneStrip";
import { PanesMenu } from "@/components/panes/PanesMenu";
import { PaneSelect } from "@/components/panes/PaneSelect";
import { FoldedBars, PinButton, topPin } from "@/components/panes/PinnedBars";
import { BreadCrumbs } from "@/components/BreadCrumbs";
import { useCourseContext } from "../context/courseContext";
import { useLocalCourseSettingsQuery } from "@/features/local/course/localCoursesHooks";
import { getTermName } from "@/features/local/utils/timeUtils";
import { CurrentItem, defaultLectureDay, useCurrentItem } from "../currentItem";
import { coursePanes, PaneContext, PaneNote } from "./coursePanes";
import { usePopOutPane } from "./popOut";
import { FollowNavigation } from "./FollowNavigation";
import { ItemEditing } from "./ItemEditing";
import { useItemParts } from "./itemParts";
import { CourseNavigation } from "../CourseNavigation";

/**
 * Mounted once per course, around every page: the top bar (crumbs, then
 * the item's own crumbs and actions, or the course's buttons), a phone's
 * view row, then every pane of the course (see coursePanes) in a row, and
 * the item's bottom bar. Living here and not in the pages, the panes keep
 * their scroll and state from page to page. The frame itself renders the
 * editing of the item open (see ItemEditing): the one the url names, or
 * on the course page the lecture of the day; the routes only match the url
 * and set the title. As a pop-out (see popOut) it shows the crumbs, the
 * item's actions, one pane full-window and the footer: no bars, no layout.
 */
export function CourseFrame({ children }: { children: ReactNode }) {
  const { courseName } = useCourseContext();
  const { data: settings } = useLocalCourseSettingsQuery();
  const urlItem = useCurrentItem();
  const onCoursePage = useMatches().some((m) => m.routeId === "/course/$courseName/");
  const item = useMemo((): CurrentItem | undefined => {
    if (urlItem || !onCoursePage) return urlItem;
    const lectureDay = settings && defaultLectureDay(settings, new Date());
    return lectureDay ? { kind: "lecture", lectureDay } : undefined;
  }, [urlItem, onCoursePage, settings]);
  const [topPinned] = usePinned(topPin);
  const popOut = usePopOutPane();
  // the same object while nothing changed, so memoized pane contents are skipped
  const ctx: PaneContext = useMemo(() => ({ courseName, item, onCoursePage }), [courseName, item, onCoursePage]);
  if (popOut) {
    const pane = coursePanes.find((p) => p.id === popOut);
    return (
      <>
        <FollowNavigation />
        <ItemEditing item={item} />
        <div className="h-full flex flex-col px-1 w-full bg-gray-900 rounded">
          <div className="py-1 flex flex-row flex-nowrap items-center gap-x-2">
            <BreadCrumbs term={settings?.startDate ? getTermName(settings.startDate) : undefined} popOut />
            <TopBar onCoursePage={onCoursePage} />
          </div>
          <div className="min-h-0 flex-1 flex flex-col overflow-y-auto">
            {pane ? <pane.Content {...ctx} /> : <PaneNote>There is no pane called {popOut}.</PaneNote>}
          </div>
          <BottomBar onCoursePage={onCoursePage} />
        </div>
        {children}
      </>
    );
  }
  return (
    <>
      <FollowNavigation />
      <ItemEditing item={item} />
      <div className="h-full flex flex-col px-1 max-w-[2400px] w-full mx-auto bg-gray-900 rounded">
        <FoldedBars />
        <div
          className={
            // one row everywhere: the crumbs and the item's name truncate instead of wrapping
            "py-1 max-md:py-0.5 flex flex-row flex-nowrap items-center gap-x-2 max-md:gap-x-1 " +
            (topPinned ? "" : "max-md:hidden")
          }
        >
          <PinButton pin={topPin} label="the breadcrumbs and view row" className="md:hidden" />
          <span className="hidden md:contents">
            <PanesMenu />
          </span>
          <BreadCrumbs term={settings?.startDate ? getTermName(settings.startDate) : undefined} />
          <TopBar onCoursePage={onCoursePage} />
        </div>
        <PaneSelect />
        {/* narrow: one grid cell every pane shares, the selected one visible */}
        <div className="min-h-0 flex-1 md:flex md:flex-row md:gap-0.5 max-md:grid">
          <LeadSpacer />
          {coursePanes.map(({ Content, ...pane }) => (
            // the server renders what the first screen shows: the course page's calendar
            <Pane key={pane.id} {...pane} ssr={pane.id === "calendar" && onCoursePage}>
              <Content {...ctx} />
            </Pane>
          ))}
        </div>
        <BottomBar onCoursePage={onCoursePage} />
      </div>
      {children}
    </>
  );
}

/** The empty room before the first pane, dragged in from the row's left end. */
function LeadSpacer() {
  const { lead, narrow } = usePanes();
  if (narrow) return null;
  // with no room, it takes back the row's gap after it too, so the panes start where they always did
  return <div data-pane-lead aria-hidden className="flex-none" style={{ order: -1, width: lead, marginRight: lead > 0 ? 0 : "-0.125rem" }} />;
}

/** After the crumbs: the course's buttons on the course page, else the item's crumbs and actions. */
function TopBar({ onCoursePage }: { onCoursePage: boolean }) {
  const parts = useItemParts();
  return onCoursePage ? <CourseNavigation /> : parts?.topBar;
}

function BottomBar({ onCoursePage }: { onCoursePage: boolean }) {
  const parts = useItemParts();
  return onCoursePage ? null : parts?.bottomBar;
}

/** The frame with the pane strip around it, for the course route. */
export function CourseFrameWithPanes({ children }: { children: ReactNode }) {
  return (
    <PaneStrip>
      <CourseFrame>{children}</CourseFrame>
    </PaneStrip>
  );
}
