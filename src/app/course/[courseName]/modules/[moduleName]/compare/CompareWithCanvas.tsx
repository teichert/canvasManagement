"use client";
import { FC, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import DOMPurify from "isomorphic-dompurify";
import { CoursePageLayout } from "@/app/course/[courseName]/CoursePageLayout";
import { RightSingleChevron } from "@/components/icons/RightSingleChevron";
import { Spinner } from "@/components/Spinner";
import { useCourseContext } from "@/app/course/[courseName]/context/courseContext";
import { useLocalCourseSettingsQuery } from "@/features/local/course/localCoursesHooks";
import { useAssignmentQuery } from "@/features/local/assignments/assignmentHooks";
import { useQuizQuery } from "@/features/local/quizzes/quizHooks";
import { usePageQuery } from "@/features/local/pages/pageHooks";
import {
  useCanvasPagesQuery,
  useUpdateCanvasPageMutation,
} from "@/features/canvas/hooks/canvasPageHooks";
import {
  useCanvasAssignmentsQuery,
  useUpdateAssignmentInCanvasMutation,
} from "@/features/canvas/hooks/canvasAssignmentHooks";
import {
  useCanvasAttemptQuestionsQuery,
  useCanvasQuizQuestionsQuery,
  useCanvasQuizVersionsTakenQuery,
  useCanvasQuizzesQuery,
  useUpdateQuizInCanvasMutation,
} from "@/features/canvas/hooks/canvasQuizHooks";
import { useCanvasModuleNames } from "@/features/canvas/hooks/canvasModuleHooks";
import { checkQuizQuestions } from "@/app/course/[courseName]/calendar/day/quizQuestionSync";
import { LocalQuiz } from "@/features/local/quizzes/models/localQuiz";
import { LocalCourseSettings } from "@/features/local/course/localCourseSettings";
import {
  useRosterGroupSetsQuery,
  useRosterStudentsQuery,
} from "@/features/canvas/roster/rosterHooks";
import { baseCanvasUrl } from "@/features/canvas/services/canvasServiceUtils";
import {
  getSyncReport,
  SyncField,
  SyncReport,
  SyncSection,
} from "@/app/course/[courseName]/calendar/day/getAssignmentSyncStatus";
import { getCourseUrl, getModuleItemUrl } from "@/services/urlUtils";
import {
  collapseUnchanged,
  diffHtmlText,
  diffNormalizedHtml,
} from "@/services/utils/htmlTextDiff";

const sectionLabels: Record<SyncSection, string> = {
  modules: "Modules",
  dates: "Dates",
  grading: "Grading",
  submission: "Submission",
  groups: "Groups",
  schedule: "Schedule",
  rubric: "Rubric",
  questions: "Questions",
  options: "Quiz options",
  description: "Description",
};

/* ------------------------------------------------------------------ */
/* Per-type wrappers: load the file and Canvas copies, build the report */
/* ------------------------------------------------------------------ */

export function CompareAssignmentWithCanvas({
  moduleName,
  assignmentName,
}: {
  moduleName: string;
  assignmentName: string;
}) {
  const { data: settings } = useLocalCourseSettingsQuery();
  const { data: assignment } = useAssignmentQuery(moduleName, assignmentName);
  const {
    data: canvasAssignments,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useCanvasAssignmentsQuery();
  const { data: canvasQuizzes } = useCanvasQuizzesQuery();
  const { data: rosterStudents } = useRosterStudentsQuery();
  const { data: rosterGroupSets } = useRosterGroupSetsQuery();
  const update = useUpdateAssignmentInCanvasMutation();

  const canvasAssignment = canvasAssignments?.find(
    (a) => a.name === assignmentName,
  );
  const { names: canvasModules, refetch: refetchModules } =
    useCanvasModuleNames("assignment", canvasAssignment);

  // never compare against a stale copy
  useEffect(() => {
    refetch();
    refetchModules();
  }, [refetch, refetchModules]);

  const report = useMemo(
    () =>
      getSyncReport({
        item: assignment,
        canvasItem: canvasAssignment,
        type: "assignment",
        settings,
        canvasLinkTargets: {
          assignments: canvasAssignments,
          quizzes: canvasQuizzes,
        },
        roster: { students: rosterStudents, groupSets: rosterGroupSets },
        module: canvasModules && { file: moduleName, canvas: canvasModules },
      }),
    [
      assignment,
      canvasAssignment,
      canvasAssignments,
      canvasModules,
      canvasQuizzes,
      moduleName,
      rosterGroupSets,
      rosterStudents,
      settings,
    ],
  );

  return (
    <CompareLayout
      type="assignment"
      moduleName={moduleName}
      itemName={assignmentName}
      report={report}
      canvasLoading={canvasAssignments === undefined}
      canvasFetching={isFetching}
      loadedAt={dataUpdatedAt}
      canvasId={canvasAssignment?.id}
      canvasPublished={canvasAssignment?.published}
      canvasUrl={
        canvasAssignment &&
        `${baseCanvasUrl}/courses/${settings.canvasId}/assignments/${canvasAssignment.id}`
      }
      onRefresh={() => {
        refetch();
        refetchModules();
      }}
      onUpdate={() =>
        canvasAssignment &&
        update.mutate({
          assignment,
          canvasAssignmentId: canvasAssignment.id,
          moduleName,
        })
      }
      updating={update.isPending}
      updateNote="Update Canvas pushes the file's dates, group settings, rubric and description, and moves the assignment to the file's module. Submissions and grades are untouched."
    />
  );
}

export function CompareQuizWithCanvas({
  moduleName,
  quizName,
}: {
  moduleName: string;
  quizName: string;
}) {
  const { data: settings } = useLocalCourseSettingsQuery();
  const { data: quiz } = useQuizQuery(moduleName, quizName);
  const {
    data: canvasQuizzes,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useCanvasQuizzesQuery();
  const { data: canvasAssignments } = useCanvasAssignmentsQuery();
  const update = useUpdateQuizInCanvasMutation();

  const canvasQuiz = canvasQuizzes?.find((q) => q.title === quizName);
  const { names: canvasModules, refetch: refetchModules } =
    useCanvasModuleNames("quiz", canvasQuiz);

  useEffect(() => {
    refetch();
    refetchModules();
  }, [refetch, refetchModules]);

  const {
    data: canvasQuestions,
    isFetching: questionsFetching,
    refetch: refetchQuestions,
    dataUpdatedAt: questionsUpdatedAt,
  } = useCanvasQuizQuestionsQuery(canvasQuiz?.id);
  const { data: versions, refetch: refetchVersions } =
    useCanvasQuizVersionsTakenQuery(canvasQuiz?.id);
  const report = useMemo(
    () =>
      getSyncReport({
        item: quiz,
        canvasItem: canvasQuiz,
        type: "quiz",
        settings,
        canvasLinkTargets: {
          assignments: canvasAssignments,
          quizzes: canvasQuizzes,
        },
        canvasQuestions,
        module: canvasModules && { file: moduleName, canvas: canvasModules },
      }),
    [
      canvasAssignments,
      canvasModules,
      canvasQuestions,
      canvasQuiz,
      canvasQuizzes,
      moduleName,
      quiz,
      settings,
    ],
  );

  return (
    <CompareLayout
      type="quiz"
      moduleName={moduleName}
      itemName={quizName}
      report={report}
      canvasLoading={
        canvasQuizzes === undefined ||
        (canvasQuiz !== undefined && canvasQuestions === undefined)
      }
      canvasFetching={isFetching || questionsFetching}
      loadedAt={Math.min(dataUpdatedAt, questionsUpdatedAt || dataUpdatedAt)}
      canvasId={canvasQuiz?.id}
      canvasPublished={canvasQuiz?.published}
      canvasUrl={
        canvasQuiz &&
        `${baseCanvasUrl}/courses/${settings.canvasId}/quizzes/${canvasQuiz.id}`
      }
      onRefresh={() => {
        refetch();
        refetchModules();
        if (canvasQuiz) {
          refetchQuestions();
          refetchVersions();
        }
      }}
      onUpdate={() =>
        canvasQuiz &&
        update.mutate({ quiz, canvasQuizId: canvasQuiz.id, moduleName })
      }
      updating={update.isPending}
      updateNote="Update Canvas pushes the file's settings, moves the quiz to the file's module and replaces the questions that differ from the file's, leaving the rest alone. When it changes questions on a published quiz, students keep getting the old ones until you click Save it now on the quiz page in Canvas (the API can't do that). If students have started, it warns first: they keep the questions they got and are not regraded. It refuses to change the point total they were scored out of."
    >
      {versions?.map((v, i) => (
        <VersionSection
          key={v.version}
          version={v}
          latest={i === 0}
          quiz={quiz}
          settings={settings}
        />
      ))}
    </CompareLayout>
  );
}

export function ComparePageWithCanvas({
  moduleName,
  pageName,
}: {
  moduleName: string;
  pageName: string;
}) {
  const { data: settings } = useLocalCourseSettingsQuery();
  const { data: page } = usePageQuery(moduleName, pageName);
  const {
    data: canvasPages,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useCanvasPagesQuery();
  const { data: canvasAssignments } = useCanvasAssignmentsQuery();
  const { data: canvasQuizzes } = useCanvasQuizzesQuery();
  const update = useUpdateCanvasPageMutation();

  const canvasPage = canvasPages?.find((p) => p.title === pageName);
  const { names: canvasModules, refetch: refetchModules } =
    useCanvasModuleNames("page", canvasPage);

  useEffect(() => {
    refetch();
    refetchModules();
  }, [refetch, refetchModules]);

  const report = useMemo(
    () =>
      getSyncReport({
        item: page,
        canvasItem: canvasPage,
        type: "page",
        settings,
        canvasLinkTargets: {
          assignments: canvasAssignments,
          quizzes: canvasQuizzes,
        },
        module: canvasModules && { file: moduleName, canvas: canvasModules },
      }),
    [
      canvasAssignments,
      canvasModules,
      canvasPage,
      canvasQuizzes,
      moduleName,
      page,
      settings,
    ],
  );

  return (
    <CompareLayout
      type="page"
      moduleName={moduleName}
      itemName={pageName}
      report={report}
      canvasLoading={canvasPages === undefined}
      canvasFetching={isFetching}
      loadedAt={dataUpdatedAt}
      canvasId={canvasPage?.page_id}
      canvasUrl={
        canvasPage &&
        `${baseCanvasUrl}/courses/${settings.canvasId}/pages/${canvasPage.url}`
      }
      onRefresh={() => {
        refetch();
        refetchModules();
      }}
      onUpdate={() =>
        canvasPage &&
        update.mutate({ page, canvasPage, moduleName })
      }
      updating={update.isPending}
      updateNote="Update in Canvas replaces the page's content with the file's and moves the page to the file's module."
    />
  );
}

/**
 * The file against the questions students got on one quiz version, read
 * from one attempt. Canvas's current questions can differ from these until
 * "Save it now", and the API has no "unsaved changes" flag, so this is the
 * only way to see what students actually got.
 */
const VersionSection: FC<{
  version: { version: number; attempts: number; attemptId: number };
  latest: boolean;
  quiz: LocalQuiz;
  settings: LocalCourseSettings;
}> = ({ version, latest, quiz, settings }) => {
  const { data: questions } = useCanvasAttemptQuestionsQuery(version.attemptId);
  const fields = useMemo(
    () =>
      questions &&
      checkQuizQuestions(quiz.questions, questions, settings, {
        ignoreAnswerOrder: true,
        isAttempt: true,
      }),
    [questions, quiz.questions, settings],
  );
  const differing = fields?.filter((f) => !f.same).length ?? 0;
  const title = `What students got · version ${version.version}${latest ? " (latest)" : ""} · ${version.attempts} attempt${version.attempts === 1 ? "" : "s"}${fields ? ` · ${differing === 0 ? "matches the file" : `${differing} question${differing === 1 ? "" : "s"} differ`}` : ""}`;
  return fields ? (
    <FieldsTable fields={fields} title={title} canvasLabel="students got" />
  ) : (
    <div className="pb-6 text-sm text-slate-400">
      {title} <Spinner />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Shared page                                                          */
/* ------------------------------------------------------------------ */

const CompareLayout: FC<{
  type: "assignment" | "page" | "quiz";
  moduleName: string;
  itemName: string;
  report: SyncReport;
  canvasLoading: boolean;
  canvasFetching: boolean;
  /** When the Canvas copy shown was read (ms since epoch). */
  loadedAt: number;
  canvasId?: number;
  canvasPublished?: boolean;
  canvasUrl?: string;
  onRefresh: () => void;
  onUpdate: () => void;
  updating: boolean;
  updateNote: string;
  /** Extra sections after the settings and questions, such as what students got. */
  children?: ReactNode;
}> = ({
  type,
  moduleName,
  itemName,
  report,
  canvasLoading,
  canvasFetching,
  loadedAt,
  canvasId,
  canvasPublished,
  canvasUrl,
  onRefresh,
  onUpdate,
  updating,
  updateNote,
  children,
}) => {
  const { courseName } = useCourseContext();
  const router = useRouter();
  const editUrl = getModuleItemUrl(courseName, moduleName, type, itemName);
  const inCanvas = report.status !== "localOnly";
  const differenceCount = report.differences.length;

  return (
    <CoursePageLayout
      topBar={
        <div className="min-w-0 flex-auto flex flex-row items-center">
          <Chevron />
          <Link to={editUrl} className="truncate text-slate-300 hover:text-slate-100 px-2 text-sm font-bold">
            {itemName}
          </Link>
          <Chevron />
          <span className="px-2 text-sm font-bold text-slate-100 whitespace-nowrap">
            Compare with Canvas
          </span>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3 sm:px-5">
        <div className="flex flex-row flex-wrap justify-between items-end gap-3 pt-3 pb-4">
          <div className="min-w-0">
            <h2 className="truncate">{itemName}</h2>
            <div className="text-sm text-slate-400 flex flex-row flex-wrap items-center gap-x-3">
              {canvasLoading ? (
                <span>loading Canvas…</span>
              ) : inCanvas ? (
                <span>
                  Canvas {type} {canvasId}
                  {!canvasPublished && " · not published"}
                </span>
              ) : (
                <span>not in Canvas yet</span>
              )}
              {loadedAt > 0 && (
                <span>read from Canvas at {new Date(loadedAt).toLocaleTimeString()}</span>
              )}
              <button
                className="unstyled text-blue-300 hover:underline disabled:opacity-50"
                onClick={onRefresh}
                disabled={canvasFetching}
              >
                {canvasFetching ? "refreshing…" : "refresh"}
              </button>
              {canvasFetching && <Spinner />}
            </div>
          </div>
          <StatusPill report={report} canvasLoading={canvasLoading} />
        </div>

        {inCanvas && (
          <>
            <FieldsTable fields={report.fields} />
            {children}
            {report.description && (
              <DescriptionDiff
                localHtml={report.description.localHtml}
                canvasHtml={report.description.canvasHtml}
                same={report.description.same}
              />
            )}
          </>
        )}
        {!inCanvas && !canvasLoading && (
          <div className="py-10 text-center text-slate-400">
            This {type} hasn't been added to Canvas, so there is nothing to
            compare. Add it from the{" "}
            <Link to={editUrl} className="text-blue-300 hover:underline">
              editor
            </Link>
            .
          </div>
        )}
        <div className="h-6" />
      </div>

      <div className="flex-none sticky bottom-0 border-t border-slate-700 bg-gray-900/95 backdrop-blur px-3 sm:px-5 py-3 flex flex-row flex-wrap justify-between items-center gap-3">
        <div className="text-sm text-slate-400 max-w-prose">{updateNote}</div>
        <div className="flex flex-row flex-wrap gap-3 justify-end items-center">
          {updating && <Spinner />}
          <button
            className="btn-outline"
            onClick={() => {
              if (window.history.length > 1) router.history.back();
              else router.navigate({ to: getCourseUrl(courseName) });
            }}
          >
            Back
          </button>
          {canvasUrl && (
            <a className="btn" href={canvasUrl} target="_blank" rel="noreferrer">
              Open in Canvas ↗
            </a>
          )}
          <Link className="btn" to={editUrl}>
            Edit file
          </Link>
          <button
            disabled={!inCanvas || updating || differenceCount === 0}
            title={
              differenceCount === 0 && inCanvas
                ? "Canvas already matches the file"
                : undefined
            }
            onClick={onUpdate}
          >
            Update Canvas
          </button>
        </div>
      </div>
    </CoursePageLayout>
  );
};

const Chevron = () => (
  <span className="text-slate-500 cursor-default select-none my-auto">
    <RightSingleChevron />
  </span>
);

const StatusPill: FC<{ report: SyncReport; canvasLoading: boolean }> = ({
  report,
  canvasLoading,
}) => {
  if (canvasLoading)
    return <Pill className="text-slate-300 border-slate-600">checking…</Pill>;
  if (report.status === "localOnly")
    return <Pill className="text-slate-300 border-slate-600">not in Canvas</Pill>;
  const n = report.differences.length;
  if (n === 0)
    return (
      <Pill className="text-green-300 border-green-800 bg-green-900/30">
        <Dot className="bg-green-500" /> in sync
      </Pill>
    );
  return (
    <Pill className="text-rose-300 border-rose-900 bg-rose-900/30">
      <Dot className="bg-rose-500" /> {n} difference{n === 1 ? "" : "s"}
    </Pill>
  );
};

const Pill: FC<{ className: string; children: ReactNode }> = ({
  className,
  children,
}) => (
  <span
    className={
      "inline-flex items-center gap-2 px-3 py-0.5 rounded-full border text-sm font-semibold whitespace-nowrap " +
      className
    }
  >
    {children}
  </span>
);

const Dot: FC<{ className: string }> = ({ className }) => (
  <span className={"inline-block w-2 h-2 rounded-full " + className} />
);

/* ------------------------------------------------------------------ */
/* Settings table                                                       */
/* ------------------------------------------------------------------ */

const FieldsTable: FC<{
  fields: SyncField[];
  title?: ReactNode;
  /** What the right-hand column is, e.g. what students got. */
  canvasLabel?: string;
}> = ({ fields, title, canvasLabel = "Canvas now" }) => {
  const rows = fields.filter((f) => f.section !== "description");
  return (
    <section className="pb-6">
      <div className="flex flex-row flex-wrap justify-between items-baseline gap-3 pb-2">
        <h3 className="text-sm uppercase tracking-wider text-slate-400 font-semibold">
          {title ??
            (rows.some((f) => f.section === "questions")
              ? "Settings and questions"
              : "Settings")}
        </h3>
        <Legend canvasLabel={canvasLabel} />
      </div>
      <div className="overflow-x-auto">
        {/* fixed layout: with auto layout one long rubric label decided the
            first column's width and pushed File and Canvas off the page. The
            ! overrides the global table rule meant for markdown tables. */}
        <table className="!table !w-full table-fixed text-sm border-0 [&_td]:border-0 [&_th]:border-0">
          <colgroup>
            <col className="w-1/3 md:w-1/4" />
            <col />
            <col className="w-8" />
            <col />
            <col className="w-8" />
          </colgroup>
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-400">
              <th className="text-start font-medium">Setting</th>
              <th className="text-start font-medium">File</th>
              <th></th>
              <th className="text-start font-medium">{canvasLabel}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => {
              const newSection = i === 0 || rows[i - 1].section !== f.section;
              return (
                <tr
                  key={f.key}
                  className={
                    (newSection ? "border-t border-slate-700 " : "") +
                    (f.same ? "text-slate-500" : "text-slate-200")
                  }
                >
                  <td className="align-top break-words">
                    <span className={f.same ? "" : "font-medium"}>{f.label}</span>
                    {newSection && (
                      <span className="block text-[10px] uppercase tracking-wider text-slate-600">
                        {sectionLabels[f.section]}
                      </span>
                    )}
                  </td>
                  <td className="align-top">
                    <Cell field={f} side="local" />
                  </td>
                  <td className="text-center text-slate-600 align-top w-8">
                    {f.same ? "" : "→"}
                  </td>
                  <td className="align-top">
                    <Cell field={f} side="canvas" />
                  </td>
                  <td className="text-end align-top w-8">
                    <Dot className={f.same ? "bg-green-600" : "bg-rose-500"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

// every question shows in full, answers included; "≠ " marks what differs
const Cell: FC<{ field: SyncField; side: "local" | "canvas" }> = ({
  field,
  side,
}) => (
  <Value
    text={field[side]}
    tone={field.same ? undefined : side === "local" ? "file" : "canvas"}
  />
);

const Value: FC<{ text: string; tone?: "file" | "canvas" }> = ({ text, tone }) => (
  <span
    className={
      "font-mono text-xs px-1.5 py-0.5 rounded whitespace-pre-line [overflow-wrap:anywhere] [box-decoration-break:clone] " +
      (tone === "file"
        ? "bg-green-900/40 text-green-300"
        : tone === "canvas"
          ? "bg-rose-900/40 text-rose-300"
          : "")
    }
  >
    {text}
  </span>
);

const Legend: FC<{ canvasLabel: string }> = ({ canvasLabel }) => (
  <div className="flex gap-4 text-xs text-slate-400">
    <span>
      <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-900/60 border border-green-800 me-1.5 align-[-1px]" />
      your file
    </span>
    <span>
      <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-900/60 border border-rose-900 me-1.5 align-[-1px]" />
      {canvasLabel}
    </span>
  </div>
);

/* ------------------------------------------------------------------ */
/* Description                                                          */
/* ------------------------------------------------------------------ */

type DescriptionView = "side" | "changes" | "html";

const DescriptionDiff: FC<{
  localHtml: string;
  canvasHtml: string;
  same: boolean;
}> = ({ localHtml, canvasHtml, same }) => {
  const [view, setView] = useState<DescriptionView>(same ? "side" : "changes");
  const safeCanvasHtml = useMemo(
    () => DOMPurify.sanitize(canvasHtml),
    [canvasHtml],
  );
  const textLines = useMemo(
    () => collapseUnchanged(diffHtmlText(localHtml, canvasHtml)),
    [localHtml, canvasHtml],
  );
  const htmlLines = useMemo(
    () => diffNormalizedHtml(localHtml, canvasHtml),
    [localHtml, canvasHtml],
  );
  const textChanged = textLines.some((l) => "kind" in l && l.kind === "changed");

  const tab = (id: DescriptionView, label: string) => (
    <button
      role="tab"
      aria-selected={view === id}
      className={
        "unstyled px-3 py-1 text-xs border-r border-slate-700 last:border-r-0 " +
        (view === id
          ? "bg-slate-800 text-slate-100 font-semibold"
          : "bg-transparent text-slate-400 hover:text-slate-200")
      }
      onClick={() => setView(id)}
    >
      {label}
    </button>
  );

  return (
    <section className="pb-6">
      <div className="flex flex-row flex-wrap justify-between items-center gap-3 pb-2">
        <h3 className="text-sm uppercase tracking-wider text-slate-400 font-semibold">
          Description
          <span
            className={
              "ms-3 normal-case tracking-normal font-normal " +
              (same ? "text-green-400" : "text-rose-300")
            }
          >
            {same ? "matches" : "differs"}
          </span>
        </h3>
        <div
          role="tablist"
          className="inline-flex rounded border border-slate-700 overflow-hidden"
        >
          {tab("side", "Side by side")}
          {tab("changes", "Changes only")}
          {tab("html", "HTML")}
        </div>
      </div>

      {view === "side" && (
        <div className="grid md:grid-cols-2 gap-3">
          <Panel title="File" subtitle="rendered from markdown" tone="file">
            <div
              className="markdownPreview p-3 text-sm"
              dangerouslySetInnerHTML={{ __html: localHtml }}
            />
          </Panel>
          <Panel title="Canvas" subtitle="current description" tone="canvas">
            <div
              className="markdownPreview p-3 text-sm"
              dangerouslySetInnerHTML={{ __html: safeCanvasHtml }}
            />
          </Panel>
        </div>
      )}

      {view === "changes" && (
        <div className="rounded border border-slate-700 bg-slate-800 p-3 text-sm leading-relaxed">
          {!textChanged && (
            <div className="text-slate-400">
              The visible text is the same on both sides.
              {!same &&
                " The difference is in the markup — see the HTML view."}
            </div>
          )}
          {textChanged &&
            textLines.map((line, i) =>
            "skipped" in line ? (
              <div
                key={i}
                className="text-center text-xs text-slate-500 font-mono my-1"
              >
                ··· {line.skipped} unchanged line{line.skipped === 1 ? "" : "s"} ···
              </div>
            ) : (
              <p
                key={i}
                className={
                  "my-1 " + (line.kind === "same" ? "text-slate-500" : "")
                }
              >
                {line.parts.map((p, j) =>
                  p.added ? (
                    <mark
                      key={j}
                      className="bg-green-900/50 text-green-200 rounded-sm px-0.5"
                    >
                      {p.value}
                    </mark>
                  ) : p.removed ? (
                    <mark
                      key={j}
                      className="bg-rose-900/50 text-rose-200 rounded-sm px-0.5 line-through decoration-rose-400/60"
                    >
                      {p.value}
                    </mark>
                  ) : (
                    <span key={j}>{p.value}</span>
                  ),
                )}
              </p>
            ),
          )}
        </div>
      )}

      {view === "html" && (
        <div>
          <pre className="rounded border border-slate-700 bg-gray-950 p-3 text-xs leading-relaxed overflow-x-auto font-mono">
            {htmlLines.map((l, i) => (
              <div
                key={i}
                className={
                  l.added
                    ? "bg-green-900/40 text-green-200"
                    : l.removed
                      ? "bg-rose-900/40 text-rose-200"
                      : "text-slate-400"
                }
              >
                <span className="inline-block w-4 text-slate-600 select-none">
                  {l.added ? "+" : l.removed ? "-" : " "}
                </span>
                {l.value}
              </div>
            ))}
          </pre>
          <div className="text-xs text-slate-500 pt-2 max-w-prose">
            Both sides with attributes other than href, scripts and whitespace
            between tags removed, which is roughly what the calendar's sync check
            compares. Green lines are in the file, rose lines only in Canvas. If
            the page says the description differs but nothing is highlighted
            here, the check is stricter than this view and the difference is in
            entities or attribute-free text.
          </div>
        </div>
      )}
    </section>
  );
};

const Panel: FC<{
  title: string;
  subtitle: string;
  tone: "file" | "canvas";
  children: ReactNode;
}> = ({ title, subtitle, tone, children }) => (
  <div className="rounded border border-slate-700 bg-slate-800 overflow-hidden min-w-0">
    <div className="flex justify-between px-3 py-1.5 border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
      <span>{title}</span>
      <span
        className={
          "font-semibold " +
          (tone === "file" ? "text-green-300" : "text-rose-300")
        }
      >
        {subtitle}
      </span>
    </div>
    <div className="overflow-x-auto">{children}</div>
  </div>
);
