"use client";

import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { leavePopOut } from "@/app/course/[courseName]/panes/popOut";
import HomeIcon from "./icons/HomeIcon";
import { RightSingleChevron } from "./icons/RightSingleChevron";
import { CourseMenu } from "@/app/course/[courseName]/CourseMenu";

/** home › term › course ▾ › …; the term is the course's semester, when known. The home icon goes to the home page (a plain link, so Ctrl and Shift open it in a new window); in a pop-out, a plain click makes this window a full one unless the click asks for a new one. */
export const BreadCrumbs = ({ term, popOut = false }: { term?: string; popOut?: boolean }) => {
  const location = useLocation();
  const router = useRouter();
  const pathname = location.pathname;

  const pathSegments = pathname?.split("/").filter(Boolean) || [];
  const isCourseRoute = pathSegments[0] === "course";

  const courseName =
    isCourseRoute && pathSegments[1]
      ? decodeURIComponent(pathSegments[1])
      : null;

  const isLectureRoute = isCourseRoute && pathSegments[2] === "lecture";
  const lectureDate =
    isLectureRoute && pathSegments[3]
      ? decodeURIComponent(pathSegments[3])
      : null;

  const lectureDateOnly = lectureDate
    ? (() => {
        const dateStr = lectureDate.split(" ")[0];
        const date = new Date(dateStr);
        const month = date.toLocaleDateString("en-US", { month: "short" });
        const day = date.getDate();
        return `${month} ${day}`;
      })()
    : null;

  const lectureUrl =
    courseName && lectureDate
      ? `/course/${encodeURIComponent(courseName)}/lecture/${encodeURIComponent(
          lectureDate
        )}`
      : "";

  const sharedBackgroundClassNames = `
    group 
    hover:bg-blue-900/30 
    rounded-lg 
    h-full 
    flex 
    items-center 
    transition
  `;
  const sharedLinkClassNames = `
    text-slate-300 
    transition 
    group-hover:text-slate-100 
    rounded-lg 
    h-full 
    flex 
    items-center 
    px-3 max-md:px-1
  `;

  return (
    <nav className="flex flex-row font-bold text-sm items-center min-w-0">
      <span className={sharedBackgroundClassNames}>
        <a
          className="flex items-center gap-1 rounded-lg h-full"
          href={popOut ? pathname : "/"}
          aria-label={popOut ? "Open this as a full window" : "Home"}
          title={
            popOut
              ? "This window as a full one, with every pane, no longer following the window it came from (Ctrl or Shift: a new window instead)"
              : "The home page (Ctrl or Shift: in a new window)"
          }
          onClick={(e) => {
            // with Ctrl, Shift or the middle button, the browser opens a new window; a plain click
            // in a regular window goes home, in a pop-out makes it a full window
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!popOut) return void router.navigate({ to: "/" as any });
            leavePopOut();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.navigate({ to: pathname, search: { pane: undefined }, replace: true } as any);
          }}
        >
          <span className={sharedLinkClassNames}>
            <HomeIcon />
          </span>
        </a>
      </span>

      {term && (
        <>
          <span className="text-slate-500 cursor-default select-none">
            <RightSingleChevron />
          </span>
          <span className="px-1 text-slate-500 whitespace-nowrap max-md:text-xs">{term}</span>
        </>
      )}
      {courseName && (
        <>
          <span className="text-slate-500 cursor-default select-none">
            <RightSingleChevron />
          </span>
          <span
            className={
              sharedBackgroundClassNames +
              " min-w-12 overflow-hidden"
            }
          >
            <Link
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              to={`/course/${encodeURIComponent(courseName)}` as any}
              className={sharedLinkClassNames + " min-w-0 pe-1"}
            >
              <span className="truncate">{courseName}</span>
            </Link>
          </span>
          {/* outside the crumb, whose overflow is hidden, so its menu can drop below */}
          <CourseMenu courseName={courseName} />
        </>
      )}

      {isLectureRoute && lectureDate && courseName && (
        <>
          <span className="text-slate-500 cursor-default select-none">
            <RightSingleChevron />
          </span>
          <span className={sharedBackgroundClassNames}>
            <Link
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              to={lectureUrl as any}
              className={sharedLinkClassNames}
            >
              {lectureDateOnly}
            </Link>
          </span>
        </>
      )}
    </nav>
  );
};
