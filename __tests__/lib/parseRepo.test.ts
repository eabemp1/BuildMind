import { describe, it, expect } from "vitest";
import { parseRepo } from "@/lib/integrations/github";

describe("parseRepo", () => {
  it("takes the address from the browser bar", () => {
    expect(parseRepo("https://github.com/Shinobi7Kami/BuildMind")).toBe("Shinobi7Kami/BuildMind");
    expect(parseRepo("https://github.com/Shinobi7Kami/BuildMind/")).toBe("Shinobi7Kami/BuildMind");
    expect(parseRepo("https://github.com/Shinobi7Kami/BuildMind/pull/12?x=1#top")).toBe("Shinobi7Kami/BuildMind");
    expect(parseRepo("github.com/a/b.git")).toBe("a/b");
    expect(parseRepo("www.github.com/a/b")).toBe("a/b");
    expect(parseRepo("git@github.com:a/b.git")).toBe("a/b");
  });
  it("still accepts owner/name", () => {
    expect(parseRepo("  owner/name ")).toBe("owner/name");
  });
  it("rejects things that are not a repository", () => {
    expect(parseRepo("")).toBeNull();
    expect(parseRepo("https://github.com/someone")).toBeNull();
    expect(parseRepo("just words")).toBeNull();
    expect(parseRepo("https://example.com/a/b")).toBeNull();
  });
});
