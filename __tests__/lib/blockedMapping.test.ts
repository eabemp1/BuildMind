import { describe, it, expect } from "vitest";
import { deriveLearnedPatterns, buildLearnedPatternsPrompt, isBlockedRow, type LearningLogRow } from "@/lib/learning";

const row = (o: Partial<LearningLogRow>): LearningLogRow => ({
  id: Math.random().toString(36).slice(2), user_id: "u", session_id: "s", stage: "Idea", action_shown: "Send 5 personalised DMs to founders in your niche today",
  outcome: "completed", created_at: "2026-10-20T00:00:00Z", ...o,
} as LearningLogRow);

describe("blocked recommendations", () => {
  it("are partial rows with blocked_at", () => {
    expect(isBlockedRow({ outcome: "partial", blocked_at: "2026-10-20T00:00:00Z" })).toBe(true);
    expect(isBlockedRow({ outcome: "partial", blocked_at: null })).toBe(false);
    expect(isBlockedRow({ outcome: "completed", blocked_at: "2026-10-20T00:00:00Z" })).toBe(false);
  });
  it("no longer count as completed", () => {
    const rows = [
      row({ outcome: "completed" }),
      row({ outcome: "partial", blocked_at: "2026-10-20T00:00:00Z" }),
      row({ outcome: "partial", blocked_at: "2026-10-20T00:00:00Z" }),
      row({ outcome: "partial" }),
    ];
    const p = deriveLearnedPatterns(rows);
    expect(p.completion_rate).toBe(0.5); // completed + real partial, out of 4
    expect(p.blocked_count).toBe(2);
  });
  it("list action types blocked twice, and are not treated as rejection", () => {
    const rows = [
      row({ outcome: "partial", blocked_at: "x", action_type: "outreach" }),
      row({ outcome: "partial", blocked_at: "x", action_type: "outreach" }),
      row({ outcome: "completed", action_type: "build" }),
      row({ outcome: "completed", action_type: "build" }),
      row({ outcome: "completed", action_type: "build" }),
    ];
    const p = deriveLearnedPatterns(rows);
    expect(p.blocked_action_types).toEqual(["outreach"]);
    expect(p.avoided_action_types).not.toContain("outreach");
    expect(buildLearnedPatternsPrompt(p)).toMatch(/BLOCKED on actions of type: outreach/);
  });
});
