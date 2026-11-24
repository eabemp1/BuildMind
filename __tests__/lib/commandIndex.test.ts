import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCommands } from "@/lib/commandIndex";
import { catalog } from "@/lib/work/registry";

const free = { plan: "free" as const, tasksCompleted: 0, theme: "light" as const };
const builder = { plan: "builder" as const, tasksCompleted: 50, theme: "dark" as const };

function routeExists(href: string): boolean {
  const p = href.split("?")[0].replace(/^\//, "");
  return [path.join("app", p), path.join("app/(dashboard)", p)].some((d) => fs.existsSync(path.join(d, "page.tsx")) || fs.existsSync(path.join(d, "page.ts")));
}

describe("command palette index", () => {
  const all = buildCommands(builder);
  it("has unique ids", () => { expect(new Set(all.map((c) => c.id)).size).toBe(all.length); });
  it("every link goes to a page that exists", () => {
    const bad = all.filter((c) => c.href && !routeExists(c.href)).map((c) => c.href);
    expect(bad).toEqual([]);
  });
  it("covers every Work tool, drawn view and tool", () => {
    const ids = new Set(all.map((c) => c.id));
    for (const e of catalog()) expect(ids.has(`work:${e.id}`)).toBe(true);
  });
  it("covers every settings section the page knows", () => {
    const hrefs = all.map((c) => c.href);
    for (const t of ["profile", "account", "billing", "integrations", "ai", "public"]) expect(hrefs).toContain(`/settings?tab=${t}`);
  });
  it("marks Builder-only and not-yet-unlocked items instead of hiding them", () => {
    const f = buildCommands(free);
    expect(f.find((c) => c.id === "page:/agents")?.locked?.reason).toBe("Builder plan");
    expect(f.find((c) => c.id === "work:visual:market")?.locked?.reason).toBe("Builder plan");
    expect(f.find((c) => c.id === "page:/break-my-startup")?.locked?.reason).toMatch(/Unlocks after 3/);
    expect(all.find((c) => c.id === "page:/break-my-startup")?.locked).toBeUndefined();
  });
  it("offers the opposite theme and hides Upgrade for paid users", () => {
    expect(all.find((c) => c.id === "act:theme")?.label).toBe("Switch to light mode");
    expect(all.some((c) => c.id === "page:/upgrade")).toBe(false);
    expect(buildCommands(free).some((c) => c.id === "page:/upgrade")).toBe(true);
  });
});
