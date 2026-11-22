import { thinReason } from "@/lib/leads/engine";
describe("thinReason", () => {
  it("says the check is incomplete when only some searches answered", () => {
    expect(thinReason(1, { resultsFound: 5, pagesRead: 3, places: 0, searches: 3, searchFailed: 1 })).toContain("1 of 3 searches did not answer in time");
    expect(thinReason(1, { resultsFound: 5, pagesRead: 3, places: 0, searches: 3, searchFailed: 0 })).not.toContain("incomplete");
  });
});
