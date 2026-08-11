/**
 * __tests__/lib/journeyContent.test.ts
 *
 * Tests for lib/journeyContent.ts — static content, no I/O. Checks
 * structural integrity (every module covered, ids unique, content
 * non-empty) rather than the prose itself, which isn't something a test
 * can meaningfully assert on.
 */

import { describe, it, expect } from "vitest";
import {
  JOURNEY_LESSONS,
  JOURNEY_EXERCISES,
  getLessonsForModule,
  getExercisesForModule,
  getLessonById,
  getExerciseById,
} from "../../lib/journeyContent";
import { JOURNEY_MODULES } from "../../lib/journeyCurriculum";

describe("JOURNEY_LESSONS coverage", () => {
  it("has at least one lesson for every one of the 16 modules", () => {
    for (const m of JOURNEY_MODULES) {
      const lessons = getLessonsForModule(m.order);
      expect(lessons.length).toBeGreaterThan(0);
    }
  });

  it("has unique lesson ids", () => {
    const ids = JOURNEY_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every lesson has non-empty body paragraphs and key takeaways", () => {
    for (const l of JOURNEY_LESSONS) {
      expect(l.body.length).toBeGreaterThan(0);
      expect(l.body.every((p) => p.length > 20)).toBe(true);
      expect(l.keyTakeaways.length).toBeGreaterThan(0);
    }
  });

  it("every lesson's moduleOrder is a real module (1-16)", () => {
    for (const l of JOURNEY_LESSONS) {
      expect(l.moduleOrder).toBeGreaterThanOrEqual(1);
      expect(l.moduleOrder).toBeLessThanOrEqual(16);
    }
  });
});

describe("JOURNEY_EXERCISES coverage", () => {
  it("has at least two exercises for every one of the 16 modules", () => {
    for (const m of JOURNEY_MODULES) {
      const exercises = getExercisesForModule(m.order);
      expect(exercises.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("has unique exercise ids", () => {
    const ids = JOURNEY_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every exercise has a non-trivial prompt and hint", () => {
    for (const e of JOURNEY_EXERCISES) {
      expect(e.prompt.length).toBeGreaterThan(15);
      expect(e.hint.length).toBeGreaterThan(10);
    }
  });
});

describe("getLessonById / getExerciseById", () => {
  it("returns the matching lesson for a known id", () => {
    expect(getLessonById("m1-fundamentals")?.title).toBe("Python Fundamentals");
  });

  it("returns undefined for an unknown lesson id", () => {
    expect(getLessonById("not-a-real-lesson")).toBeUndefined();
  });

  it("returns the matching exercise for a known id", () => {
    expect(getExerciseById("m1-ex1")?.moduleOrder).toBe(1);
  });

  it("returns undefined for an unknown exercise id", () => {
    expect(getExerciseById("not-a-real-exercise")).toBeUndefined();
  });
});
