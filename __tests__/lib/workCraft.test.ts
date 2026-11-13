import { describe, it, expect } from "vitest";
import { WORK_SPECS } from "@/lib/work/registry";

describe("work playbooks", () => {
  it("every job has craft guidance and none tells the writer to invent facts", () => {
    for (const s of WORK_SPECS) {
      expect(s.craft, s.id).toBeTruthy();
      expect(s.craft!.length, s.id).toBeGreaterThan(150);
      expect(s.craft!, s.id).not.toMatch(/\bmake up\b|\bfabricate\b/i);
    }
  });
});
