import { describe, it, expect, vi, beforeEach } from "vitest";

const enforce = vi.fn();
vi.mock("@/app/api/ai/_utils", () => ({ enforceAndTrackAIUsage: (...a: unknown[]) => enforce(...a) }));

import { gateAIUsage, isLimitError } from "@/app/api/ai/_usageGate";
import { canAccess } from "@/lib/plan";

describe("gateAIUsage", () => {
  beforeEach(() => { enforce.mockReset(); });

  it("passes through (null) when under the limit and forwards the bucket", async () => {
    enforce.mockResolvedValue(undefined);
    expect(await gateAIUsage("u1", "core")).toBeNull();
    expect(enforce).toHaveBeenCalledWith("u1", undefined, "core");
  });

  it("returns a 429 with the upgrade URL at the limit", async () => {
    enforce.mockImplementation(async () => { throw new Error("Daily AI limit reached (3/day). Upgrade to Builder."); });
    const res = await gateAIUsage("u1");
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body.upgradeUrl).toBe("/upgrade");
    expect(body.error).toMatch(/limit reached/i);
  });

  it("fails open on a usage-store outage (never locks founders out)", async () => {
    enforce.mockImplementation(async () => { throw new Error("connection reset"); });
    expect(await gateAIUsage("u1")).toBeNull();
    expect(isLimitError(new Error("connection reset"))).toBe(false);
  });
});

describe("intelligence report gate", () => {
  it("is Builder-only", () => {
    expect(canAccess("intelligenceReport", "free")).toBe(false);
    expect(canAccess("intelligenceReport", "builder")).toBe(true);
  });
});
