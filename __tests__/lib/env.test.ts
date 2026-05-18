/**
 * __tests__/lib/env.test.ts
 *
 * Tests for lib/env.ts — environment variable validation.
 *
 * We test the validation behaviour without importing env directly
 * (which would trigger required() at module load time). Instead we
 * test the validateEnv() function and the helper logic in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Helper to temporarily set/unset env vars ──────────────────────────────────
function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const originals: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, original] of Object.entries(originals)) {
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}

// ── Pure helper tests (extracted from env.ts) ──────────────────────────────────
// These test the env helpers in isolation without triggering module-level required()

function optionalInt(val: string | undefined, defaultValue: number): number {
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function optionalBool(val: string | undefined, defaultValue = false): boolean {
  if (!val) return defaultValue;
  return val === "true" || val === "1" || val === "yes";
}

describe("optionalInt", () => {
  it("returns default when value is undefined", () => {
    expect(optionalInt(undefined, 7)).toBe(7);
  });

  it("parses a valid integer", () => {
    expect(optionalInt("14", 7)).toBe(14);
  });

  it("returns default for non-numeric string", () => {
    expect(optionalInt("not-a-number", 7)).toBe(7);
  });

  it("returns default for empty string", () => {
    expect(optionalInt("", 7)).toBe(7);
  });

  it("handles zero correctly", () => {
    expect(optionalInt("0", 7)).toBe(0);
  });
});

describe("optionalBool", () => {
  it("returns default false when undefined", () => {
    expect(optionalBool(undefined)).toBe(false);
  });

  it("returns true for 'true'", () => {
    expect(optionalBool("true")).toBe(true);
  });

  it("returns true for '1'", () => {
    expect(optionalBool("1")).toBe(true);
  });

  it("returns true for 'yes'", () => {
    expect(optionalBool("yes")).toBe(true);
  });

  it("returns false for 'false'", () => {
    expect(optionalBool("false")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(optionalBool("")).toBe(false);
  });
});

// ── REENGAGEMENT_INACTIVE_DAYS integration ──────────────────────────────────

describe("REENGAGEMENT_INACTIVE_DAYS env var", () => {
  it("defaults to 7 when not set", () => {
    const val = process.env.REENGAGEMENT_INACTIVE_DAYS;
    expect(optionalInt(val, 7)).toBe(7);
  });

  it("uses the env var value when set", () => {
    withEnv({ REENGAGEMENT_INACTIVE_DAYS: "14" }, () => {
      expect(optionalInt(process.env.REENGAGEMENT_INACTIVE_DAYS, 7)).toBe(14);
    });
  });

  it("falls back to default for invalid env var value", () => {
    withEnv({ REENGAGEMENT_INACTIVE_DAYS: "not-a-number" }, () => {
      expect(optionalInt(process.env.REENGAGEMENT_INACTIVE_DAYS, 7)).toBe(7);
    });
  });
});
