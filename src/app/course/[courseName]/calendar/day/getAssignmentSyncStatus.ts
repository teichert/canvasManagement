import { CanvasAssignment } from "@/features/canvas/models/assignments/canvasAssignment";
import { CanvasRubricCriteria } from "@/features/canvas/models/assignments/canvasRubricCriteria";
import { CanvasPage } from "@/features/canvas/models/pages/canvasPageModel";
import { CanvasQuiz } from "@/features/canvas/models/quizzes/canvasQuizModel";
import { LocalAssignment } from "@/features/local/assignments/models/localAssignment";
import { RubricItem } from "@/features/local/assignments/models/rubricItem";
import { LocalCoursePage } from "@/features/local/pages/localCoursePageModels";
import { LocalCourseSettings } from "@/features/local/course/localCourseSettings";
import { LocalQuiz } from "@/features/local/quizzes/models/localQuiz";
import {
  dateOrderProblem,
  dateToMarkdownString,
  getDateFromString,
} from "@/features/local/utils/timeUtils";
import { markdownToHTMLSafe } from "@/services/htmlMarkdownUtils";
import { getClassroomReplaceText } from "@/features/local/classroom50/classroom50UrlUtils";
import { htmlIsCloseEnough } from "@/services/utils/htmlIsCloseEnough";
import { CanvasLinkTargets } from "@/services/urlUtils";
import {
  GroupSetsSnapshot,
  StudentsSnapshot,
} from "@/features/canvas/roster/rosterModels";
import {
  overrideMatches,
  scheduleToOverrides,
} from "@/features/local/assignments/models/utils/scheduleUtils";
import { AssignmentScheduleEntry } from "@/features/local/assignments/models/localAssignment";
import { assignmentPoints } from "@/features/local/assignments/models/utils/assignmentPointsUtils";
import { AssignmentSubmissionType } from "@/features/local/assignments/models/assignmentSubmissionType";
import { CanvasQuizQuestion } from "@/features/canvas/models/quizzes/canvasQuizQuestionModel";
import { checkQuizQuestions } from "./quizQuestionSync";

/** Roster + group sets from the server cache; undefined while still loading. */
export interface RosterForStatus {
  students?: StudentsSnapshot;
  groupSets?: GroupSetsSnapshot;
}

export type SyncSection =
  | "modules"
  | "dates"
  | "grading"
  | "submission"
  | "groups"
  | "schedule"
  | "rubric"
  | "questions"
  | "options"
  | "description";

/** One compared setting: what the file says, what Canvas has, and whether they agree. */
export interface SyncField {
  key: string;
  label: string;
  section: SyncSection;
  /** Display value from the markdown file ("—" when unset). */
  local: string;
  /** Display value from Canvas ("—" when unset). */
  canvas: string;
  same: boolean;
  /** Short sentence for the calendar tooltip; empty when the field matches. */
  message: string;
}

export interface SyncDescription {
  localHtml: string;
  canvasHtml: string;
  same: boolean;
}

export type ItemSyncStatus = {
  status: "localOnly" | "incomplete" | "published";
  /** The first difference's message (kept for the calendar tooltip and tests). */
  message: string;
  differences: SyncField[];
  /**
   * In Canvas but students can't see it. Keeps the calendar border red, but is
   * not one of the differences: publishing is the instructor's call, not
   * something the file says or Update in Canvas would change.
   */
  unpublished?: boolean;
  /**
   * Dates Canvas won't save (see dateOrderProblem), in Canvas or not: the
   * module list counts it as an error, and the item can't be sent.
   */
  problem?: string;
};

export interface SyncReport extends ItemSyncStatus {
  /** Every compared field, matching or not, in display order. */
  fields: SyncField[];
  /** Rendered file markdown vs the Canvas description or page body. */
  description?: SyncDescription;
}

const UNSET = "—";

// Rendering an item's markdown is most of the cost of comparing it, and the
// same text renders the same, so each text is rendered once per settings and
// link targets. Capped: an editor renders every keystroke's text.
const RENDERED_CAP = 1000;
const renderedBySettings = new WeakMap<LocalCourseSettings, Map<string, string>>();
const targetIds = new WeakMap<object, number>();
const NONE = {};
let nextTargetId = 1;
const idOf = (targets: object = NONE) => {
  if (!targetIds.has(targets)) targetIds.set(targets, nextTargetId++);
  return targetIds.get(targets);
};
function renderForCompare({
  markdownString,
  settings,
  replaceText = [],
  canvasLinkTargets,
}: Parameters<typeof markdownToHTMLSafe>[0]) {
  let rendered = renderedBySettings.get(settings);
  if (!rendered) renderedBySettings.set(settings, (rendered = new Map()));
  const targets = `${idOf(canvasLinkTargets?.assignments)}/${idOf(canvasLinkTargets?.quizzes)}`;
  const key = `${targets}\n${JSON.stringify(replaceText)}\n${markdownString}`;
  const hit = rendered.get(key);
  if (hit !== undefined) return hit;
  const html = markdownToHTMLSafe({ markdownString, settings, replaceText, canvasLinkTargets });
  if (rendered.size >= RENDERED_CAP) rendered.delete(rendered.keys().next().value!);
  rendered.set(key, html);
  return html;
}

function field(
  partial: Omit<SyncField, "same" | "message"> & {
    same: boolean;
    message?: string;
  },
): SyncField {
  return { ...partial, message: partial.same ? "" : (partial.message ?? "") };
}

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = getDateFromString(value);
  return date ? dateToMarkdownString(date) : value;
}

/**
 * Optional dates (unlock, lock) are only compared when the file sets them:
 * publishing never clears a date in Canvas, so a Canvas-only date is not
 * something Update Canvas could fix.
 */
function checkOptionalDate(
  key: string,
  label: string,
  localValue: string | undefined,
  canvasValue: string | undefined,
): SyncField | null {
  if (!localValue) return null;
  const local = formatDate(localValue) ?? localValue;
  const canvas = formatDate(canvasValue);
  if (!canvas)
    return field({
      key,
      label,
      section: "dates",
      local,
      canvas: UNSET,
      same: false,
      message: `${label.toLowerCase()} date not in canvas`,
    });
  return field({
    key,
    label,
    section: "dates",
    local,
    canvas,
    same: local === canvas,
    message: `${label.toLowerCase()} date different: ${local} vs ${canvas}`,
  });
}

function checkDueDate(
  localDueAt: string,
  canvasDueAt: string | undefined,
): SyncField {
  const local = formatDate(localDueAt) ?? localDueAt;
  const canvas = formatDate(canvasDueAt);
  if (!canvas)
    return field({
      key: "dueAt",
      label: "Due",
      section: "dates",
      local,
      canvas: UNSET,
      same: false,
      message: "due date not in canvas",
    });
  return field({
    key: "dueAt",
    label: "Due",
    section: "dates",
    local,
    canvas,
    same: local === canvas,
    message: `due date different: ${local} vs ${canvas}`,
  });
}

/** Due, then lock — the order the calendar has always reported them in. */
function checkDueDateAndLock(
  localDueAt: string,
  localLockAt: string | undefined,
  canvasDueAt: string | undefined,
  canvasLockAt: string | undefined,
): SyncField[] {
  const fields: SyncField[] = [];
  const due = checkDueDate(localDueAt, canvasDueAt);
  const lock = checkOptionalDate("lockAt", "Lock", localLockAt, canvasLockAt);
  // a missing due date outranks everything else about dates
  if (!due.same && due.canvas === UNSET) {
    fields.push(due);
    if (lock) fields.push(lock);
    return fields;
  }
  // a missing lock date was reported before a differing due date
  if (lock && !lock.same && lock.canvas === UNSET) {
    fields.push(lock, due);
    return fields;
  }
  fields.push(due);
  if (lock) fields.push(lock);
  return fields;
}

function checkAssignmentGroup(
  localGroupName: string | undefined,
  canvasGroupId: number | undefined,
  settings: LocalCourseSettings,
): SyncField | null {
  if (!localGroupName) return null;
  const assignmentGroup = settings.assignmentGroups.find(
    (g) => g.name === localGroupName,
  );
  const canvasGroup = settings.assignmentGroups.find(
    (g) => g.canvasId === canvasGroupId,
  );
  const canvas = canvasGroup?.name ?? (canvasGroupId ? `id ${canvasGroupId}` : UNSET);
  if (!assignmentGroup?.canvasId)
    return field({
      key: "assignmentGroup",
      label: "Assignment group",
      section: "grading",
      local: localGroupName,
      canvas,
      same: false,
      message: "assignment group not found in canvas",
    });
  return field({
    key: "assignmentGroup",
    label: "Assignment group",
    section: "grading",
    local: localGroupName,
    canvas,
    same: canvasGroupId === assignmentGroup.canvasId,
    message: "assignment group is different",
  });
}

/** Canvas reports points on every real assignment; skip when it doesn't. */
function checkPoints(
  localRubric: RubricItem[],
  canvasPoints: number | undefined,
): SyncField | null {
  if (canvasPoints === undefined || canvasPoints === null) return null;
  const local = assignmentPoints(localRubric);
  const canvas = canvasPoints;
  return field({
    key: "points",
    label: "Points",
    section: "grading",
    local: String(local),
    canvas: String(canvas),
    same: local === canvas,
    message: `points different: ${local} vs ${canvas}`,
  });
}

/**
 * The url an external_tool assignment launches. Without an ExternalToolUrl,
 * Update in Canvas keeps the tool chosen there, so its url is shown (to copy
 * into the file) but isn't a difference.
 */
function checkExternalTool(
  assignment: LocalAssignment,
  canvasAssignment: CanvasAssignment,
): SyncField | null {
  const canvasUrl = canvasAssignment.submission_types?.includes("external_tool")
    ? canvasAssignment.external_tool_tag_attributes?.url
    : undefined;
  const local = assignment.externalToolUrl;
  if (!local && !canvasUrl) return null;
  const base = {
    key: "externalToolUrl",
    label: "External tool",
    section: "submission" as const,
    canvas: canvasUrl ?? UNSET,
  };
  if (!local)
    return field({ ...base, local: "not set (Canvas's is kept)", same: true });
  if (!assignment.submissionTypes.includes(AssignmentSubmissionType.EXTERNAL_TOOL))
    return field({
      ...base,
      local,
      same: false,
      message: "ExternalToolUrl is set but SubmissionTypes has no external_tool",
    });
  return field({
    ...base,
    local,
    same: local === canvasUrl,
    message: canvasUrl
      ? `external tool url different: ${local} vs ${canvasUrl}`
      : "external tool url not in canvas",
  });
}

function checkRubric(
  localRubric: RubricItem[],
  canvasRubric: CanvasRubricCriteria[] | undefined,
): SyncField[] {
  const fields: SyncField[] = [];
  const canvasItems = canvasRubric ?? [];
  if (localRubric.length !== canvasItems.length) {
    fields.push(
      field({
        key: "rubricCount",
        label: "Rubric rows",
        section: "rubric",
        local: String(localRubric.length),
        canvas: String(canvasItems.length),
        same: false,
        message: "rubric count is different",
      }),
    );
  }

  const rows = Math.max(localRubric.length, canvasItems.length);
  for (let i = 0; i < rows; i++) {
    const local = localRubric[i];
    const canvas = canvasItems[i];
    const label = `Rubric ${i + 1}` + (local ? ` · ${local.label}` : "");
    fields.push(
      field({
        key: `rubric:${i}`,
        label,
        section: "rubric",
        local: local ? `${local.label} · ${local.points} pts` : UNSET,
        canvas: canvas
          ? `${canvas.description} · ${canvas.points} pts`
          : UNSET,
        same:
          !!local &&
          !!canvas &&
          local.label === canvas.description &&
          local.points === canvas.points,
        message: "rubric description or points is different",
      }),
    );

    if (!local || !canvas || !local.ratings || local.ratings.length === 0)
      continue;
    const canvasRatings = canvas.ratings ?? [];
    if (local.ratings.length !== canvasRatings.length) {
      fields.push(
        field({
          key: `rubric:${i}:ratingCount`,
          label: `Rubric ${i + 1} ratings`,
          section: "rubric",
          local: String(local.ratings.length),
          canvas: String(canvasRatings.length),
          same: false,
          message: "rubric ratings count is different",
        }),
      );
    }
    const ratingRows = Math.max(local.ratings.length, canvasRatings.length);
    for (let j = 0; j < ratingRows; j++) {
      const lr = local.ratings[j];
      const cr = canvasRatings[j];
      fields.push(
        field({
          key: `rubric:${i}:rating:${j}`,
          label: `Rubric ${i + 1} rating ${j + 1}`,
          section: "rubric",
          local: lr ? `${lr.description} · ${lr.points}` : UNSET,
          canvas: cr ? `${cr.description} · ${cr.points}` : UNSET,
          same:
            !!lr &&
            !!cr &&
            lr.description === cr.description &&
            lr.points === cr.points,
          message: "rubric rating description or points is different",
        }),
      );
    }
  }
  return fields;
}

function checkDescription(
  render: () => string,
  canvasHtml: string | undefined,
): { field: SyncField; description: SyncDescription } {
  let localHtml = "";
  let same = false;
  let message = "Canvas description is different";
  try {
    localHtml = render();
    same = htmlIsCloseEnough(localHtml, canvasHtml ?? "");
  } catch (exception) {
    message = "Error parsing markdown " + exception;
  }
  return {
    field: field({
      key: "description",
      label: "Description",
      section: "description",
      local: "rendered from markdown",
      canvas: "current description",
      same,
      message,
    }),
    description: { localHtml, canvasHtml: canvasHtml ?? "", same },
  };
}

function checkGroupSet(
  assignment: LocalAssignment,
  canvasAssignment: CanvasAssignment,
  roster?: RosterForStatus,
): SyncField[] {
  const groupSets = roster?.groupSets?.groupSets;
  const canvasSet = groupSets?.find(
    (g) => g.id === canvasAssignment.group_category_id,
  );
  const canvasSetName =
    canvasSet?.name ??
    (canvasAssignment.group_category_id
      ? `id ${canvasAssignment.group_category_id}`
      : UNSET);

  if (!assignment.groupSet) {
    return [
      field({
        key: "groupSet",
        label: "Group set",
        section: "groups",
        local: UNSET,
        canvas: canvasSetName,
        same: !canvasAssignment.group_category_id,
        message: "canvas has a group set but the file has no GroupSet",
      }),
    ];
  }
  if (!groupSets) return []; // still loading, don't flag
  const groupSet = groupSets.find(
    (g) => g.name.toLowerCase() === assignment.groupSet!.toLowerCase(),
  );
  if (!groupSet)
    return [
      field({
        key: "groupSet",
        label: "Group set",
        section: "groups",
        local: assignment.groupSet,
        canvas: canvasSetName,
        same: false,
        message: `group set "${assignment.groupSet}" not found in canvas`,
      }),
    ];
  const localIndividually = assignment.gradeIndividually ?? false;
  const canvasIndividually =
    canvasAssignment.grade_group_students_individually ?? false;
  const describe = (individually: boolean) =>
    individually ? "graded individually" : "one grade per group";
  return [
    field({
      key: "groupSet",
      label: "Group set",
      section: "groups",
      local: assignment.groupSet,
      canvas: canvasSetName,
      same: canvasAssignment.group_category_id === groupSet.id,
      message: "group set differs in canvas",
    }),
    field({
      key: "gradeIndividually",
      label: "Group grading",
      section: "groups",
      local: describe(localIndividually),
      canvas: describe(canvasIndividually),
      same: localIndividually === canvasIndividually,
      message: "grade individually setting differs in canvas",
    }),
  ];
}

function scheduleEntryField(
  assignment: LocalAssignment,
  entry: AssignmentScheduleEntry,
  canvasAssignment: CanvasAssignment,
  students: NonNullable<StudentsSnapshot["students"]>,
): SyncField {
  const key = `schedule:${entry.date}`;
  const label = `Schedule ${entry.date}`;
  const local = `${entry.students.length} student${entry.students.length === 1 ? "" : "s"}`;
  const { overrides, unknown, duplicates } = scheduleToOverrides(
    { ...assignment, schedule: [entry] },
    students,
  );
  if (unknown.length > 0)
    return field({
      key,
      label,
      section: "schedule",
      local,
      canvas: UNSET,
      same: false,
      message: `not in the canvas roster: ${unknown.join(", ")}`,
    });
  if (duplicates.length > 0)
    return field({
      key,
      label,
      section: "schedule",
      local,
      canvas: UNSET,
      same: false,
      message: `listed more than once: ${duplicates.join(", ")}`,
    });
  if (overrides.length === 0)
    return field({
      key,
      label,
      section: "schedule",
      local,
      canvas: "no override needed",
      same: true,
    });
  const matched = (canvasAssignment.overrides ?? []).some((o) =>
    overrideMatches(o, overrides[0]),
  );
  return field({
    key,
    label,
    section: "schedule",
    local,
    canvas: matched ? "override matches" : "override missing or different",
    same: matched,
    message: `canvas override for ${entry.date} missing or different`,
  });
}

/** Status of one Schedule date's students against the assignment's Canvas overrides. */
export function getScheduleEntryStatus(
  assignment: LocalAssignment,
  entry: AssignmentScheduleEntry,
  canvasAssignment: CanvasAssignment | undefined,
  roster?: RosterForStatus,
): ItemSyncStatus {
  if (!canvasAssignment)
    return { status: "localOnly", message: "not in canvas", differences: [] };
  const students = roster?.students?.students;
  if (!students) return { status: "published", message: "", differences: [] }; // roster loading
  const entryField = scheduleEntryField(
    assignment,
    entry,
    canvasAssignment,
    students,
  );
  if (entryField.same)
    return { status: "published", message: "", differences: [] };
  return {
    status: "incomplete",
    message: entryField.message,
    differences: [entryField],
  };
}

/**
 * Canvas giving the assignment to only some students (overrides, no date
 * for everyone else). Update leaves who gets it to Canvas, so this is a
 * note, not a difference.
 */
function checkAssignedTo(canvasAssignment: CanvasAssignment): SyncField | undefined {
  if (!canvasAssignment.only_visible_to_overrides) return undefined;
  const students = new Set(
    (canvasAssignment.overrides ?? []).flatMap((o) => o.student_ids ?? []),
  ).size;
  return field({
    key: "assignedTo",
    label: "Assigned to",
    section: "schedule",
    local: "set in Canvas",
    canvas:
      students > 0
        ? `only ${students} student${students === 1 ? "" : "s"}`
        : "only some sections",
    same: true,
  });
}

function checkSchedule(
  assignment: LocalAssignment,
  canvasAssignment: CanvasAssignment,
  roster?: RosterForStatus,
): SyncField[] {
  // without a Schedule, Update leaves Canvas's student overrides alone (like
  // an extension for one student), so they aren't a difference
  if (!assignment.schedule) return [];
  const entries = assignment.schedule;
  const students = roster?.students?.students;
  if (!students) return [];
  const fields = entries.map((entry) =>
    scheduleEntryField(assignment, entry, canvasAssignment, students),
  );
  // student overrides in canvas that the file no longer has
  const wanted = scheduleToOverrides(assignment, students).overrides;
  const extra = (canvasAssignment.overrides ?? []).filter(
    (o) =>
      o.student_ids &&
      o.student_ids.length > 0 &&
      !wanted.some((w) => overrideMatches(o, w)),
  );
  fields.push(
    field({
      key: "schedule:extra",
      label: "Other student overrides",
      section: "schedule",
      local: "none",
      canvas:
        extra.length === 0
          ? "none"
          : `${extra.length} override${extra.length === 1 ? "" : "s"}`,
      same: extra.length === 0,
      message: `canvas has ${extra.length} student override(s) not in the schedule`,
    }),
  );
  return fields;
}

/** Dates Canvas won't save (see dateOrderProblem): a difference until fixed. */
function checkDateOrder(item: {
  unlockAt?: string;
  dueAt?: string;
  lockAt?: string;
}): SyncField[] {
  const problem = dateOrderProblem(item);
  if (!problem) return [];
  return [
    field({
      key: "dateOrder",
      label: "Dates",
      section: "dates",
      local: problem,
      canvas: UNSET,
      same: false,
      message: problem,
    }),
  ];
}

function checkAssignment(
  assignment: LocalAssignment,
  canvasAssignment: CanvasAssignment,
  settings: LocalCourseSettings,
  canvasLinkTargets?: CanvasLinkTargets,
  roster?: RosterForStatus,
): { fields: SyncField[]; description: SyncDescription } {
  const fields: SyncField[] = [];
  fields.push(...checkDateOrder(assignment));
  const unlock = checkOptionalDate(
    "unlockAt",
    "Unlock",
    assignment.unlockAt,
    canvasAssignment.unlock_at,
  );
  if (unlock) fields.push(unlock);
  fields.push(...checkGroupSet(assignment, canvasAssignment, roster));
  fields.push(...checkSchedule(assignment, canvasAssignment, roster));
  const assignedTo = checkAssignedTo(canvasAssignment);
  if (assignedTo) fields.push(assignedTo);
  // given only to some students, Canvas keeps no dates of its own: the
  // overrides carry them, and the schedule compares those
  if (!canvasAssignment.only_visible_to_overrides)
    fields.push(
      ...checkDueDateAndLock(
        assignment.dueAt,
        assignment.lockAt,
        canvasAssignment.due_at,
        canvasAssignment.lock_at,
      ),
    );
  const group = checkAssignmentGroup(
    assignment.localAssignmentGroupName,
    canvasAssignment.assignment_group_id,
    settings,
  );
  if (group) fields.push(group);
  const externalTool = checkExternalTool(assignment, canvasAssignment);
  if (externalTool) fields.push(externalTool);
  fields.push(...checkRubric(assignment.rubric, canvasAssignment.rubric));
  const points = checkPoints(
    assignment.rubric,
    canvasAssignment.points_possible,
  );
  if (points) fields.push(points);
  const description = checkDescription(
    () =>
      renderForCompare({
        markdownString: assignment.description,
        settings,
        replaceText: getClassroomReplaceText({ assignment, settings }),
        canvasLinkTargets,
      }),
    canvasAssignment.description,
  );
  fields.push(description.field);
  return { fields, description: description.description };
}

function checkQuiz(
  quiz: LocalQuiz,
  canvasQuiz: CanvasQuiz,
  settings: LocalCourseSettings,
  canvasLinkTargets?: CanvasLinkTargets,
): { fields: SyncField[]; description: SyncDescription } {
  const fields: SyncField[] = [];
  fields.push(...checkDateOrder(quiz));
  const unlock = checkOptionalDate(
    "unlockAt",
    "Unlock",
    quiz.unlockAt,
    canvasQuiz.unlock_at,
  );
  if (unlock) fields.push(unlock);
  fields.push(
    ...checkDueDateAndLock(
      quiz.dueAt,
      quiz.lockAt,
      canvasQuiz.due_at,
      canvasQuiz.lock_at,
    ),
  );
  const group = checkAssignmentGroup(
    quiz.localAssignmentGroupName,
    canvasQuiz.assignment_group_id,
    settings,
  );
  if (group) fields.push(group);
  fields.push(...checkQuizOptions(quiz, canvasQuiz));
  const description = checkDescription(
    () =>
      renderForCompare({
        markdownString: quiz.description,
        settings,
        canvasLinkTargets,
      }),
    canvasQuiz.description,
  );
  fields.push(description.field);
  return { fields, description: description.description };
}

/** The quiz settings Update in Canvas sends besides dates, group and description. */
function checkQuizOptions(quiz: LocalQuiz, canvasQuiz: CanvasQuiz): SyncField[] {
  const yesNo = (value?: boolean) => (value ? "yes" : "no");
  const attempts = (value: number) => (value === -1 ? "unlimited" : String(value));
  const minutes = (value?: number | null) => (value ? `${value} minutes` : "none");
  const options: [key: string, label: string, local: string, canvas: string][] = [
    ["password", "Password", quiz.password || UNSET, canvasQuiz.access_code || UNSET],
    ["shuffleAnswers", "Shuffle answers", yesNo(quiz.shuffleAnswers), yesNo(canvasQuiz.shuffle_answers)],
    ["showCorrectAnswers", "Show correct answers", yesNo(quiz.showCorrectAnswers), yesNo(canvasQuiz.show_correct_answers)],
    ["oneQuestionAtATime", "One question at a time", yesNo(quiz.oneQuestionAtATime), yesNo(canvasQuiz.one_question_at_a_time)],
    ["allowedAttempts", "Allowed attempts", attempts(quiz.allowedAttempts), attempts(canvasQuiz.allowed_attempts)],
    ["timeLimit", "Time limit", minutes(quiz.timeLimit), minutes(canvasQuiz.time_limit)],
  ];
  return options.map(([key, label, local, canvas]) =>
    field({
      key,
      label,
      section: "options",
      local,
      canvas,
      same: local === canvas,
      message: `${label.toLowerCase()} different: ${local} vs ${canvas}`,
    }),
  );
}

function buildReport(
  fields: SyncField[],
  published: boolean | undefined,
  description: SyncDescription | undefined,
  problem: string | undefined,
): SyncReport {
  const differences = fields.filter((f) => !f.same);
  const unpublished = !published;
  return {
    problem,
    status: differences.length > 0 || unpublished ? "incomplete" : "published",
    message:
      differences[0]?.message ?? (unpublished ? "not published in canvas" : ""),
    differences,
    unpublished,
    fields,
    description,
  };
}

/**
 * The file's module folder against the Canvas modules holding the item: a
 * file is in one folder, so Canvas should have the item in that module only.
 */
function checkModules(file: string, canvasModules: string[]): SyncField {
  const canvas = [...new Set(canvasModules)].sort();
  return field({
    key: "modules",
    label: "Modules",
    section: "modules",
    local: file,
    canvas: canvas.join(", ") || UNSET,
    same: canvas.length === 1 && canvas[0] === file,
    message:
      canvas.length > 0
        ? `modules different: ${file} vs ${canvas.join(", ")}`
        : "not in a module in canvas",
  });
}

/**
 * Compares a local item with its Canvas copy field by field. `status` and
 * `message` drive the calendar border and tooltip; `fields` and `description`
 * feed the compare page.
 */
export function getSyncReport({
  item,
  canvasItem,
  type,
  settings,
  canvasLinkTargets,
  roster,
  canvasQuestions,
  module,
}: {
  item: LocalQuiz | LocalAssignment | LocalCoursePage;
  canvasItem: CanvasQuiz | CanvasAssignment | CanvasPage | undefined;
  type: "assignment" | "page" | "quiz";
  settings: LocalCourseSettings;
  canvasLinkTargets?: CanvasLinkTargets;
  roster?: RosterForStatus;
  /** A quiz's questions in Canvas; without them only its settings are compared. */
  canvasQuestions?: CanvasQuizQuestion[];
  /** The file's module and the Canvas modules holding the item; without them the module is not compared. */
  module?: { file: string; canvas: string[] };
}): SyncReport {
  const problem = dateOrderProblem(item);
  if (!canvasItem)
    return {
      status: "localOnly",
      message: "not in canvas",
      differences: [],
      fields: [],
      problem,
    };

  const fields: SyncField[] = module
    ? [checkModules(module.file, module.canvas)]
    : [];

  if (type === "page") {
    const page = item as LocalCoursePage;
    const description = checkDescription(
      () =>
        renderForCompare({
          markdownString: page.text,
          settings,
          canvasLinkTargets,
        }),
      (canvasItem as CanvasPage).body,
    );
    fields.push(description.field);
    return buildReport(
      fields,
      canvasItem.published,
      description.description,
      problem,
    );
  }

  const checked =
    type === "quiz"
      ? checkQuiz(
          item as LocalQuiz,
          canvasItem as CanvasQuiz,
          settings,
          canvasLinkTargets,
        )
      : checkAssignment(
          item as LocalAssignment,
          canvasItem as CanvasAssignment,
          settings,
          canvasLinkTargets,
          roster,
        );
  fields.push(...checked.fields);
  if (type === "quiz" && canvasQuestions)
    fields.push(
      ...checkQuizQuestions(
        (item as LocalQuiz).questions,
        canvasQuestions,
        settings,
      ),
    );
  return buildReport(
    fields,
    canvasItem.published,
    checked.description,
    problem,
  );
}

export function getSyncStatus(
  args: Parameters<typeof getSyncReport>[0],
): ItemSyncStatus {
  const { status, message, differences, unpublished, problem } =
    getSyncReport(args);
  return { status, message, differences, unpublished, problem };
}
