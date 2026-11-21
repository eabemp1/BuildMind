/**
 * The final review of a Break My Startup report. The network is mocked: no call was made to OpenAI. These runs show the
 * two outcomes asked for: Astra answers (reviewed verdict) and Astra times out (clearly labelled partial result), with
 * unsupported claims out of the report in both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = ["OPENAI_API_KEY", "OPENAI_REVIEW", "OPENAI_REVIEW_MODEL", "OPENAI_FIRST"] as const;
const saved: Record<string, string | undefined> = {};
let user: { userId: string; plan: string } | null = { userId: "u1", plan: "builder" };
vi.mock("@/app/api/ai/_planCheck", () => ({ getRouteUser: vi.fn(async () => user) }));
vi.mock("@/app/api/ai/_utils", async (orig) => ({ ...(await orig<typeof import("@/app/api/ai/_utils")>()), hasAdminEnv: () => true }));
type Row = Record<string, unknown>;
const db: { break_runs: Row[] } = { break_runs: [] };
function from(_t: string) {
  const f: Array<(r: Row) => boolean> = []; let patch: Row | null = null;
  const b: Record<string, unknown> = {
    select: () => b, update: (p: Row) => { patch = p; return b; },
    eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return b; },
    maybeSingle: async () => ({ data: db.break_runs.find((r) => f.every((x) => x(r))) ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => { const rows = db.break_runs.filter((r) => f.every((x) => x(r))); if (patch) rows.forEach((r) => Object.assign(r, patch)); return Promise.resolve({ data: rows, error: null }).then(res); },
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));
const RUN = "33333333-3333-4333-8333-333333333333";


beforeEach(() => { for (const k of KEYS) saved[k] = process.env[k]; process.env.OPENAI_API_KEY = "sk-test"; delete process.env.OPENAI_REVIEW; delete process.env.OPENAI_REVIEW_MODEL; vi.resetModules(); user = { userId: "u1", plan: "builder" }; db.break_runs = [{ id: RUN, user_id: "u1", idea: "Quests that keep new runners consistent", payload: JSON.parse(JSON.stringify(REPORT)) }]; });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const REPORT = {
  verdict: "Weak demand signal in a crowded market.",
  kill_reasons: ["Three competitors already serve this audience.", "Founders will not pay $49 a month, according to 87% of surveyed users."],
  kill_reason_tags: [["market"], ["pricing"]],
  survive_reasons: ["Competitors found do not offer weekly quests.", "I spoke with 12 customers who loved it."],
  survive_reason_tags: [["gap"], ["demand"]],
  differentiation_plan: ["Focus on first-time runners."],
  competitor_summary: "Stride and Bhaago India serve runners; neither offers quests.",
  competitors: [{ name: "Stride", url: "https://stride.example", summary: "Check-ins, milestones, leaderboard." }, { name: "Bhaago India", url: "https://bhaago.example", summary: "Habit Run, a beginner 5K." }],
  agent_outputs: { market: { summary: "Crowded running-app market." } },
  agent_statuses: { market: "success", competitor: "success", trend: "success", sentiment: "fallback", risk: "fallback" },
  review: { status: "pending" },
};
const post = (runId: string | null = RUN, extra: Record<string, unknown> = {}) => new Request("http://t/api/ai/break-my-startup/review", { method: "POST", body: JSON.stringify({ runId, ...extra }) });
const answer = (obj: unknown) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }), text: async () => "" });
const allSupported = { claims: [
  { id: "verdict", supported: true, reason: "ok" }, { id: "kill:0", supported: true, reason: "ok" }, { id: "kill:1", supported: true, reason: "ok" },
  { id: "survive:0", supported: true, reason: "ok" }, { id: "survive:1", supported: true, reason: "ok" }, { id: "diff:0", supported: true, reason: "ok" }, { id: "competitors", supported: true, reason: "ok" },
], missing_evidence: ["Whether first-time runners would pay"] };

describe("Astra reviews the final report", () => {
  it("success: the verdict is labelled as reviewed by Astra and unsupported claims are out", async () => {
    const hosts: string[] = []; let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (u: string, init: { body: string }) => { hosts.push(new URL(u).host); body = JSON.parse(init.body); return answer({ ...allSupported, claims: allSupported.claims.map((c) => (c.id === "survive:0" ? { ...c, supported: false } : c)) }); }));
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    const j = await (await POST(post())).json();
    expect(j.review.status).toBe("reviewed");
    expect(j.review.actual_model).toBe("gpt-6.2-astra");
    expect(j.review.label).toMatch(/^Reviewed by gpt-6.2-astra\./);
    expect(body.model).toBe("gpt-6.2-astra");
    expect((body.response_format as { type: string }).type).toBe("json_schema");
    expect(hosts).toEqual(["api.openai.com"]);
    // removed by the model: the claim Astra did not confirm. Removed by rule: the invented 87% and "I spoke with 12 customers".
    const d = j.data;
    expect(d.survive_reasons).toEqual([]);
    expect(d.kill_reasons).toEqual(["Three competitors already serve this audience."]);
    expect(d.kill_reason_tags).toEqual([["market"]]);
    expect(j.review.removed_by_model).toBe(1);
    expect(j.review.removed_by_rule).toBe(2);
    expect(j.review.missing_evidence).toEqual(["Whether first-time runners would pay"]);
  });

  it("forced timeout: a clearly labelled partial result, no other model answers, and unsupported claims are still out", async () => {
    const hosts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { hosts.push(new URL(u).host); throw Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }); }));
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    const j = await (await POST(post())).json();
    expect(j.review.status).toBe("partial");
    expect(j.review.label).toMatch(/^Partial: not reviewed by gpt-6.2-astra\./);
    expect(j.review.actual_model).toBeNull();
    expect(j.review.reason).toMatch(/timeout/);
    expect(hosts).toEqual(["api.openai.com"]); // no fallback model was asked to stand in
    expect(j.data.kill_reasons).toEqual(["Three competitors already serve this audience."]);
    expect(j.data.survive_reasons).toEqual(["Competitors found do not offer weekly quests."]);
    expect(j.review.removed_by_rule).toBe(2);
    expect(j.review.removed_by_model).toBe(0);
  });

  it("a half answer is a partial review, not a clean verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer({ claims: allSupported.claims.slice(0, 3), missing_evidence: [] })));
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    const j = await (await POST(post())).json();
    expect(j.review.status).toBe("partial");
    expect(j.review.reason).toMatch(/did not answer for/);
  });

  it("an error from OpenAI (rate limit) is partial too, with the reason kept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => "quota" })));
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    const j = await (await POST(post())).json();
    expect(j.review.status).toBe("partial");
    expect(j.review.reason).toContain("OPENAI_429");
  });

  it("OPENAI_REVIEW=off or no key: unavailable, rules still apply, nothing is called", async () => {
    process.env.OPENAI_REVIEW = "off";
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    const j = await (await POST(post())).json();
    expect(j.review.status).toBe("unavailable");
    expect(f).not.toHaveBeenCalled();
    expect(j.data.kill_reasons).toHaveLength(1);
  });

  it("free plan, preview reports, a missing run id and someone else's run are not reviewed", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    user = { userId: "u1", plan: "free" };
    expect((await POST(post())).status).toBe(400);
    user = { userId: "u1", plan: "builder" };
    expect((await POST(post(null))).status).toBe(400);
    db.break_runs[0].payload = { ...REPORT, gated: true };
    expect((await POST(post())).status).toBe(404);
    db.break_runs[0].payload = REPORT; user = { userId: "u2", plan: "builder" };
    expect((await POST(post())).status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });

  it("reviews the saved report, not text sent in the request", async () => {
    let prompt = "";
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { prompt = JSON.parse(init.body).messages[0].content; return answer(allSupported); }));
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    await POST(post(RUN, { data: { verdict: "Injected verdict", kill_reasons: ["Injected claim"] }, idea: "Injected idea" }));
    expect(prompt).not.toContain("Injected");
    expect(prompt).toContain("Three competitors already serve");
  });

  it("says how many analysis steps finished next to the review label", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(allSupported)));
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    const j = await (await POST(post())).json();
    expect(j.review.status).toBe("reviewed");
    expect(j.review.agents).toEqual({ succeeded: 3, total: 5 });
    expect(j.review.label).toBe("Reviewed by gpt-6.2-astra. Only 3 of 5 analysis steps finished, so the rest of the report used built-in defaults.");
  });

  it("the review is saved, and asking again for a reviewed report does not call the model", async () => {
    const f = vi.fn(async () => answer(allSupported)); vi.stubGlobal("fetch", f);
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    await POST(post());
    expect((db.break_runs[0].payload as { review: { status: string } }).review.status).toBe("reviewed");
    await POST(post()); await POST(post());
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("a failing review can be retried once, then it stops calling the model", async () => {
    const f = vi.fn(async () => { throw Object.assign(new Error("x"), { name: "TimeoutError" }); }); vi.stubGlobal("fetch", f);
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    const first = await (await POST(post())).json();
    const second = await (await POST(post())).json();
    const third = await (await POST(post())).json();
    expect(first.review.attempts).toBe(1);
    expect(second.review.attempts).toBe(2);
    expect(f).toHaveBeenCalledTimes(2);
    expect(third.capped).toBe(true);
    expect(third.review.reason).toMatch(/Review limit reached/);
    expect(third.review.status).toBe("partial");
  });

  it("says where a price came from, and replaces a price nobody published", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(allSupported)));
    const data = db.break_runs[0].payload as Record<string, unknown>;
    data.agent_outputs = { competitor: { brief: [{ name: "Stride", pricing: "Seen on their site: £95/month" }] } };
    data.evidence_layer = { falsifiers: [{ assumption: "They will pay", test: "Ask 10 runners to pay £95/month, or £40/month as a deposit." }] };
    const { POST } = await import("@/app/api/ai/break-my-startup/review/route");
    const j = await (await POST(post())).json();
    const t = j.data.evidence_layer.falsifiers[0].test as string;
    expect(t).toContain("£95/month is Stride's listed price, not a price a customer told you");
    expect(t).toContain("a price you choose");
    expect(t).not.toContain("£40");
  });
});
