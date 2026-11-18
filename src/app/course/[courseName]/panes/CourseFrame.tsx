"use client";
import { ReactNode, useMemo } from "react";
import { useMatches, useRouter, useRouterState } from "@tanstack/react-router";
import { ViewIcons } from "@/components/panes/ViewIcons";
import { openPopOut, popOutUrl } from "./popOut";
import { Pane } from "@/components/panes/Pane";
import { EdgeBar } from "@/components/panes/EdgeBar";
import { PaneStrip, usePanes, usePinned } from "@/components/panes/PaneStrip";
import { PaneSelect } from "@/components/panes/PaneSelect";
import { viewOf } from "@/components/panes/paneStore";
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
  const { added } = usePanes();
  // the catalogue's pane of each view, then the copies added (see paneActions.add), each with its view's spec
  const panes = [
    ...coursePanes,
    ...added.flatMap((id) => {
      const view = coursePanes.find((p) => p.id === viewOf(id));
      return view ? [{ ...view, id }] : [];
    }),
  ];
  const views = coursePanes.map(({ id, label, icon }) => ({ id, label, icon }));
  const popOut = usePopOutPane();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // the same object while nothing changed, so memoized pane contents are skipped
  const ctx: PaneContext = useMemo(() => ({ courseName, item, onCoursePage }), [courseName, item, onCoursePage]);
  if (popOut) {
    const pane = coursePanes.find((p) => p.id === viewOf(popOut));
    return (
      <>
        <FollowNavigation />
        <ItemEditing item={item} />
        <div className="h-full flex flex-col px-1 w-full bg-gray-900 rounded">
          <div className="py-1 flex flex-row flex-nowrap items-center gap-x-2">
            {/* the view this window shows, or with Ctrl or Shift another window of a view, following the same page */}
            <ViewIcons
              views={views}
              current={viewOf(popOut)}
              stack={false}
              hint="show it in this window. Ctrl or Shift: in another window following the same page"
              hrefOf={(view) => popOutUrl(pathname, view)}
              onView={(view, e) =>
                e.ctrlKey || e.metaKey || e.shiftKey
                  ? openPopOut(pathname, view, e.shiftKey)
                  : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    router.navigate({ to: pathname as any, search: { pane: view } as any })
              }
              menuSide="below"
            />
            <BreadCrumbs term={settings?.startDate ? getTermName(settings.startDate) : undefined} popOut />
            <TopBar onCoursePage={onCoursePage} />
          </div>
          <div className="min-h-0 flex-1 flex flex-col overflow-y-auto">
            {pane ? <pane.Content {...ctx} /> : <PaneNote>There is no pane called {popOut}.</PaneNote>}
          </div>
          <BottomBar />
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
          <BreadCrumbs term={settings?.startDate ? getTermName(settings.startDate) : undefined} />
          <TopBar onCoursePage={onCoursePage} />
        </div>
        <PaneSelect views={views} />
        {/* narrow: one grid cell every pane shares, the selected one visible */}
        <div className="min-h-0 flex-1 md:flex md:flex-row md:gap-0.5 max-md:grid">
          <EdgeBar end="start" views={views} />
          <LeadSpacer />
          {panes.map(({ Content, ...pane }) => (
            // the server renders what the first screen shows: the course page's calendar
            <Pane key={pane.id} {...pane} views={views} ssr={pane.id === "calendar" && onCoursePage}>
              <Content {...ctx} />
            </Pane>
          ))}
          <EdgeBar end="end" views={views} />
        </div>
        <BottomBar />
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

/** The open item's footer; on the course page, that is the lecture of the day the editor shows. */
function BottomBar() {
  const parts = useItemParts();
  return parts?.bottomBar;
}

/** The frame with the pane strip around it, for the course route; a pop-out's links to a view switch the pop-out's view, and it never writes the layout. */
export function CourseFrameWithPanes({ children }: { children: ReactNode }) {
  const popOut = usePopOutPane();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <PaneStrip onShowPane={popOut ? (view) => router.navigate({ to: pathname as any, search: { pane: view } as any }) : undefined}>
      <CourseFrame>{children}</CourseFrame>
    </PaneStrip>
  );
}
