import { describe, it, expect } from "vitest";
import { getSyncReport, getSyncStatus } from "./getAssignmentSyncStatus";
import { LocalQuiz } from "@/features/local/quizzes/models/localQuiz";
import { CanvasQuiz } from "@/features/canvas/models/quizzes/canvasQuizModel";
import { LocalAssignment } from "@/features/local/assignments/models/localAssignment";
import { CanvasAssignment } from "@/features/canvas/models/assignments/canvasAssignment";
import { CanvasRubricCriteria } from "@/features/canvas/models/assignments/canvasRubricCriteria";
import { AssignmentSubmissionType } from "@/features/local/assignments/models/assignmentSubmissionType";
import {
  DayOfWeek,
  LocalCourseSettings,
} from "@/features/local/course/localCourseSettings";

const baseSettings: LocalCourseSettings = {
  name: "test course",
  assignmentGroups: [],
  daysOfWeek: [DayOfWeek.Monday, DayOfWeek.Wednesday],
  startDate: "01/01/2024 00:00:00",
  endDate: "05/01/2024 00:00:00",
  defaultDueTime: { hour: 23, minute: 59 },
  canvasId: 100,
  defaultAssignmentSubmissionTypes: [],
  defaultFileUploadTypes: [],
  holidays: [],
  assets: [],
};

const baseLocalAssignment: LocalAssignment = {
  name: "Test Assignment",
  description: "hello world",
  dueAt: "08/21/2023 23:59:00",
  submissionTypes: [AssignmentSubmissionType.ONLINE_UPLOAD],
  rubric: [],
  allowedFileUploadExtensions: [],
};

const baseCanvasAssignment: CanvasAssignment = {
  id: 1,
  name: "Test Assignment",
  description: "<p>hello world</p>",
  created_at: "2023-08-01T00:00:00Z",
  has_overrides: false,
  course_id: 100,
  html_url: "",
  submissions_download_url: "",
  assignment_group_id: 0,
  due_date_required: false,
  max_name_length: 255,
  peer_reviews: false,
  automatic_peer_reviews: false,
  position: 1,
  grading_type: "points",
  published: true,
  unpublishable: false,
  only_visible_to_overrides: false,
  locked_for_user: false,
  moderated_grading: false,
  grader_count: 0,
  allowed_attempts: -1,
  is_quiz_assignment: false,
  submission_types: ["online_upload"],
  due_at: "08/21/2023 23:59:00",
};

describe("getSyncStatus - assignment", () => {
  it("returns localOnly when no canvas item", () => {
    const result = getSyncStatus({
      item: baseLocalAssignment,
      canvasItem: undefined,
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("localOnly");
  });

  it("marks an unpublished item incomplete without counting it as a difference", () => {
    const result = getSyncStatus({
      item: baseLocalAssignment,
      canvasItem: { ...baseCanvasAssignment, published: false },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.unpublished).toBe(true);
    expect(result.message).toContain("not published");
    expect(result.differences).toEqual([]);
  });

  it("returns incomplete when due date missing in canvas", () => {
    const result = getSyncStatus({
      item: baseLocalAssignment,
      canvasItem: { ...baseCanvasAssignment, due_at: undefined },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toContain("due date");
  });

  it("returns incomplete when lock date missing in canvas but set locally", () => {
    const result = getSyncStatus({
      item: { ...baseLocalAssignment, lockAt: "08/21/2023 23:59:00" },
      canvasItem: { ...baseCanvasAssignment, lock_at: undefined },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toContain("lock date");
  });

  describe("external tool", () => {
    const toolAssignment: LocalAssignment = {
      ...baseLocalAssignment,
      submissionTypes: [AssignmentSubmissionType.EXTERNAL_TOOL],
    };
    const canvasTool = (url: string): CanvasAssignment => ({
      ...baseCanvasAssignment,
      submission_types: ["external_tool"],
      external_tool_tag_attributes: { url, resource_link_id: "abc" },
    });
    const toolField = (item: LocalAssignment, canvasItem: CanvasAssignment) =>
      getSyncReport({ item, canvasItem, type: "assignment", settings: baseSettings })
        .fields.find((f) => f.key === "externalToolUrl");

    it("flags a different url", () => {
      const f = toolField(
        { ...toolAssignment, externalToolUrl: "https://a.example.edu" },
        canvasTool("https://b.example.edu"),
      );
      expect(f?.same).toBe(false);
      expect(f?.message).toContain("https://b.example.edu");
    });

    it("matches the same url", () => {
      const f = toolField(
        { ...toolAssignment, externalToolUrl: "https://a.example.edu" },
        canvasTool("https://a.example.edu"),
      );
      expect(f?.same).toBe(true);
    });

    it("shows Canvas's url without flagging it when the file has none", () => {
      const f = toolField(toolAssignment, canvasTool("https://b.example.edu"));
      expect(f?.canvas).toBe("https://b.example.edu");
      expect(f?.same).toBe(true);
    });

    it("skips assignments with no tool on either side", () => {
      expect(toolField(baseLocalAssignment, baseCanvasAssignment)).toBeUndefined();
    });
  });

  it("returns incomplete when assignment group differs", () => {
    const settings: LocalCourseSettings = {
      ...baseSettings,
      assignmentGroups: [
        { id: "group-1", name: "Homework", weight: 30, canvasId: 42 },
      ],
    };
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        localAssignmentGroupName: "Homework",
      },
      canvasItem: {
        ...baseCanvasAssignment,
        assignment_group_id: 99, // different from canvasId 42
      },
      type: "assignment",
      settings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("assignment group is different");
  });

  it("returns published when assignment groups match", () => {
    const settings: LocalCourseSettings = {
      ...baseSettings,
      assignmentGroups: [
        { id: "group-1", name: "Homework", weight: 30, canvasId: 42 },
      ],
    };
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        localAssignmentGroupName: "Homework",
      },
      canvasItem: {
        ...baseCanvasAssignment,
        assignment_group_id: 42,
      },
      type: "assignment",
      settings,
    });
    expect(result.status).toBe("published");
  });

  it("returns incomplete when assignment group has no canvasId", () => {
    const settings: LocalCourseSettings = {
      ...baseSettings,
      assignmentGroups: [
        { id: "group-1", name: "Homework", weight: 30 }, // no canvasId
      ],
    };
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        localAssignmentGroupName: "Homework",
      },
      canvasItem: {
        ...baseCanvasAssignment,
        assignment_group_id: 99,
      },
      type: "assignment",
      settings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("assignment group not found in canvas");
  });

  it("returns published when local assignment group name is unset", () => {
    const result = getSyncStatus({
      item: baseLocalAssignment,
      canvasItem: baseCanvasAssignment,
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("published");
  });
});

describe("getSyncStatus - rubric comparison", () => {
  const baseCanvasRubricItem: CanvasRubricCriteria = {
    id: "crit-1",
    description: "Code Quality",
    long_description: "",
    points: 10,
  };

  it("returns incomplete when local has rubric items but canvas has none", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [{ label: "Code Quality", points: 10 }],
      },
      canvasItem: { ...baseCanvasAssignment, rubric: undefined },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("rubric count is different");
  });

  it("returns incomplete when rubric item counts differ", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [
          { label: "Code Quality", points: 10 },
          { label: "Documentation", points: 5 },
        ],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [baseCanvasRubricItem],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("rubric count is different");
  });

  it("returns incomplete when rubric item label differs", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [{ label: "Different Label", points: 10 }],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [baseCanvasRubricItem],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("rubric description or points is different");
  });

  it("returns incomplete when rubric item points differ", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [{ label: "Code Quality", points: 20 }],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [baseCanvasRubricItem],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("rubric description or points is different");
  });

  it("returns published when rubric items match without ratings", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [{ label: "Code Quality", points: 10 }],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [baseCanvasRubricItem],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("published");
  });

  it("returns incomplete when rubric sub-item (rating) description differs", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [
          {
            label: "Code Quality",
            points: 10,
            ratings: [
              { points: 10, description: "Excellent" },
              { points: 0, description: "Poor" },
            ],
          },
        ],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [
          {
            ...baseCanvasRubricItem,
            ratings: [
              { id: "r1", points: 10, description: "Outstanding", long_description: "" },
              { id: "r2", points: 0, description: "Poor", long_description: "" },
            ],
          },
        ],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("rubric rating description or points is different");
  });

  it("returns incomplete when rubric sub-item (rating) points differ", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [
          {
            label: "Code Quality",
            points: 10,
            ratings: [
              { points: 10, description: "Excellent" },
              { points: 0, description: "Poor" },
            ],
          },
        ],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [
          {
            ...baseCanvasRubricItem,
            ratings: [
              { id: "r1", points: 8, description: "Excellent", long_description: "" },
              { id: "r2", points: 0, description: "Poor", long_description: "" },
            ],
          },
        ],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("rubric rating description or points is different");
  });

  it("returns incomplete when rubric sub-item count differs", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [
          {
            label: "Code Quality",
            points: 10,
            ratings: [
              { points: 10, description: "Excellent" },
              { points: 5, description: "Partial" },
              { points: 0, description: "Poor" },
            ],
          },
        ],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [
          {
            ...baseCanvasRubricItem,
            ratings: [
              { id: "r1", points: 10, description: "Excellent", long_description: "" },
              { id: "r2", points: 0, description: "Poor", long_description: "" },
            ],
          },
        ],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toBe("rubric ratings count is different");
  });

  it("returns published when rubric items and sub-items all match", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [
          {
            label: "Code Quality",
            points: 10,
            ratings: [
              { points: 10, description: "Excellent" },
              { points: 0, description: "Poor" },
            ],
          },
        ],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [
          {
            ...baseCanvasRubricItem,
            ratings: [
              { id: "r1", points: 10, description: "Excellent", long_description: "" },
              { id: "r2", points: 0, description: "Poor", long_description: "" },
            ],
          },
        ],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("published");
  });

  it("returns published when local has no ratings and canvas rubric matches label and points", () => {
    const result = getSyncStatus({
      item: {
        ...baseLocalAssignment,
        rubric: [{ label: "Code Quality", points: 10 }],
      },
      canvasItem: {
        ...baseCanvasAssignment,
        rubric: [
          {
            ...baseCanvasRubricItem,
            ratings: [
              { id: "r1", points: 10, description: "Full Marks", long_description: "" },
              { id: "r2", points: 0, description: "No Marks", long_description: "" },
            ],
          },
        ],
      },
      type: "assignment",
      settings: baseSettings,
    });
    expect(result.status).toBe("published");
  });
});

describe("getSyncStatus - page", () => {
  const page = { name: "Belts", text: "hello world", dueAt: "08/21/2023 23:59:00" };
  const canvasPage = {
    page_id: 1,
    url: "belts",
    title: "Belts",
    published: true,
    front_page: false,
    body: "<p>hello world</p>",
  };

  it("returns published when the content matches", () => {
    const result = getSyncStatus({
      item: page,
      canvasItem: canvasPage,
      type: "page",
      settings: baseSettings,
    });
    expect(result.status).toBe("published");
  });

  it("returns incomplete when the content differs", () => {
    const result = getSyncStatus({
      item: { ...page, text: "hello there" },
      canvasItem: canvasPage,
      type: "page",
      settings: baseSettings,
    });
    expect(result.status).toBe("incomplete");
    expect(result.message).toContain("different");
  });
});

describe("getSyncReport - quiz options", () => {
  const quiz: LocalQuiz = {
    name: "Quiz",
    description: "",
    password: "demo",
    dueAt: "08/21/2023 23:59:00",
    shuffleAnswers: true,
    showCorrectAnswers: true,
    oneQuestionAtATime: false,
    allowedAttempts: 1,
    questions: [],
  };
  const canvasQuiz = {
    id: 1,
    title: "Quiz",
    description: "",
    due_at: "08/21/2023 23:59:00",
    access_code: "demo",
    shuffle_answers: true,
    show_correct_answers: true,
    one_question_at_a_time: false,
    allowed_attempts: 1,
  } as CanvasQuiz;
  const report = (canvas: Partial<CanvasQuiz>, local: Partial<LocalQuiz> = {}) =>
    getSyncReport({
      item: { ...quiz, ...local },
      canvasItem: { ...canvasQuiz, ...canvas },
      type: "quiz",
      settings: baseSettings,
    });

  it("matches when every option agrees", () => {
    expect(report({}).fields.filter((f) => !f.same)).toEqual([]);
  });

  it("reports each option that differs", () => {
    const fields = report({
      access_code: "old",
      shuffle_answers: false,
      show_correct_answers: false,
      one_question_at_a_time: true,
      allowed_attempts: -1,
    }).fields.filter((f) => !f.same);
    expect(fields.map((f) => f.label)).toEqual([
      "Password",
      "Shuffle answers",
      "Show correct answers",
      "One question at a time",
      "Allowed attempts",
    ]);
  });

  it("compares the time limit, no limit included", () => {
    const differing = (canvas: Partial<CanvasQuiz>, local: Partial<LocalQuiz>) =>
      report(canvas, local).fields.filter((f) => !f.same).map((f) => `${f.label}: ${f.local} vs ${f.canvas}`);
    expect(differing({ time_limit: 5 }, { timeLimit: 5 })).toEqual([]);
    expect(differing({ time_limit: null }, {})).toEqual([]);
    expect(differing({ time_limit: 10 }, { timeLimit: 5 })).toEqual(["Time limit: 5 minutes vs 10 minutes"]);
    // a limit set by hand in Canvas shows up before an update would clear it
    expect(differing({ time_limit: 5 }, {})).toEqual(["Time limit: none vs 5 minutes"]);
  });

  it("treats no password and an empty one as the same", () => {
    expect(
      report({ access_code: undefined }, { password: undefined }).fields.filter((f) => !f.same),
    ).toEqual([]);
    expect(
      report({ access_code: "" }, { password: undefined }).fields.filter((f) => !f.same),
    ).toEqual([]);
  });
});

describe("getSyncReport - module", () => {
  const report = (canvasModules?: string[]) =>
    getSyncReport({
      item: baseLocalAssignment,
      canvasItem: baseCanvasAssignment,
      type: "assignment",
      settings: baseSettings,
      module: canvasModules && { file: "Week 2", canvas: canvasModules },
    });

  it("matches when the Canvas item is only in the file's module", () => {
    expect(report(["Week 2"]).differences).toEqual([]);
  });

  it("differs when the Canvas item is also in another module", () => {
    expect(report(["Week 2", "Week 1"]).differences[0]).toMatchObject({
      label: "Modules",
      canvas: "Week 1, Week 2",
      message: "modules different: Week 2 vs Week 1, Week 2",
    });
  });

  it("differs when the file moved to another module", () => {
    const [difference] = report(["Week 1"]).differences;
    expect(difference).toMatchObject({
      key: "modules",
      local: "Week 2",
      canvas: "Week 1",
      message: "modules different: Week 2 vs Week 1",
    });
  });

  it("differs when the Canvas item is in no module", () => {
    expect(report([]).differences[0]).toMatchObject({
      canvas: "—",
      message: "not in a module in canvas",
    });
  });

  it("is not compared until the Canvas modules load", () => {
    expect(report(undefined).fields.map((f) => f.key)).not.toContain("modules");
  });
});

describe("getSyncReport - student overrides", () => {
  const roster = {
    students: {
      students: [
        { id: 100202, name: "Priya Anand", sortableName: "Anand, Priya", email: "priya.anand@example.edu" },
        { id: 100203, name: "Owen Brennan", sortableName: "Brennan, Owen", email: "owen.brennan@example.edu" },
      ],
      syncedAt: "",
    },
  };
  // an extension given to one student in Canvas
  const extension = {
    id: 9,
    assignment_id: 1,
    course_section_id: 0,
    title: "Extension",
    student_ids: [100202],
    due_at: "2023-08-25T05:59:00Z",
  };
  const canvasItem = { ...baseCanvasAssignment, has_overrides: true, overrides: [extension] };
  const otherOverrides = (item: LocalAssignment) =>
    getSyncReport({ item, canvasItem, type: "assignment", settings: baseSettings, roster })
      .differences.filter((d) => d.key === "schedule:extra");

  it("doesn't count overrides set in Canvas when the file has no Schedule", () => {
    expect(otherOverrides(baseLocalAssignment)).toEqual([]);
  });

  it("counts them with an empty Schedule:, whose Update removes them", () => {
    expect(otherOverrides({ ...baseLocalAssignment, schedule: [] })).toHaveLength(1);
  });

  it("counts an override the Schedule doesn't list, which Update would replace", () => {
    const scheduled = { ...baseLocalAssignment, schedule: [{ date: "08/23/2023", students: ["100203"] }] };
    expect(otherOverrides(scheduled)).toHaveLength(1);
  });
});

describe("getSyncReport - dates Canvas won't save", () => {
  it("counts a due date after the close date as a difference", () => {
    const item = { ...baseLocalAssignment, dueAt: "08/21/2023 23:59:00", lockAt: "08/02/2023 10:30:00" };
    const canvasItem = { ...baseCanvasAssignment, lock_at: "08/02/2023 10:30:00" };

    const { differences } = getSyncReport({ item, canvasItem, type: "assignment", settings: baseSettings });

    expect(differences.find((d) => d.key === "dateOrder")?.message).toMatch(/^DueAt .* is after LockAt/);
  });
});

describe("getSyncStatus - dates Canvas won't save, not in Canvas yet", () => {
  it("still says what the problem is, so the module list can count it", () => {
    const item = { ...baseLocalAssignment, dueAt: "08/21/2023 23:59:00", lockAt: "08/02/2023 10:30:00" };

    const status = getSyncStatus({ item, canvasItem: undefined, type: "assignment", settings: baseSettings });

    expect(status.status).toBe("localOnly");
    expect(status.problem).toMatch(/^DueAt .* is after LockAt/);
  });
});

describe("getSyncReport - assigned only to some students", () => {
  const roster = {
    students: {
      students: [
        { id: 100202, name: "Priya Anand", sortableName: "Anand, Priya", email: "priya.anand@example.edu" },
        { id: 100203, name: "Owen Brennan", sortableName: "Brennan, Owen", email: "owen.brennan@example.edu" },
      ],
      syncedAt: "",
    },
  };
  // Canvas: two students, no "everyone else" date, so no due date of its own
  const canvasItem: CanvasAssignment = {
    ...baseCanvasAssignment,
    due_at: undefined as never,
    only_visible_to_overrides: true,
    has_overrides: true,
    overrides: [
      { id: 9, assignment_id: 1, course_section_id: 0, title: "2 students", student_ids: [100202, 100203], due_at: "2023-08-22T05:59:00Z" },
    ],
  } as never;
  const report = (item: LocalAssignment) =>
    getSyncReport({ item, canvasItem, type: "assignment", settings: baseSettings, roster });

  it("without a Schedule, notes that Canvas gives it to only some students, as no difference: Update leaves that to Canvas", () => {
    const { fields, differences } = report(baseLocalAssignment);
    expect(differences).toEqual([]);
    expect(fields.find((f) => f.key === "assignedTo")).toMatchObject({
      local: "set in Canvas",
      canvas: "only 2 students",
      same: true,
    });
  });
});
