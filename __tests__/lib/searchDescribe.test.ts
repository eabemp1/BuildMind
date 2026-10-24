import { describe, it, expect } from "vitest";
import { describeSearch, summariseSearch } from "@/lib/integrations/searchConsole";

const range = { start: "2026-09-26", end: "2026-10-23" };
const sum = (rows: Array<[string, number, number, number]>) => summariseSearch(rows.map(([query, clicks, impressions, position]) => ({ query, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position })), "sc-domain:x.com", range);

describe("describeSearch", () => {
  it("says plainly when Google has not shown the site yet", () => {
    expect(describeSearch(sum([]))).toMatch(/not shown this site/);
  });
  it("points at titles when seen but never clicked", () => {
    expect(describeSearch(sum([["a", 0, 40, 6]]))).toMatch(/never clicked/);
  });
  it("refuses to over-read very small numbers", () => {
    expect(describeSearch(sum([["a", 2, 30, 6]]))).toMatch(/Too little data/);
  });
  it("reports click-through when there is enough data", () => {
    const t = describeSearch(sum([["a", 10, 200, 4]]));
    expect(t).toMatch(/10 clicks from 200 impressions \(5%\)/);
  });
  it("singular click", () => {
    expect(describeSearch(sum([["a", 1, 10, 4]]))).toMatch(/1 click from/);
  });
});
