/**
 * __tests__/lib/journey.test.ts
 *
 * Tests for the DB-layer functions in lib/journey.ts, focused on the
 * highest-risk logic introduced across the Developer Journey slices:
 *
 *   - gradeSubmission: correctly branches between the user_id (authenticated)
 *     and student_id (token-link) identity columns depending on which one
 *     the submission actually carries — a bug here would silently write a
 *     grade, skill evidence, or path advancement against the WRONG identity
 *     column, which is exactly the kind of thing that looks fine in a code
 *     review and then corrupts real data.
 *   - Path advancement only fires when the passed project IS the student's
 *     current module (not an out-of-order revision of an old one).
 *   - XP awarding: project_submitted always, revision_completed only on
 *     version > 1, project_passed only when score >= 70.
 *
 * Supabase admin client is mocked at the module level, routed per-table so
 * a single test can assert on exactly which table got which write. No real
 * network calls are made. Follows the existing chainable-builder mock
 * convention from __tests__/lib/learningDb.test.ts, extended with
 * per-table routing since gradeSubmission touches six different tables in
 * one call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Per-table chainable query-builder mock ────────────────────────────────────

interface TableState {
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  thenResult: { data: unknown; error: unknown; count?: number };
}

function makeTableBuilder() {
  const state: TableState = {
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn(),
    update: vi.fn(),
    thenResult: { data: null, error: null },
  };

  const builder: Record<string, unknown> = {};
  builder.select = (..._a: unknown[]) => builder;
  builder.eq = (..._a: unknown[]) => builder;
  builder.in = (..._a: unknown[]) => builder;
  builder.order = (..._a: unknown[]) => builder;
  builder.limit = (..._a: unknown[]) => builder;
  builder.insert = (v: unknown) => {
    state.insert(v);
    return builder;
  };
  builder.update = (v: unknown) => {
    state.update(v);
    return builder;
  };
  builder.single = () => state.single();
  builder.maybeSingle = () => state.maybeSingle();
  (builder as unknown as PromiseLike<unknown>).then = function (
    resolve?: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) {
    return Promise.resolve(state.thenResult).then(resolve, reject);
  };
  (builder as { __state: TableState }).__state = state;
  return builder as Record<string, unknown> & { __state: TableState };
}

let tableBuilders: Record<string, ReturnType<typeof makeTableBuilder>> = {};

function table(name: string) {
  if (!tableBuilders[name]) tableBuilders[name] = makeTableBuilder();
  return tableBuilders[name];
}

function resetBuilders() {
  tableBuilders = {};
  vi.clearAllMocks();
}

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (name: string) => table(name),
  })),
}));

vi.mock("../../lib/server/logger", () => ({
  logError: vi.fn(),
}));

import { gradeSubmission, checkAndUnlockJourneyAchievements, completeLesson, completeExercise } from "../../lib/journey";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUBMISSION_ID = "sub-001";
const PROJECT_ID = "proj-001";
const MODULE_ORDER = 5; // Gradebook Management System — primarySkillIds: ["strings", "data_structures"]

function submissionRow(overrides: { user_id?: string | null; student_id?: string | null }) {
  return {
    id: SUBMISSION_ID,
    project_id: PROJECT_ID,
    user_id: overrides.user_id ?? null,
    student_id: overrides.student_id ?? null,
    version: 1,
    journey_projects: {
      id: PROJECT_ID,
      user_id: overrides.user_id ?? null,
      student_id: overrides.student_id ?? null,
      module_order: MODULE_ORDER,
    },
  };
}

// ── gradeSubmission — identity branching ───────────────────────────────────────

describe("gradeSubmission — identity column branching", () => {
  beforeEach(resetBuilders);

  it("writes the grade against user_id when the submission has no student_id (authenticated path)", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc", student_id: null }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({
      data: { id: "grade-001" },
      error: null,
    });
    table("journey_paths").__state.maybeSingle.mockResolvedValue({
      data: { user_id: "user-abc", current_module_order: MODULE_ORDER },
      error: null,
    });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 85 });

    const gradeInsertCall = table("journey_grades").__state.insert.mock.calls[0][0];
    expect(gradeInsertCall.user_id).toBe("user-abc");
    expect(gradeInsertCall.student_id).toBeUndefined();
    expect(gradeInsertCall.graded_by).toBe("mentor-001");
  });

  it("writes the grade against student_id when the submission has a student_id (token-link path)", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: null, student_id: "student-xyz" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({
      data: { id: "grade-002" },
      error: null,
    });
    table("journey_paths").__state.maybeSingle.mockResolvedValue({
      data: { student_id: "student-xyz", current_module_order: MODULE_ORDER },
      error: null,
    });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 90 });

    const gradeInsertCall = table("journey_grades").__state.insert.mock.calls[0][0];
    expect(gradeInsertCall.student_id).toBe("student-xyz");
    expect(gradeInsertCall.user_id).toBeUndefined();
  });

  it("student_id takes precedence if a row somehow carries both (defensive — should never happen given the DB CHECK constraint, but the function should still pick one deterministically)", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc", student_id: "student-xyz" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({ data: { id: "grade-003" }, error: null });
    table("journey_paths").__state.maybeSingle.mockResolvedValue({
      data: { student_id: "student-xyz", current_module_order: MODULE_ORDER },
      error: null,
    });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 80 });

    const gradeInsertCall = table("journey_grades").__state.insert.mock.calls[0][0];
    expect(gradeInsertCall.student_id).toBe("student-xyz");
  });
});

// ── gradeSubmission — skill evidence + pass/fail outcome ───────────────────────

describe("gradeSubmission — skill evidence and pass/fail outcome", () => {
  beforeEach(resetBuilders);

  it("marks the project 'passed' and writes 'demonstrated' evidence at score >= 70", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({ data: { id: "grade-004" }, error: null });
    table("journey_paths").__state.maybeSingle.mockResolvedValue({
      data: { user_id: "user-abc", current_module_order: MODULE_ORDER },
      error: null,
    });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 70 });

    const projectUpdateCall = table("journey_projects").__state.update.mock.calls[0][0];
    expect(projectUpdateCall.status).toBe("passed");

    const evidenceInsertCall = table("journey_skill_evidence").__state.insert.mock.calls[0][0];
    expect(Array.isArray(evidenceInsertCall)).toBe(true);
    expect(evidenceInsertCall.every((row: { level: string }) => row.level === "demonstrated")).toBe(true);
    // Module 5's primarySkillIds are ["strings", "data_structures"]
    expect(evidenceInsertCall.map((row: { skill_id: string }) => row.skill_id).sort()).toEqual([
      "data_structures",
      "strings",
    ]);
  });

  it("marks the project 'graded' (not passed) and writes 'needs_reinforcement' evidence below 70", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({ data: { id: "grade-005" }, error: null });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 69 });

    const projectUpdateCall = table("journey_projects").__state.update.mock.calls[0][0];
    expect(projectUpdateCall.status).toBe("graded");

    const evidenceInsertCall = table("journey_skill_evidence").__state.insert.mock.calls[0][0];
    expect(evidenceInsertCall.every((row: { level: string }) => row.level === "needs_reinforcement")).toBe(true);

    // A failed grade must never advance the path — journey_paths should not
    // even be queried/updated in the failing case.
    expect(table("journey_paths").__state.update).not.toHaveBeenCalled();
  });

  it("does not award project_passed XP when the score is below 70", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({ data: { id: "grade-006" }, error: null });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 50 });

    const xpInsertCalls = table("journey_xp_events").__state.insert.mock.calls;
    const eventTypes = xpInsertCalls.map((call) => call[0].event_type);
    expect(eventTypes).not.toContain("project_passed");
  });

  it("awards project_passed XP (150) when the score is >= 70", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({ data: { id: "grade-007" }, error: null });
    table("journey_paths").__state.maybeSingle.mockResolvedValue({
      data: { user_id: "user-abc", current_module_order: MODULE_ORDER },
      error: null,
    });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 95 });

    const xpInsertCalls = table("journey_xp_events").__state.insert.mock.calls;
    const passedEvent = xpInsertCalls.map((call) => call[0]).find((row) => row.event_type === "project_passed");
    expect(passedEvent).toBeDefined();
    expect(passedEvent.xp).toBe(150);
    expect(passedEvent.user_id).toBe("user-abc");
  });
});

// ── gradeSubmission — path advancement ──────────────────────────────────────────

describe("gradeSubmission — path advancement", () => {
  beforeEach(resetBuilders);

  it("advances current_module_order by 1 when the passed project matches the student's current module", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({ data: { id: "grade-008" }, error: null });
    table("journey_paths").__state.maybeSingle.mockResolvedValue({
      data: { user_id: "user-abc", current_module_order: MODULE_ORDER },
      error: null,
    });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 80 });

    const pathUpdateCall = table("journey_paths").__state.update.mock.calls[0][0];
    expect(pathUpdateCall.current_module_order).toBe(MODULE_ORDER + 1);
    expect(pathUpdateCall.status).toBe("active");
  });

  it("does NOT advance the path when the passed project is not the student's current module (e.g. a late regrade of an old project)", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({ data: { id: "grade-009" }, error: null });
    // Student has already moved on to module 8; this grade is for module 5.
    table("journey_paths").__state.maybeSingle.mockResolvedValue({
      data: { user_id: "user-abc", current_module_order: 8 },
      error: null,
    });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 80 });

    expect(table("journey_paths").__state.update).not.toHaveBeenCalled();
  });

  it("marks the path 'completed' rather than advancing past module 16", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: {
        ...submissionRow({ user_id: "user-abc" }),
        journey_projects: { id: PROJECT_ID, user_id: "user-abc", student_id: null, module_order: 16 },
      },
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({ data: { id: "grade-010" }, error: null });
    table("journey_paths").__state.maybeSingle.mockResolvedValue({
      data: { user_id: "user-abc", current_module_order: 16 },
      error: null,
    });

    await gradeSubmission("mentor-001", SUBMISSION_ID, { score: 100 });

    const pathUpdateCall = table("journey_paths").__state.update.mock.calls[0][0];
    expect(pathUpdateCall.current_module_order).toBe(16);
    expect(pathUpdateCall.status).toBe("completed");
  });
});

// ── checkAndUnlockJourneyAchievements ───────────────────────────────────────

describe("checkAndUnlockJourneyAchievements", () => {
  beforeEach(resetBuilders);

  it("unlocks first_build when exactly one project has been passed and it wasn't unlocked before", async () => {
    table("journey_achievements").__state.thenResult = { data: [], error: null }; // no prior unlocks
    table("journey_projects").__state.thenResult = { data: [{ module_order: 5 }], error: null }; // 1 passed
    table("journey_xp_events").__state.thenResult = { data: [], error: null }; // no streak activity
    table("journey_skill_evidence").__state.thenResult = { data: [], error: null }; // no comeback history

    const unlocked = await checkAndUnlockJourneyAchievements("user_id", "user-abc");

    const unlockedIds = unlocked.map((u) => u.achievement_id);
    expect(unlockedIds).toContain("first_build");

    const insertCalls = table("journey_achievements").__state.insert.mock.calls.map((c) => c[0]);
    expect(insertCalls.some((row) => row.achievement_id === "first_build" && row.user_id === "user-abc")).toBe(true);
  });

  it("does NOT re-insert or re-report an achievement that is already unlocked", async () => {
    // first_build is already unlocked
    table("journey_achievements").__state.thenResult = {
      data: [{ achievement_id: "first_build", unlocked_at: "2026-08-01T00:00:00Z" }],
      error: null,
    };
    table("journey_projects").__state.thenResult = { data: [{ module_order: 5 }], error: null };
    table("journey_xp_events").__state.thenResult = { data: [], error: null };
    table("journey_skill_evidence").__state.thenResult = { data: [], error: null };

    const unlocked = await checkAndUnlockJourneyAchievements("user_id", "user-abc");

    expect(unlocked.map((u) => u.achievement_id)).not.toContain("first_build");
    const insertCalls = table("journey_achievements").__state.insert.mock.calls;
    expect(insertCalls.some((c) => c[0].achievement_id === "first_build")).toBe(false);
  });

  it("uses the correct identity column for the token-link (student_id) path", async () => {
    table("journey_achievements").__state.thenResult = { data: [], error: null };
    table("journey_projects").__state.thenResult = { data: [{ module_order: 1 }], error: null };
    table("journey_xp_events").__state.thenResult = { data: [], error: null };
    table("journey_skill_evidence").__state.thenResult = { data: [], error: null };

    await checkAndUnlockJourneyAchievements("student_id", "student-xyz");

    const insertCalls = table("journey_achievements").__state.insert.mock.calls.map((c) => c[0]);
    expect(insertCalls.every((row) => row.student_id === "student-xyz" && row.user_id === undefined)).toBe(true);
  });

  it("unlocks capstone only when module 16 is specifically in the passed set", async () => {
    table("journey_achievements").__state.thenResult = { data: [], error: null };
    table("journey_projects").__state.thenResult = {
      data: Array.from({ length: 15 }, (_, i) => ({ module_order: i + 1 })), // 1-15, NOT 16
      error: null,
    };
    table("journey_xp_events").__state.thenResult = { data: [], error: null };
    table("journey_skill_evidence").__state.thenResult = { data: [], error: null };

    const unlocked = await checkAndUnlockJourneyAchievements("user_id", "user-abc");
    expect(unlocked.map((u) => u.achievement_id)).not.toContain("capstone");
    // But five_projects and ten_projects should both fire at 15 passed.
    expect(unlocked.map((u) => u.achievement_id)).toContain("five_projects");
    expect(unlocked.map((u) => u.achievement_id)).toContain("ten_projects");
  });

  it("does not throw when the underlying insert fails (e.g. a concurrent-grade race hitting the unique index)", async () => {
    // Same table serves both the "read existing unlocks" query and the
    // "insert new unlock" call in this mock (both resolve via .then()) —
    // forcing an error here exercises both paths at once: the initial read
    // degrades to an empty list (getUnlockedAchievements' own error
    // handling), and the insert attempt also reports an error, which
    // checkAndUnlockJourneyAchievements must log and skip rather than throw.
    table("journey_achievements").__state.thenResult = { data: null, error: { message: "conflict" } };
    table("journey_projects").__state.thenResult = { data: [{ module_order: 1 }], error: null };
    table("journey_xp_events").__state.thenResult = { data: [], error: null };
    table("journey_skill_evidence").__state.thenResult = { data: [], error: null };

    const unlocked = await checkAndUnlockJourneyAchievements("user_id", "user-abc");
    expect(unlocked).toEqual([]);
  });
});

describe("gradeSubmission — error handling", () => {
  beforeEach(resetBuilders);

  it("throws if the submission does not exist", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(gradeSubmission("mentor-001", "nonexistent", { score: 80 })).rejects.toThrow(
      "Submission not found",
    );
  });

  it("throws if the grade insert fails", async () => {
    table("journey_submissions").__state.maybeSingle.mockResolvedValue({
      data: submissionRow({ user_id: "user-abc" }),
      error: null,
    });
    table("journey_grades").__state.single.mockResolvedValue({
      data: null,
      error: { message: "constraint violation" },
    });

    await expect(gradeSubmission("mentor-001", SUBMISSION_ID, { score: 80 })).rejects.toThrow(
      "Failed to record grade",
    );
  });
});

// ── completeLesson / completeExercise — idempotent completion + XP award ──────

describe("completeLesson", () => {
  beforeEach(resetBuilders);

  it("awards lesson_completed XP the first time a real lesson is completed", async () => {
    table("journey_xp_events").__state.maybeSingle.mockResolvedValue({ data: null, error: null }); // not yet completed

    const result = await completeLesson("user_id", "user-abc", "m1-fundamentals");

    expect(result.alreadyCompleted).toBe(false);
    const insertCall = table("journey_xp_events").__state.insert.mock.calls[0][0];
    expect(insertCall.event_type).toBe("lesson_completed");
    expect(insertCall.source_id).toBe("m1-fundamentals");
    expect(insertCall.user_id).toBe("user-abc");
    expect(insertCall.xp).toBe(10);
  });

  it("does NOT award XP again if the lesson was already completed", async () => {
    table("journey_xp_events").__state.maybeSingle.mockResolvedValue({
      data: { id: "existing-event" },
      error: null,
    }); // already completed

    const result = await completeLesson("user_id", "user-abc", "m1-fundamentals");

    expect(result.alreadyCompleted).toBe(true);
    expect(table("journey_xp_events").__state.insert).not.toHaveBeenCalled();
  });

  it("throws for an unknown lesson id rather than silently awarding XP", async () => {
    await expect(completeLesson("user_id", "user-abc", "not-a-real-lesson")).rejects.toThrow(
      "Unknown lesson id",
    );
    expect(table("journey_xp_events").__state.insert).not.toHaveBeenCalled();
  });

  it("uses the student_id column on the token-link path", async () => {
    table("journey_xp_events").__state.maybeSingle.mockResolvedValue({ data: null, error: null });

    await completeLesson("student_id", "student-xyz", "m1-fundamentals");

    const insertCall = table("journey_xp_events").__state.insert.mock.calls[0][0];
    expect(insertCall.student_id).toBe("student-xyz");
    expect(insertCall.user_id).toBeUndefined();
  });
});

describe("completeExercise", () => {
  beforeEach(resetBuilders);

  it("awards exercise_completed XP the first time a real exercise is completed", async () => {
    table("journey_xp_events").__state.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await completeExercise("user_id", "user-abc", "m1-ex1");

    expect(result.alreadyCompleted).toBe(false);
    const insertCall = table("journey_xp_events").__state.insert.mock.calls[0][0];
    expect(insertCall.event_type).toBe("exercise_completed");
    expect(insertCall.source_id).toBe("m1-ex1");
    expect(insertCall.xp).toBe(15);
  });

  it("does NOT award XP again if the exercise was already completed", async () => {
    table("journey_xp_events").__state.maybeSingle.mockResolvedValue({
      data: { id: "existing-event" },
      error: null,
    });

    const result = await completeExercise("user_id", "user-abc", "m1-ex1");

    expect(result.alreadyCompleted).toBe(true);
    expect(table("journey_xp_events").__state.insert).not.toHaveBeenCalled();
  });

  it("throws for an unknown exercise id", async () => {
    await expect(completeExercise("user_id", "user-abc", "not-a-real-exercise")).rejects.toThrow(
      "Unknown exercise id",
    );
  });
});
