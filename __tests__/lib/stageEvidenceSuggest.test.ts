import { describe, it, expect } from "vitest";
import { suggestEvidence } from "@/lib/stageEvidenceSuggest";
import { getStageEvidenceRequirement } from "@/lib/server/stageEvidence";

const rev = (o: object) => ({ provider: "stripe", mode: "live", payingCustomers: 0, paymentsLast30d: 0, mrr: {}, last30d: {}, truncated: false, asOf: "2026-11-05T00:00:00Z", ...o }) as never;

describe("suggestEvidence", () => {
  it("offers paying customers from live revenue, labelled with the source", () => {
    const s = suggestEvidence({ revenue: [rev({ payingCustomers: 3 })] });
    expect(s).toHaveLength(1);
    expect(s[0].row.metric_name).toContain("from Stripe");
    expect(s[0].row.metric_value).toBe("3");
    expect(s[0].row.metric_date).toBe("2026-11-05");
  });
  it("never offers test-mode or typed-in numbers", () => {
    expect(suggestEvidence({ revenue: [rev({ mode: "test", payingCustomers: 9 }), rev({ provider: "revenue_manual", selfReported: true, payingCustomers: 9 })] })).toEqual([]);
  });
  it("offers nothing for zero values", () => {
    expect(suggestEvidence({ revenue: [rev({})], search: { clicks: 0 } as never, github: { commits30d: 0, mergedPRs30d: 0 } as never })).toEqual([]);
  });
  it("search and github map to slots that exist and accept that type", () => {
    const s = suggestEvidence({ revenue: [], search: { clicks: 12, asOf: "2026-11-05T00:00:00Z" } as never, github: { repo: "a/b", commits30d: 20, mergedPRs30d: 4 } as never });
    const slots = [["Idea", "Validation"], ["Validation", "MVP"], ["MVP", "Launch"], ["Launch", "Growth"], ["Growth", "Revenue"]].flatMap(([a, b]) => getStageEvidenceRequirement(a, b)?.slots ?? []);
    for (const sug of s) for (const key of sug.slotKeys) {
      const slot = slots.find((x) => x.key === key);
      expect(slot, key).toBeTruthy();
      expect(slot!.acceptedTypes).toContain(sug.row.evidence_type);
    }
    expect(s.map((x) => x.id).sort()).toEqual(["github:shipped", "search:clicks"]);
  });
  it("offers logged conversations as an artifact, only when there are some", () => {
    expect(suggestEvidence({ revenue: [] }, { withInsights: 0 })).toEqual([]);
    const s = suggestEvidence({ revenue: [] }, { withInsights: 3 });
    expect(s[0].row.evidence_type).toBe("artifact");
    expect(s[0].row.artifact_description).toContain("3 customer conversations");
  });
});
