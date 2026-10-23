import { describe, it, expect } from "vitest";
import { classifyAiFailure } from "@/lib/aiFailure";

describe("classifyAiFailure", () => {
  it("shows our own budget message verbatim and says not to retry", () => {
    const f = classifyAiFailure({ status: 500, message: "AI capacity limit reached for free accounts right now. Try again in a little while." });
    expect(f.kind).toBe("budget");
    expect(f.retryable).toBe(false);
    expect(f.detail).toContain("free accounts");
  });
  it("recognises the daily and monthly allowance", () => {
    expect(classifyAiFailure({ status: 500, message: "Daily AI limit reached for core (10 calls/day)." }).kind).toBe("limit");
    expect(classifyAiFailure({ status: 500, message: "Monthly AI limit reached (50 calls)." }).kind).toBe("limit");
  });
  it("maps statuses", () => {
    expect(classifyAiFailure({ status: 401 }).kind).toBe("session");
    expect(classifyAiFailure({ status: 403 }).kind).toBe("plan");
    expect(classifyAiFailure({ status: 429 }).retryable).toBe(true);
    expect(classifyAiFailure({ status: 503 }).kind).toBe("server");
  });
  it("never leaks an unknown server message", () => {
    const f = classifyAiFailure({ status: 500, message: "TypeError: cannot read properties of undefined (reading 'x') at /var/task/..." });
    expect(f.kind).toBe("server");
    expect(f.detail).not.toContain("TypeError");
  });
  it("offline wins", () => {
    expect(classifyAiFailure({ offline: true, status: 500 }).kind).toBe("offline");
  });
  it("falls back to a generic message", () => {
    expect(classifyAiFailure({}).kind).toBe("unknown");
  });
});
