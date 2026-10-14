/**
 * Shared request handlers for the Distribution Studio. The admin routes and the
 * promoter routes both call these with a Scope, so data never crosses between
 * the founder and a promoter, or between two promoters.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Scope } from "./guard";
import { KINDS, SCHEMAS, TABLE, withMetricsStamp, type Kind } from "./schemas";
import { runDiagnosis, runReplyDraft, type DraftInput } from "./diagnose";

export const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);
export const DAILY_AI_LIMIT_PROMOTER = 30;

type Q = { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q };
/** Applies the scope filter to any query. */
function scoped<T>(q: T, s: Scope): T {
  const b = q as unknown as Q;
  return (s.promoterId ? b.eq("promoter_id", s.promoterId) : b.eq("user_id", s.userId).is("promoter_id", null)) as unknown as T;
}
const owner = (s: Scope) => ({ user_id: s.userId, promoter_id: s.promoterId });
const bad = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function list(s: Scope, kind: string) {
  const admin = createAdminClient();
  const load = async (k: Kind) => {
    const { data, error } = await scoped(admin.from(TABLE[k]).select("*"), s).order("updated_at", { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  try {
    if (kind === "all") {
      const [drafts, conversations, experiments] = await Promise.all(KINDS.map(load));
      return NextResponse.json({ ok: true, drafts, conversations, experiments });
    }
    if (!isKind(kind)) return bad("Unknown kind", 404);
    return NextResponse.json({ ok: true, items: await load(kind) });
  } catch (e) {
    const missing = /does not exist|relation|column/i.test(e instanceof Error ? e.message : "");
    return bad(missing ? "Run the distribution_studio migrations first." : "Could not load.", missing ? 503 : 500);
  }
}

export async function create(s: Scope, kind: string, raw: unknown) {
  if (!isKind(kind)) return bad("Unknown kind", 404);
  const p = SCHEMAS[kind].safeParse(raw);
  if (!p.success) return bad("Invalid body", 400);
  const { data, error } = await createAdminClient().from(TABLE[kind]).insert({ ...withMetricsStamp(kind, p.data), ...owner(s) }).select("*").single();
  return error ? bad("Could not save.", 500) : NextResponse.json({ ok: true, item: data });
}

export async function patch(s: Scope, kind: string, id: string | null, raw: unknown) {
  if (!isKind(kind) || !id) return bad("Bad request", 400);
  const p = SCHEMAS[kind].partial().safeParse(raw);
  if (!p.success || Object.keys(p.data).length === 0) return bad("Invalid body", 400);
  const { data, error } = await scoped(createAdminClient().from(TABLE[kind]).update({ ...withMetricsStamp(kind, p.data), updated_at: new Date().toISOString() }).eq("id", id), s).select("*").maybeSingle();
  if (error) return bad("Could not update.", 500);
  return data ? NextResponse.json({ ok: true, item: data }) : bad("Not found", 404);
}

export async function remove(s: Scope, kind: string, id: string | null) {
  if (!isKind(kind) || !id) return bad("Bad request", 400);
  const { error } = await scoped(createAdminClient().from(TABLE[kind]).delete().eq("id", id), s);
  return error ? bad("Could not delete.", 500) : NextResponse.json({ ok: true });
}

/** Promoters get a daily AI allowance so a shared link cannot run up provider cost. */
async function overAllowance(s: Scope): Promise<boolean> {
  if (!s.promoterId) return false;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const admin = createAdminClient();
  const [a, b] = await Promise.all([
    scoped(admin.from("dist_drafts").select("id", { count: "exact", head: true }), s).gte("updated_at", since),
    scoped(admin.from("dist_conversations").select("id", { count: "exact", head: true }), s).gte("updated_at", since).not("suggested_reply", "is", null),
  ]);
  return (a.count ?? 0) + (b.count ?? 0) >= DAILY_AI_LIMIT_PROMOTER;
}

export async function diagnose(s: Scope, input: DraftInput & { draftId?: string }) {
  if (await overAllowance(s)) return bad("Daily limit reached. Try again tomorrow.", 429);
  const { draftId, ...rest } = input;
  const diagnosis = await runDiagnosis(rest);
  const admin = createAdminClient();
  const row = { platform: rest.platform, audience: rest.audience ?? null, outcome: rest.outcome ?? null, context: rest.context ?? null, body: rest.body, diagnosis, updated_at: new Date().toISOString() };
  const { data, error } = draftId
    ? await scoped(admin.from("dist_drafts").update(row).eq("id", draftId), s).select("*").maybeSingle()
    : await admin.from("dist_drafts").insert({ ...row, ...owner(s) }).select("*").single();
  return NextResponse.json({ ok: true, diagnosis, draft: error ? null : data, saved: !error });
}

export async function reply(s: Scope, conversationId: string) {
  if (await overAllowance(s)) return bad("Daily limit reached. Try again tomorrow.", 429);
  const admin = createAdminClient();
  const { data: c } = await scoped(admin.from("dist_conversations").select("*").eq("id", conversationId), s).maybeSingle();
  if (!c) return bad("Not found", 404);
  if (!c.excerpt?.trim()) return bad("Paste the post excerpt first so the reply can be grounded in it.", 400);
  const draft = await runReplyDraft({ excerpt: c.excerpt, platform: c.platform, segment: c.segment, relevance: c.relevance, notes: c.notes });
  if (draft.ai) await scoped(admin.from("dist_conversations").update({ suggested_reply: draft.reply, updated_at: new Date().toISOString() }).eq("id", c.id), s);
  return NextResponse.json({ ok: true, ...draft });
}
