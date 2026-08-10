/**
 * __tests__/lib/journeyCurriculum.test.ts
 *
 * Tests for lib/journeyCurriculum.ts — static catalog data + lookup helpers.
 * No I/O, no mocking: this file is pure data plus two pure functions.
 */

import { describe, it, expect } from "vitest";
import {
  JOURNEY_MODULES,
  JOURNEY_SKILLS,
  getModuleByOrder,
  getSkill,
  TOTAL_MODULES,
  DEFAULT_RUBRIC_WEIGHTS,
} from "../../lib/journeyCurriculum";

describe("JOURNEY_MODULES integrity", () => {
  it("has exactly 16 modules", () => {
    expect(JOURNEY_MODULES).toHaveLength(16);
    expect(TOTAL_MODULES).toBe(16);
  });

  it("has module orders 1-16 with no gaps or duplicates", () => {
    const orders = JOURNEY_MODULES.map((m) => m.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("every module has a non-empty title, project title, and at least one topic", () => {
    for (const m of JOURNEY_MODULES) {
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.projectTitle.length).toBeGreaterThan(0);
      expect(m.topics.length).toBeGreaterThan(0);
    }
  });

  it("every module's primarySkillIds reference real skills in JOURNEY_SKILLS", () => {
    const validSkillIds = new Set(JOURNEY_SKILLS.map((s) => s.id));
    for (const m of JOURNEY_MODULES) {
      for (const skillId of m.primarySkillIds) {
        expect(validSkillIds.has(skillId)).toBe(true);
      }
    }
  });

  it("module 16 is the capstone", () => {
    const capstone = getModuleByOrder(16);
    expect(capstone?.projectTitle).toBe("Complete Python Application Capstone");
  });
});

describe("getModuleByOrder", () => {
  it("returns the matching module for a valid order", () => {
    expect(getModuleByOrder(1)?.projectTitle).toBe("Student Grade Calculator");
    expect(getModuleByOrder(5)?.projectTitle).toBe("Gradebook Management System");
  });

  it("returns undefined for an out-of-range order", () => {
    expect(getModuleByOrder(0)).toBeUndefined();
    expect(getModuleByOrder(17)).toBeUndefined();
    expect(getModuleByOrder(-1)).toBeUndefined();
  });
});

describe("JOURNEY_SKILLS integrity", () => {
  it("every skill has a unique id", () => {
    const ids = JOURNEY_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every skill has a non-empty remediation tip", () => {
    for (const s of JOURNEY_SKILLS) {
      expect(s.remediationTip.length).toBeGreaterThan(10);
    }
  });
});

describe("getSkill", () => {
  it("returns the matching skill for a valid id", () => {
    expect(getSkill("functions")?.name).toBe("Functions & Modular Design");
  });

  it("returns undefined for an unknown id", () => {
    expect(getSkill("not-a-real-skill")).toBeUndefined();
  });
});

describe("DEFAULT_RUBRIC_WEIGHTS", () => {
  it("sums to exactly 100", () => {
    const total = Object.values(DEFAULT_RUBRIC_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
  });
});
