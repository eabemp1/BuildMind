import { describe, it, expect } from "vitest";
import { rebuildLabels, cleanZoneArray, recentlyFaced } from "@/lib/server/founderMemoryMaintenance";

const ev = (text: string, at: number, bucket: "avoidance" | "strength" = "avoidance") => ({ at, text, bucket });

describe("founder memory maintenance", () => {
  it("rebuilds labels from source text, in order, deduped", () => {
    const out = rebuildLabels([
      ev("Cold DM 5 founders on LinkedIn", 1),
      ev("Cold DM 5 founders on LinkedIn again", 2),
    ], "avoidance");
    expect(out.length).toBeGreaterThan(0);
    expect(new Set(out).size).toBe(out.length);
  });
  it("never resurrects an area the founder faced recently", () => {
    const base = rebuildLabels([ev("Cold DM 5 founders on LinkedIn", 1)], "avoidance");
    expect(base.length).toBeGreaterThan(0);
    const faced = recentlyFaced([{ zone: base[0], at: new Date().toISOString() }]);
    expect(rebuildLabels([ev("Cold DM 5 founders on LinkedIn", 1)], "avoidance", faced)).toEqual([]);
  });
  it("ignores faced zones older than 30 days", () => {
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    expect(recentlyFaced([{ zone: "Visibility", at: old }]).size).toBe(0);
  });
  it("keeps blocker-derived zones and already-clean labels", () => {
    const r = cleanZoneArray(["Visibility", "Finding users", "community engagement"]);
    expect(r.after).toEqual(expect.arrayContaining(["Visibility", "Finding users", "community engagement"]));
    expect(r.changed).toBe(false);
  });
  it("still drops long raw fragments it cannot place", () => {
    expect(cleanZoneArray(["zzz qqq 12345 - lorem ipsum dolor sit amet consectetur adipiscing elit sed do"]).after).toEqual([]);
  });
  it("cleanZoneArray is idempotent", () => {
    const first = cleanZoneArray(["Comment on 3 r/Entrepreneur threads today - ask solo founders t"]);
    expect(cleanZoneArray(first.after).changed).toBe(false);
  });
});
