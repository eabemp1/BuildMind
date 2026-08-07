import { describe, expect, it, vi } from "vitest";
import { markRecommendationObserved } from "../../lib/recommendationLifecycle";

function makeSupabase() {
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const builder: any = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "log-1", lifecycle_events: [{ type: "shown", at: "2026-08-05T00:00:00.000Z" }] },
                  error: null,
                }),
              })),
            })),
          })),
        })),
      })),
      update,
    })),
  };
  return { builder, update };
}

describe("recommendationLifecycle", () => {
  it("records completed outcomes with evidence and appends lifecycle events", async () => {
    const { builder, update } = makeSupabase();

    const id = await markRecommendationObserved(builder, {
      userId: "u1",
      taskTitle: "Message 3 privacy officers",
      outcome: "completed",
      founderExplanation: "Two replied",
      evidenceProduced: "Two privacy officers replied with audit-log objections",
    });

    expect(id).toBe("log-1");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "completed",
      evidence_produced: "Two privacy officers replied with audit-log objections",
      founder_explanation: "Two replied",
      outcome_quality: "strong",
      lifecycle_events: expect.arrayContaining([
        expect.objectContaining({ type: "shown" }),
        expect.objectContaining({ type: "completed" }),
      ]),
    }));
  });

  it("maps skipped to overridden so it respects the existing database enum", async () => {
    const { builder, update } = makeSupabase();

    await markRecommendationObserved(builder, {
      userId: "u1",
      taskTitle: "Call one prospect",
      outcome: "skipped",
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "overridden",
      skipped_at: expect.any(String),
      outcome_quality: "none",
    }));
  });
});
