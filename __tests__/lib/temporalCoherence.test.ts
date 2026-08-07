import { describe, expect, it } from "vitest";
import { buildTemporalComparison } from "../../lib/temporalCoherence";

describe("temporalCoherence: buildTemporalComparison", () => {
  it("compares today, week-over-week behavior, and changes since the last decision", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    const comparison = buildTemporalComparison({
      now,
      reflections: [
        { today_action: "Call a customer", outcome: "completed", note: "customer feedback", created_at: "2026-08-05T09:00:00.000Z" },
        { today_action: "Message a user", outcome: "completed", note: "user replied", created_at: "2026-08-04T09:00:00.000Z" },
        { today_action: "Polish UI", outcome: "completed", note: "internal", created_at: "2026-07-29T09:00:00.000Z" },
      ],
      learningLogs: [
        { action_shown: "Message a user", outcome: "completed", created_at: "2026-08-04T08:00:00.000Z" },
        { action_shown: "Polish UI", outcome: "ignored", created_at: "2026-07-29T08:00:00.000Z" },
      ],
      milestones: [
        { title: "Validate buyer pain", status: "in_progress", updated_at: "2026-07-20T00:00:00.000Z" },
      ],
      tasks: [
        { title: "Interview buyer", status: "pending", is_completed: false, updated_at: "2026-07-15T00:00:00.000Z" },
      ],
      activityEvents: [
        { event_type: "task_completed", occurred_at: "2026-08-05T10:00:00.000Z" },
      ],
    });

    expect(comparison.changed_today.join(" ")).toContain("reflection");
    expect(comparison.week_over_week.join(" ")).toContain("External evidence actions moved");
    expect(comparison.since_last_decision.join(" ")).toContain("Message a user");
    expect(comparison.increasing).toContain("external evidence seeking");
    expect(comparison.slipping_goals).toContain("Validate buyer pain");
    expect(comparison.decaying_assumptions).toContain("Interview buyer");
  });
});
