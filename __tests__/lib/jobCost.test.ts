import { describe, it, expect } from "vitest";
import { noteModelCall, setJobUser, withJobCost, emptyTally, tallyRow } from "@/lib/jobCost";

describe("jobCost", () => {
  it("adds calls made inside a job and ignores calls outside", async () => {
    noteModelCall({ provider: "x", ms: 1, inTokens: 5, outTokens: 5 }); // outside: no throw
    let seen = 0;
    await withJobCost("test", async () => { setJobUser("u"); noteModelCall({ provider: "g", ms: 10, inTokens: 100, outTokens: 50 }); noteModelCall({ provider: "g", ms: 5, inTokens: 10, outTokens: 5 }); seen = 2; });
    expect(seen).toBe(2);
  });
  it("builds one row from a tally", () => {
    const t = emptyTally(); t.calls = 2; t.inTokens = 110; t.outTokens = 55; t.ms = 15; t.providers.add("g");
    expect(tallyRow("u", "agent_run", "j1", t)).toEqual({ user_id: "u", kind: "agent_run", job_id: "j1", calls: 2, approx_in_tokens: 110, approx_out_tokens: 55, providers: ["g"], ms: 15 });
  });
});
