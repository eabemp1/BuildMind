/**
 * /api/radar — the founder's opportunities, meetings and people.
 * GET  ?projectId&where&today=1   ranked list (today=1 returns the picks for the Today page)
 * POST { url?, text?, kind?, projectId? }   read, classify and save
 * PATCH { id, ...fields }                   update status, dates, kind, notes
 * DELETE ?id
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { isPaidSubscription } from "@/lib/radar/autoRun";
import { extractDraft } from "@/lib/radar/extract";
import { listRadar, todayPicks, CANT_ATTEND_RE } from "@/lib/radar/store";
import { prepLoopFor } from "@/lib/radar/prepLoop";
import { MAX_OPEN_LOOPS } from "@/lib/today/loops";
import { typeOfKind, type RadarKind } from "@/lib/radar/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KINDS = ["hackathon", "competition", "grant", "accelerator", "conference", "workshop", "webinar", "meetup", "meeting", "person"] as const;
const iso = z.string().max(40).nullable().optional();

const Post = z.object({ url: z.string().url().max(500).optional(), text: z.string().max(8000).optional(), kind: z.enum(KINDS).optional(), projectId: z.string().uuid().nullable().optional() });
const Patch = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "saved", "applied", "attending", "done", "dismissed"]).optional(),
  kind: z.enum(KINDS).optional(),
  title: z.string().min(1).max(140).optional(),
  starts_at: iso, deadline_at: iso, next_follow_up_at: iso, last_contacted_at: iso,
  location: z.string().max(200).nullable().optional(),
  meeting_url: z.string().url().max(500).nullable().optional(),
  role: z.enum(["customer", "mentor", "investor", "cofounder", "collaborator", "other"]).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  /** One tap "Can't attend": dismisses the item and remembers why, so similar events rank lower. */
  cant_attend: z.enum(["place", "time"]).optional(),
});

const unavailable = () => NextResponse.json({ ok: true, items: [], reason: "unavailable" });

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return unavailable();
  const u = new URL(request.url);
  const { items, setup } = await listRadar(createAdminClient(), user.userId, { projectId: u.searchParams.get("projectId"), where: u.searchParams.get("where") ?? undefined });
  if (setup) return NextResponse.json({ ok: true, items: [], reason: "setup" });
  let auto: { enabled: boolean; lastRunAt: string | null; lastAdded: number; paid: boolean } = { enabled: true, lastRunAt: null, lastAdded: 0, paid: false };
  try {
    const { data } = await createAdminClient().from("radar_settings").select("auto_discover, last_auto_run_at, last_auto_added").eq("user_id", user.userId).maybeSingle();
    const d = data as { auto_discover: boolean; last_auto_run_at: string | null; last_auto_added: number } | null;
    if (d) auto = { ...auto, enabled: d.auto_discover, lastRunAt: d.last_auto_run_at, lastAdded: d.last_auto_added };
    const { data: sub } = await createAdminClient().from("subscriptions").select("plan, status, current_period_end, grace_period_ends_at").eq("user_id", user.userId).maybeSingle();
    auto.paid = isPaidSubscription(sub);
  } catch { /* defaults */ }
  return NextResponse.json({ ok: true, items: u.searchParams.get("today") ? todayPicks(items) : items, auto });
}

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Post.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || (!parsed.data.url && !(parsed.data.text && parsed.data.text.trim().length >= 6))) return NextResponse.json({ ok: false, error: "Paste a link, or paste the details." }, { status: 400 });
  if (!hasAdminEnv()) return unavailable();
  const rl = await rateLimitAsync(`radar-add:${user.userId}`, 40, 60 * 60 * 1000, { failClosed: true });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "Too many additions. Try again later." }, { status: 429 });

  const draft = await extractDraft({ url: parsed.data.url, text: parsed.data.text }).catch(() => null);
  if (!draft) return NextResponse.json({ ok: false, error: "Could not read that link. Paste the details instead." }, { status: 422 });
  const kind: RadarKind = parsed.data.kind ?? draft.kind;
  const admin = createAdminClient();
  if (draft.url) {
    const { data: dup } = await admin.from("radar_items").select("id").eq("user_id", user.userId).eq("url", draft.url).maybeSingle();
    if (dup) {
      const { items: all } = await listRadar(admin, user.userId, { projectId: parsed.data.projectId });
      return NextResponse.json({ ok: true, item: all.find((i) => i.id === (dup as { id: string }).id) ?? null, ask_kind: null, dropped: [], duplicate: true });
    }
  }
  const { data, error } = await admin.from("radar_items").insert({
    user_id: user.userId, project_id: parsed.data.projectId ?? null, type: typeOfKind(kind), kind, kind_confirmed: parsed.data.kind ? true : draft.kind_confirmed,
    title: draft.title, organizer: draft.organizer, url: draft.url, location: draft.location, is_virtual: draft.is_virtual, meeting_url: draft.meeting_url,
    starts_at: draft.starts_at, ends_at: draft.ends_at && draft.starts_at && Date.parse(draft.ends_at) >= Date.parse(draft.starts_at) ? draft.ends_at : null,
    deadline_at: draft.deadline_at, eligibility: draft.eligibility, cost: draft.cost, role: draft.role, source_text: draft.source_text, status: "new",
  }).select("*").single();
  if (error || !data) return NextResponse.json({ ok: false, error: "Radar is not set up yet. Run the latest database migration.", reason: "setup" }, { status: 503 });
  const { items } = await listRadar(admin, user.userId, { projectId: parsed.data.projectId });
  const item = items.find((i) => i.id === (data as { id: string }).id) ?? null;
  return NextResponse.json({ ok: true, item, ask_kind: !draft.kind_confirmed && !parsed.data.kind ? { alternatives: [draft.kind, ...draft.alternatives], why: draft.why } : null, dropped: draft.dropped });
}

export async function PATCH(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Patch.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  if (!hasAdminEnv()) return unavailable();
  const { id, kind, cant_attend, ...rest } = parsed.data;
  const patch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
  if (cant_attend) {
    const { data: cur } = await createAdminClient().from("radar_items").select("notes").eq("id", id).eq("user_id", user.userId).maybeSingle();
    const kept = String((cur as { notes: string | null } | null)?.notes ?? "").replace(CANT_ATTEND_RE, "").trim();
    patch.status = "dismissed";
    patch.notes = [kept, `Can't attend (${cant_attend})`].filter(Boolean).join("\n").slice(0, 1000);
  }
  if (kind) { patch.kind = kind; patch.type = typeOfKind(kind); patch.kind_confirmed = true; }
  const { error } = await createAdminClient().from("radar_items").update(patch).eq("id", id).eq("user_id", user.userId);
  if (error) return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  if (patch.status === "attending") await addPrepReminder(id, user.userId);
  return NextResponse.json({ ok: true });
}

/** Committing to an event sets a reminder two days before it. Best effort: never fails the save. */
async function addPrepReminder(id: string, userId: string) {
  try {
    const admin = createAdminClient();
    const { data: it } = await admin.from("radar_items").select("type, title, starts_at, project_id").eq("id", id).eq("user_id", userId).maybeSingle();
    const loop = it ? prepLoopFor(it as { type: string; title: string; starts_at: string | null }) : null;
    if (!loop) return;
    const { count } = await admin.from("today_loops").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open");
    if ((count ?? 0) >= MAX_OPEN_LOOPS) return;
    const { data: dup } = await admin.from("today_loops").select("id").eq("user_id", userId).eq("status", "open").eq("task_text", loop.task_text).maybeSingle();
    if (dup?.id) return;
    await admin.from("today_loops").insert({ user_id: userId, project_id: (it as { project_id: string | null }).project_id, ...loop });
  } catch { /* reminders are a bonus */ }
}

export async function DELETE(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  if (!hasAdminEnv()) return unavailable();
  await createAdminClient().from("radar_items").delete().eq("id", id).eq("user_id", user.userId);
  return NextResponse.json({ ok: true });
}
