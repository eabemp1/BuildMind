/**
 * lib/journeyPlacement.ts — placement testing (skip-ahead) content + logic.
 *
 * Deliberately, entirely non-AI on the SCORING side: every question has one
 * objectively correct answer (multiple choice), scored by exact match.
 * Nothing here is generated, judged, or graded by a model.
 *
 * Anti-cheating signals (what "flag if she worked with AI" means here):
 * this can't detect AI use directly — no multiple-choice test can, and
 * claiming otherwise would be dishonest. What it CAN do, deterministically,
 * with zero AI: capture behavioral signals during the test — how long she
 * spent, and whether she left the browser tab (which looking something up
 * elsewhere would require) — and surface them to the mentor as flags
 * alongside the score. These are correlative signals for the mentor's
 * judgment, not a verdict. The mentor remains the sole approval authority,
 * same as with project grading.
 *
 * Scope: placement is only for skipping AHEAD of module 1. Starting at
 * module 1 (the default) never touches this file — no test, no approval,
 * no friction. That's what keeps the common case "streamlined": this
 * entire system is opt-in for someone who already knows some material.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

export interface PlacementQuestion {
  id: string;
  moduleOrder: number; // which module this question is drawn from
  question: string;
  options: string[];
  correctIndex: number;
}

// Sanitized shape sent to the client — never includes correctIndex.
export interface PlacementQuestionPublic {
  id: string;
  moduleOrder: number;
  question: string;
  options: string[];
}

// 2 questions per module, modules 1-15 (a target of module N is tested on
// modules 1..N-1, so module 16 never needs its own questions here — nobody
// tests INTO the capstone via placement, they test into everything before it).
export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  { id: "p1-1", moduleOrder: 1, question: "What does input() always return, regardless of what the user types?", options: ["An integer", "A string", "A boolean", "Whatever type matches the input"], correctIndex: 1 },
  { id: "p1-2", moduleOrder: 1, question: "What is the result of 7 // 2 in Python?", options: ["3.5", "3", "4", "1"], correctIndex: 1 },
  { id: "p2-1", moduleOrder: 2, question: "In an if/elif/else chain, how many branches can run?", options: ["All that match", "Exactly one, the first that matches", "Zero or all", "Only the else branch"], correctIndex: 1 },
  { id: "p2-2", moduleOrder: 2, question: "What does `a and b` do if `a` is False?", options: ["Evaluates b anyway", "Skips evaluating b entirely", "Raises an error", "Returns True"], correctIndex: 1 },
  { id: "p3-1", moduleOrder: 3, question: "What values does `range(5)` produce?", options: ["1,2,3,4,5", "0,1,2,3,4", "0,1,2,3,4,5", "1,2,3,4"], correctIndex: 1 },
  { id: "p3-2", moduleOrder: 3, question: "What's the risk of a while loop whose condition variable is never updated inside it?", options: ["A syntax error", "It runs once and stops", "It loops forever", "Python auto-fixes it"], correctIndex: 2 },
  { id: "p4-1", moduleOrder: 4, question: "Can you change a single character of a string in place, like word[0] = 'x'?", options: ["Yes, strings are mutable", "No, strings are immutable — you build a new string", "Only for strings under 10 characters", "Only with the .replace() method"], correctIndex: 1 },
  { id: "p4-2", moduleOrder: 4, question: "In slicing, does word[2:5] include the character at index 5?", options: ["Yes", "No — the end index is exclusive", "Only for lists, not strings", "Depends on the string length"], correctIndex: 1 },
  { id: "p5-1", moduleOrder: 5, question: "What's the difference between .sort() and sorted() on a list?", options: ["No difference", ".sort() changes the list in place; sorted() returns a new list", ".sort() only works on numbers", "sorted() is faster"], correctIndex: 1 },
  { id: "p5-2", moduleOrder: 5, question: "What does enumerate() give you when looping over a list?", options: ["Just the values", "Just the indices", "Both index and value together", "A sorted copy of the list"], correctIndex: 2 },
  { id: "p6-1", moduleOrder: 6, question: "What does dict.get('key') do if 'key' doesn't exist, unlike dict['key']?", options: ["Raises the same error", "Returns None instead of crashing", "Creates the key automatically", "Returns an empty string"], correctIndex: 1 },
  { id: "p6-2", moduleOrder: 6, question: "What happens to duplicate values when you put them in a set?", options: ["Nothing, sets keep duplicates", "They're automatically removed", "Python raises an error", "They get sorted"], correctIndex: 1 },
  { id: "p7-1", moduleOrder: 7, question: "What happens to a variable created inside a function once the function returns?", options: ["It becomes global", "It stops existing (local scope)", "It's saved for next call", "It becomes a constant"], correctIndex: 1 },
  { id: "p7-2", moduleOrder: 7, question: "What does a function return if it has no explicit return statement?", options: ["0", "An empty string", "None", "It raises an error"], correctIndex: 2 },
  { id: "p8-1", moduleOrder: 8, question: "When reading a Python traceback, which line should you read first?", options: ["The first line", "The last line — it's the actual error", "The middle line", "Line numbers don't matter"], correctIndex: 1 },
  { id: "p8-2", moduleOrder: 8, question: "What's the downside of using a bare `except:` instead of `except ValueError:`?", options: ["It's slower", "It silently hides bugs you'd want to know about", "It only works once", "Nothing, they're equivalent"], correctIndex: 1 },
  { id: "p9-1", moduleOrder: 9, question: "Why use `with open(...) as f:` instead of a manual open()/close() pair?", options: ["It's shorter to type", "It guarantees the file closes even if an error happens inside", "It's the only way to read a file", "It automatically converts to JSON"], correctIndex: 1 },
  { id: "p9-2", moduleOrder: 9, question: "What Python data types does the json module convert most naturally to/from JSON?", options: ["Only strings", "dicts and lists", "Only numbers", "Custom classes only"], correctIndex: 1 },
  { id: "p10-1", moduleOrder: 10, question: "What does `from math import sqrt` let you do that `import math` doesn't?", options: ["Use sqrt() directly without the math. prefix", "Nothing, they're identical", "Import the whole standard library", "Skip installing Python"], correctIndex: 0 },
  { id: "p10-2", moduleOrder: 10, question: "Before writing custom code for something common, what should you check first?", options: ["Stack Overflow only", "Whether the standard library already has it", "Nothing, always write it yourself", "Whether it's faster in JavaScript"], correctIndex: 1 },
  { id: "p11-1", moduleOrder: 11, question: "Inheritance is the right tool for which kind of relationship between two classes?", options: ["'has-a'", "'is-a'", "Any relationship", "Only numeric relationships"], correctIndex: 1 },
  { id: "p11-2", moduleOrder: 11, question: "What does `self` refer to inside a class method?", options: ["The class itself", "The specific object instance the method was called on", "A global variable", "The parent class"], correctIndex: 1 },
  { id: "p12-1", moduleOrder: 12, question: "What's required for binary search to work correctly?", options: ["The data must be sorted", "The data must be a list, not an array", "The data must contain only numbers", "Nothing special"], correctIndex: 0 },
  { id: "p12-2", moduleOrder: 12, question: "Is a stack last-in-first-out or first-in-first-out?", options: ["First-in-first-out", "Last-in-first-out", "Neither, order is random", "Depends on the implementation"], correctIndex: 1 },
  { id: "p13-1", moduleOrder: 13, question: "What does `zip(list1, list2)` do?", options: ["Merges two lists into one flat list", "Pairs up elements from both lists by position", "Compresses the lists to save memory", "Sorts both lists together"], correctIndex: 1 },
  { id: "p13-2", moduleOrder: 13, question: "What makes a function a generator instead of a regular function?", options: ["Using return instead of yield", "Using yield instead of return", "Having no parameters", "Being defined with lambda"], correctIndex: 1 },
  { id: "p14-1", moduleOrder: 14, question: "Why use a parameterized query (with a ? placeholder) instead of building SQL with f-strings?", options: ["It's shorter to type", "It's safer and correctly handles special characters in the data", "It's the only syntax SQLite supports", "It runs faster on all databases"], correctIndex: 1 },
  { id: "p14-2", moduleOrder: 14, question: "Which SQL statement corresponds to the 'Read' in CRUD?", options: ["INSERT INTO", "SELECT", "UPDATE", "DELETE FROM"], correctIndex: 1 },
  { id: "p15-1", moduleOrder: 15, question: "What should you check before trusting an API response's data?", options: ["The response's file size", "response.status_code", "The URL length", "Nothing — if it didn't crash, it worked"], correctIndex: 1 },
  { id: "p15-2", moduleOrder: 15, question: "What does response.json() do?", options: ["Saves the response to a file", "Converts a JSON response body into a Python dict/list", "Sends a new request", "Validates the URL"], correctIndex: 1 },
];

export function getQuestionsForTarget(targetModuleOrder: number): PlacementQuestionPublic[] {
  return PLACEMENT_QUESTIONS.filter((q) => q.moduleOrder < targetModuleOrder).map((q) => ({
    id: q.id,
    moduleOrder: q.moduleOrder,
    question: q.question,
    options: q.options,
  }));
}

export interface PlacementScore {
  correctCount: number;
  totalQuestions: number;
  scorePct: number;
}

/**
 * Pure scoring function — no I/O. answers maps question id -> selected
 * option index. Any question in the target range that's missing from
 * answers, or answered out of range, counts as incorrect rather than
 * throwing — a partially-completed test should score honestly low, not crash.
 */
export function scorePlacementAnswers(targetModuleOrder: number, answers: Record<string, number>): PlacementScore {
  const questions = PLACEMENT_QUESTIONS.filter((q) => q.moduleOrder < targetModuleOrder);
  let correctCount = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctIndex) correctCount += 1;
  }
  const totalQuestions = questions.length;
  const scorePct = totalQuestions === 0 ? 100 : Math.round((correctCount / totalQuestions) * 100);
  return { correctCount, totalQuestions, scorePct };
}

// ─── Anti-cheating signals (behavioral, not AI-based — see file header) ────

export interface ProctorSignals {
  /** Seconds from first question shown to submit clicked, client-timed. */
  durationSeconds: number;
  /** Number of times the browser tab lost focus during the test (visibilitychange). */
  tabSwitchCount: number;
  /** Total seconds spent away from the tab, summed across all switches. */
  tabAwaySeconds: number;
}

export type SuspicionFlag =
  | "completed_unusually_fast"
  | "left_tab_repeatedly"
  | "spent_significant_time_away";

/**
 * Pure, deterministic, rule-based — no AI. Thresholds are intentionally
 * generous (biased toward NOT flagging) since a false flag costs her
 * trust with her mentor for nothing; the cost of missing a genuine case
 * is lower, since the score itself is still visible either way.
 */
export function computeSuspicionFlags(totalQuestions: number, signals: ProctorSignals): SuspicionFlag[] {
  const flags: SuspicionFlag[] = [];

  // Fewer than 6 seconds/question on average is faster than reading a
  // 4-option question and deciding, for essentially anyone.
  if (totalQuestions > 0 && signals.durationSeconds / totalQuestions < 6) {
    flags.push("completed_unusually_fast");
  }

  if (signals.tabSwitchCount >= 3) {
    flags.push("left_tab_repeatedly");
  }

  // More than a quarter of total test time spent away from the tab.
  if (signals.durationSeconds > 0 && signals.tabAwaySeconds / signals.durationSeconds > 0.25) {
    flags.push("spent_significant_time_away");
  }

  return flags;
}

// ─── DB-touching functions ──────────────────────────────────────────────────

export interface PlacementRequest {
  id: string;
  user_id: string | null;
  student_id: string | null;
  requested_module_order: number;
  correct_count: number;
  total_questions: number;
  score_pct: number;
  duration_seconds: number;
  tab_switch_count: number;
  tab_away_seconds: number;
  flags: string[];
  status: "pending_review" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  mentor_note: string | null;
  created_at: string;
}

type IdentityColumn = "user_id" | "student_id";

/**
 * Submits a placement test attempt. Returns the created request (status
 * always starts pending_review — score alone never auto-approves, the
 * mentor's judgment is the actual gate). Guards against submitting for a
 * module she's already effectively past (module_order <= her current
 * position with any project passed) and against a second pending request
 * stacking on an unreviewed one.
 */
export async function submitPlacementRequest(
  identityColumn: IdentityColumn,
  identityValue: string,
  targetModuleOrder: number,
  answers: Record<string, number>,
  signals: ProctorSignals,
): Promise<PlacementRequest> {
  if (targetModuleOrder < 2 || targetModuleOrder > 16) {
    throw new Error("Placement target must be a module between 2 and 16");
  }

  const admin = createAdminClient();

  const { data: existingPending } = await admin
    .from("journey_placement_requests")
    .select("id")
    .eq(identityColumn, identityValue)
    .eq("status", "pending_review")
    .maybeSingle();
  if (existingPending) {
    throw new Error("A placement request is already pending review");
  }

  const { data: existingPath } = await admin
    .from("journey_paths")
    .select("current_module_order")
    .eq(identityColumn, identityValue)
    .maybeSingle();
  if (existingPath && existingPath.current_module_order > 1) {
    throw new Error("Placement is only available before starting the journey — she's already begun");
  }

  const { correctCount, totalQuestions, scorePct } = scorePlacementAnswers(targetModuleOrder, answers);
  const flags = computeSuspicionFlags(totalQuestions, signals);

  const { data, error } = await admin
    .from("journey_placement_requests")
    .insert({
      [identityColumn]: identityValue,
      requested_module_order: targetModuleOrder,
      correct_count: correctCount,
      total_questions: totalQuestions,
      score_pct: scorePct,
      duration_seconds: Math.round(signals.durationSeconds),
      tab_switch_count: signals.tabSwitchCount,
      tab_away_seconds: Math.round(signals.tabAwaySeconds),
      flags,
      status: "pending_review",
    })
    .select("*")
    .single();

  if (error || !data) {
    logError("journeyPlacement.submitPlacementRequest", error);
    throw new Error("Failed to submit placement request");
  }
  return data as PlacementRequest;
}

export async function getPlacementStatus(identityColumn: IdentityColumn, identityValue: string): Promise<{
  hasPath: boolean;
  pendingRequest: PlacementRequest | null;
  lastRejected: PlacementRequest | null;
}> {
  const admin = createAdminClient();

  const [{ data: path }, { data: pending }, { data: rejected }] = await Promise.all([
    admin.from("journey_paths").select("id").eq(identityColumn, identityValue).maybeSingle(),
    admin
      .from("journey_placement_requests")
      .select("*")
      .eq(identityColumn, identityValue)
      .eq("status", "pending_review")
      .maybeSingle(),
    admin
      .from("journey_placement_requests")
      .select("*")
      .eq(identityColumn, identityValue)
      .eq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    hasPath: path !== null,
    pendingRequest: (pending as PlacementRequest) ?? null,
    lastRejected: !pending ? ((rejected as PlacementRequest) ?? null) : null,
  };
}

export async function listPendingPlacementRequests(): Promise<PlacementRequest[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("journey_placement_requests")
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  if (error) {
    logError("journeyPlacement.listPendingPlacementRequests", error);
    return [];
  }
  return (data ?? []) as PlacementRequest[];
}

/**
 * Mentor-only. Approving creates (or advances) the student's path directly
 * to the requested module — this is the one place a path can start at
 * something other than module 1. Rejecting just closes the request; she
 * can submit a new attempt afterward (the "already pending" guard in
 * submitPlacementRequest only blocks a SECOND simultaneous attempt, not a
 * retry after rejection).
 */
export async function reviewPlacementRequest(
  mentorId: string,
  requestId: string,
  approve: boolean,
  note?: string,
): Promise<PlacementRequest> {
  const admin = createAdminClient();

  const { data: request, error: fetchErr } = await admin
    .from("journey_placement_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (fetchErr || !request) throw new Error("Placement request not found");
  if (request.status !== "pending_review") throw new Error("This request has already been reviewed");

  const { data: updated, error: updateErr } = await admin
    .from("journey_placement_requests")
    .update({
      status: approve ? "approved" : "rejected",
      reviewed_by: mentorId,
      reviewed_at: new Date().toISOString(),
      mentor_note: note ?? null,
    })
    .eq("id", requestId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    logError("journeyPlacement.reviewPlacementRequest.update", updateErr);
    throw new Error("Failed to record review decision");
  }

  if (approve) {
    const identityColumn: IdentityColumn = request.student_id ? "student_id" : "user_id";
    const identityValue: string = request.student_id ?? request.user_id;

    const { data: existingPath } = await admin
      .from("journey_paths")
      .select("id")
      .eq(identityColumn, identityValue)
      .maybeSingle();

    if (existingPath) {
      await admin
        .from("journey_paths")
        .update({ current_module_order: request.requested_module_order })
        .eq(identityColumn, identityValue);
    } else {
      await admin.from("journey_paths").insert({
        [identityColumn]: identityValue,
        current_module_order: request.requested_module_order,
        status: "active",
      });
    }
  }

  return updated as PlacementRequest;
}
