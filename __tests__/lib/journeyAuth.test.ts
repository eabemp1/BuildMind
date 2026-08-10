/**
 * __tests__/lib/journeyAuth.test.ts
 *
 * Tests for lib/server/journeyAuth.ts — env-var-backed email allowlist.
 * Reads process.env directly (same convention as lib/server/adminAuth.ts),
 * so tests set/restore the env var rather than mocking a module.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isJourneyStudentEmail } from "../../lib/server/journeyAuth";

const ORIGINAL_ENV = process.env.JOURNEY_STUDENT_EMAILS;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.JOURNEY_STUDENT_EMAILS;
  else process.env.JOURNEY_STUDENT_EMAILS = ORIGINAL_ENV;
});

beforeEach(() => {
  delete process.env.JOURNEY_STUDENT_EMAILS;
});

describe("isJourneyStudentEmail", () => {
  it("returns false when the env var is unset", () => {
    expect(isJourneyStudentEmail("her@email.com")).toBe(false);
  });

  it("returns false for null/undefined/empty input", () => {
    process.env.JOURNEY_STUDENT_EMAILS = "her@email.com";
    expect(isJourneyStudentEmail(null)).toBe(false);
    expect(isJourneyStudentEmail(undefined)).toBe(false);
    expect(isJourneyStudentEmail("")).toBe(false);
  });

  it("returns true for an exact match", () => {
    process.env.JOURNEY_STUDENT_EMAILS = "her@email.com";
    expect(isJourneyStudentEmail("her@email.com")).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    process.env.JOURNEY_STUDENT_EMAILS = "Her@Email.com";
    expect(isJourneyStudentEmail("her@email.com")).toBe(true);
    expect(isJourneyStudentEmail("HER@EMAIL.COM")).toBe(true);
  });

  it("supports multiple comma-separated emails", () => {
    process.env.JOURNEY_STUDENT_EMAILS = "her@email.com, other@email.com";
    expect(isJourneyStudentEmail("her@email.com")).toBe(true);
    expect(isJourneyStudentEmail("other@email.com")).toBe(true);
    expect(isJourneyStudentEmail("someone-else@email.com")).toBe(false);
  });

  it("tolerates stray whitespace and empty entries in the list", () => {
    process.env.JOURNEY_STUDENT_EMAILS = " her@email.com ,, other@email.com,";
    expect(isJourneyStudentEmail("her@email.com")).toBe(true);
    expect(isJourneyStudentEmail("other@email.com")).toBe(true);
  });

  it("does not match a founder/admin email that isn't on the list", () => {
    process.env.JOURNEY_STUDENT_EMAILS = "her@email.com";
    expect(isJourneyStudentEmail("some-random-founder@email.com")).toBe(false);
  });
});
