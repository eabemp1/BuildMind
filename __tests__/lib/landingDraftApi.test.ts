import { describe, it, expect, vi } from "vitest";

const upserts: unknown[] = [];
vi.mock("@/app/api/ai/_planCheck", () => ({ getRouteUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/app/api/ai/_utils", () => ({ hasAdminEnv: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({
    upsert: async (row: unknown) => { upserts.push(row); return { error: null }; },
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { project_id: "11111111-1111-1111-1111-111111111111", content: { headline: "H", pitch: "P", design: { brand: "QueuePilot" } } }, error: null }) }) }) }),
  }) }),
}));

import { PUT, GET } from "@/app/api/work/landing-draft/route";

const put = (body: unknown) => PUT(new Request("http://x/api/work/landing-draft", { method: "PUT", body: JSON.stringify(body) }));

describe("saving a landing page draft", () => {
  it("saves the cleaned design under the draft's key; nothing is published", async () => {
    const r = await put({ key: "work:abc", headline: "Calmer waiting rooms", pitch: "p", design: { brand: "QueuePilot https://x.co", accent: "red; x", benefits: [{ title: "Fast", text: "Call me at a@b.co" }] } });
    expect((await r.json()).ok).toBe(true);
    const row = upserts[0] as { item_key: string; content: { design: { brand: string; accent: string; benefits: Array<{ text: string }> } } };
    expect(row.item_key).toBe("work:abc");
    expect(row.content.design.brand).toBe("QueuePilot");
    expect(row.content.design.accent).toBe("#0e7c66");
    expect(row.content.design.benefits[0].text).not.toContain("@");
  });
  it("ties a Library item's draft to the item's own project, not the open one", async () => {
    await put({ key: "work:22222222-2222-2222-2222-222222222222", projectId: "33333333-3333-3333-3333-333333333333", design: {} });
    expect((upserts[upserts.length - 1] as { project_id: string }).project_id).toBe("11111111-1111-1111-1111-111111111111");
  });
  it("refuses login-like wording and a missing key", async () => {
    expect((await put({ key: "k", design: { finalTitle: "Verify your account with your password" } })).status).toBe(400);
    expect((await put({ design: {} })).status).toBe(400);
  });
  it("reads the saved draft back", async () => {
    const r = await GET(new Request("http://x/api/work/landing-draft?key=work:abc"));
    expect((await r.json()).draft.design.brand).toBe("QueuePilot");
  });
});
