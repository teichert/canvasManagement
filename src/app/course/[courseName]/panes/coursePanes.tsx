"use client";
import { ComponentType, memo, ReactNode, useEffect } from "react";
import { CurrentItem } from "../currentItem";
import { useItemParts } from "./itemParts";
import { editorShows, jumpToClickedText } from "@/components/editor/previewJump";
import ClientOnly from "@/components/ClientOnly";
import { SuspenseAndErrorHandling } from "@/components/SuspenseAndErrorHandling";
import HomeIcon from "@/components/icons/HomeIcon";
import {
  CalendarIcon,
  CompareIcon,
  EditIcon,
  HelpIcon,
  HistoryIcon,
  ImportIcon,
  ModulesIcon,
  PreviewIcon,
  SettingsIcon,
  WarningIcon,
} from "@/components/icons/ActionIcons";
import { ModulesContent } from "../modules/ModulesPane";
import CourseCalendar from "../calendar/CourseCalendar";
import CourseList from "@/app/CourseList";
import TodaysLectures from "@/app/todaysLectures/TodaysLectures";
import Handouts from "@/app/Handouts";
import AllSettings from "../settings/AllSettings";
import ImportFromCanvas from "../import/ImportFromCanvas";
import ErrorLogPage from "@/app/errors/ErrorLogPage";
import { ItemHistory } from "../modules/[moduleName]/history/ItemHistory";
import { CourseHelp } from "@/components/editor/help/CourseHelp";
import {
  CompareAssignmentWithCanvas,
  ComparePageWithCanvas,
  CompareQuizWithCanvas,
} from "../modules/[moduleName]/compare/CompareWithCanvas";

/** What a pane's content can read: the course and the item open (the url's, or the course page's lecture of the day). */
export type PaneContext = {
  courseName: string;
  item?: CurrentItem;
  onCoursePage: boolean;
};

/**
 * One entry per pane of a course, in their default order. The frame
 * renders them; the bars and the phone's row list them; the pane
 * store remembers what the user does with them. To add a pane, add an entry.
 */
export type CoursePane = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Dropped while collapsed, for content that fetches. */
  keepMounted?: boolean;
  /** In px: how wide the pane is until a drag or All sets it; see widthRule. */
  defaultWidth?: number;
  collapsedByDefault?: () => boolean;
  /** Memoized where it's expensive: the frame re-renders on every navigation. */
  Content: ComponentType<PaneContext>;
};

const courseItem = (ctx: PaneContext) => (ctx.item?.kind === "item" ? ctx.item : undefined);
const itemKey = (ctx: PaneContext) => courseItem(ctx) && `${courseItem(ctx)!.moduleName}/${courseItem(ctx)!.name}`;
const notAnItem = <PaneNote>This applies to an assignment, quiz or page; open one.</PaneNote>;

// its own boundary: the course list and today's lectures fetch, and a
// suspension with no boundary in the pane would climb to the route and
// remount the whole frame
const Home = memo(function Home() {
  return (
    <SuspenseAndErrorHandling>
      <div className="pb-6">
        <CourseList isDeleting={false} />
        <TodaysLectures />
        <Handouts />
      </div>
    </SuspenseAndErrorHandling>
  );
});

// keyed so a course picked from the menu starts its own selection, search
// and scroll; re-rendered for a new course only, not for every item change
const sameCourse = (a: PaneContext, b: PaneContext) => a.courseName === b.courseName;
const Calendar = memo(function Calendar({ courseName }: PaneContext) {
  return <CourseCalendar key={courseName} />;
}, sameCourse);
// its own boundary, like Home: it fetches when it mounts, and a suspension
// with no boundary in the pane climbs to the route and remounts the whole frame
const Modules = memo(function Modules({ courseName }: PaneContext) {
  return (
    <SuspenseAndErrorHandling>
      <ModulesContent key={courseName} />
    </SuspenseAndErrorHandling>
  );
}, sameCourse);

/** How narrow a pane may be made unless set otherwise: where the calendar's week grid appears (--container-week in globals.css). */
export const paneMinWidth = 440;

/** A pane with nothing to show here says so instead. */
export function PaneNote({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2 text-sm text-slate-500">{children}</p>;
}

// the item's editor and preview come from its page (see itemParts); their
// own boundary, since a suspension here would climb to the route and remount the frame
function Editor() {
  const parts = useItemParts();
  // which item the editor shows, for clicks in a preview (this window's or another's)
  useEffect(() => editorShows(parts?.key), [parts?.key]);
  if (!parts) return <PaneNote>Open an item to edit it here.</PaneNote>;
  return (
    <SuspenseAndErrorHandling>
      <div key={parts.key} className="h-full">
        {parts.editor}
      </div>
    </SuspenseAndErrorHandling>
  );
}
function Preview() {
  const parts = useItemParts();
  if (!parts) return <PaneNote>Open an item to see it here.</PaneNote>;
  return (
    <SuspenseAndErrorHandling>
      {/* clicking text in the preview moves the editor to it */}
      <div className="h-full" onClick={(e) => jumpToClickedText(e.currentTarget, e.nativeEvent, parts.key)}>
        {parts.preview}
      </div>
    </SuspenseAndErrorHandling>
  );
}

function Compare({ moduleName, type, name }: { moduleName: string; type: string; name: string }) {
  if (type === "Assignment") return <CompareAssignmentWithCanvas moduleName={moduleName} assignmentName={name} />;
  if (type === "Quiz") return <CompareQuizWithCanvas moduleName={moduleName} quizName={name} />;
  return <ComparePageWithCanvas moduleName={moduleName} pageName={name} />;
}

export const coursePanes: CoursePane[] = [
  {
    id: "help",
    defaultWidth: 432,
    label: "Help",
    icon: <HelpIcon />,
    keepMounted: false,
    collapsedByDefault: () => true,
    Content: ({ item }) => (
      <SuspenseAndErrorHandling>
        <CourseHelp item={item} />
      </SuspenseAndErrorHandling>
    ),
  },
  {
    id: "home",
    defaultWidth: 400,
    label: "Home",
    // the size of the other panes' icons (see ActionIcon), so it holds its own in the phone's row
    icon: <HomeIcon className="size-[1.15em] shrink-0" />,
    collapsedByDefault: () => true,
    Content: Home,
  },
  {
    id: "calendar",
    // wide enough for the week grid with the day names spelled out (see --container-names)
    defaultWidth: 800,
    label: "Calendar",
    icon: <CalendarIcon />,
    Content: Calendar,
  },
  {
    id: "modules",
    defaultWidth: 220,
    label: "Modules",
    icon: <ModulesIcon />,
    collapsedByDefault: () => true,
    Content: Modules,
  },
  {
    id: "editor",
    defaultWidth: 300,
    label: "Editor",
    icon: <EditIcon />,
    collapsedByDefault: () => true,
    Content: Editor,
  },
  {
    id: "preview",
    defaultWidth: 260,
    label: "Preview",
    icon: <PreviewIcon />,
    collapsedByDefault: () => true,
    Content: Preview,
  },
  {
    id: "compare",
    defaultWidth: 500,
    label: "Compare with Canvas",
    icon: <CompareIcon />,
    keepMounted: false,
    collapsedByDefault: () => true,
    Content: (ctx) =>
      courseItem(ctx) ? (
        <ClientOnly>
          <SuspenseAndErrorHandling>
            <Compare key={itemKey(ctx)} {...courseItem(ctx)!} />
          </SuspenseAndErrorHandling>
        </ClientOnly>
      ) : (
        notAnItem
      ),
  },
  {
    id: "history",
    defaultWidth: 500,
    label: "File history",
    icon: <HistoryIcon />,
    keepMounted: false,
    collapsedByDefault: () => true,
    Content: (ctx) =>
      courseItem(ctx) ? (
        <ClientOnly>
          <SuspenseAndErrorHandling>
            <ItemHistory key={itemKey(ctx)} {...courseItem(ctx)!} />
          </SuspenseAndErrorHandling>
        </ClientOnly>
      ) : (
        notAnItem
      ),
  },
  {
    id: "import",
    defaultWidth: 700,
    label: "Import",
    icon: <ImportIcon />,
    keepMounted: false,
    collapsedByDefault: () => true,
    Content: memo(function Import() {
      return (
        <SuspenseAndErrorHandling>
          <div className="flex justify-center pt-3">
            <div className="w-full max-w-7xl min-w-0 px-3 pb-12">
              <ImportFromCanvas />
            </div>
          </div>
        </SuspenseAndErrorHandling>
      );
    }),
  },
  {
    id: "errors",
    defaultWidth: 600,
    label: "Errors",
    icon: <WarningIcon />,
    keepMounted: false,
    collapsedByDefault: () => true,
    Content: memo(function Errors() {
      return (
        <SuspenseAndErrorHandling>
          <ClientOnly>
            <ErrorLogPage />
          </ClientOnly>
        </SuspenseAndErrorHandling>
      );
    }),
  },
  {
    id: "settings",
    defaultWidth: 700,
    label: "Settings",
    icon: <SettingsIcon />,
    collapsedByDefault: () => true,
    Content: memo(function Settings() {
      return (
        <SuspenseAndErrorHandling>
          <div className="flex justify-center pt-3">
            <div className="w-full max-w-3xl min-w-0 px-3 pb-12">
              <AllSettings />
            </div>
          </div>
        </SuspenseAndErrorHandling>
      );
    }),
  },
];
