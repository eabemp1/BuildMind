import { describe, expect, it } from "vitest";
import { isForwardStageMove, stageMoveAllowed, STAGE_GATE_MIN_EVIDENCE_ROWS } from "../../lib/server/stageEvidence";

describe("stage gate", () => {
  it("needs evidence for any forward move", () => {
    expect(STAGE_GATE_MIN_EVIDENCE_ROWS).toBeGreaterThanOrEqual(1);
    expect(stageMoveAllowed("Idea", "Validation", 0)).toBe(false);
    expect(stageMoveAllowed("Idea", "MVP", 0)).toBe(false); // skipping stages is still a forward move
    expect(stageMoveAllowed("Launch", "Growth", 0)).toBe(false);
  });

  it("allows a forward move once there is the minimum evidence", () => {
    expect(stageMoveAllowed("Idea", "Validation", STAGE_GATE_MIN_EVIDENCE_ROWS)).toBe(true);
    expect(stageMoveAllowed("MVP", "Launch", 3)).toBe(true);
  });

  it("lets a founder correct a stage backwards without proof", () => {
    expect(stageMoveAllowed("Growth", "MVP", 0)).toBe(true);
    expect(isForwardStageMove("Growth", "MVP")).toBe(false);
  });

  it("rejects stages that do not exist", () => {
    expect(stageMoveAllowed("Idea", "Galaxy", 5)).toBe(false);
    expect(isForwardStageMove("Nowhere", "MVP")).toBe(false);
  });
});
