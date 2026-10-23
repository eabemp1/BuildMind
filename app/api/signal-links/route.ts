/**
 * /api/signal-links
 *   POST { kind: "link", targetUrl, label? }          -> tracked link  /r/<code>
 *   POST { kind: "interest", headline, pitch?, label? } -> hosted signup page /i/<code>
 *   GET                                                -> the founder's links with verified counts
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeCode, validateTarget } from "@/lib/signalLinks";
import { countSignups } from "@/lib/signupGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LINKS = 25;
const pathFor = (kind: string, code: string) => (kind === "link" ? `/r/${code}` : kind === "confirm" ? `/v/${code}` : `/i/${code}`);

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), targetUrl: z.string().max(2000), label: z.string().trim().max(60).optional(), projectId: z.string().uuid().optional() }),
  z.object({ kind: z.literal("confirm"), claim: z.enum(["reply", "conversation", "call"]), label: z.string().trim().max(60).optional(), projectId: z.string().uuid().optional() }),
  z.object({ kind: z.literal("interest"), headline: z.string().trim().min(5).max(120), pitch: z.string().trim().max(300).optional(), label: z.string().trim().max(60).optional(), projectId: z.string().uuid().optional() }),
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Check the details and try again." }, { status: 400 });
  const b = parsed.data;

  let target: string | null = null;
  if (b.kind === "link") {
    const v = validateTarget(b.targetUrl);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 400 });
    target = v.url;
  }

  const admin = createAdminClient();
  const { count } = await admin.from("signal_links").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= MAX_LINKS) return NextResponse.json({ ok: false, error: `You have ${MAX_LINKS} tracked links already. Reuse one.` }, { status: 429 });

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = makeCode();
    const { error } = await admin.from("signal_links").insert({
      user_id: user.id,
      project_id: b.projectId ?? null,
      code,
      kind: b.kind,
      claim_kind: b.kind === "confirm" ? b.claim : null,
      label: b.label || null,
      target_url: target,
      headline: b.kind === "interest" ? b.headline : null,
      pitch: b.kind === "interest" ? b.pitch || null : null,
    });
    if (!error) return NextResponse.json({ ok: true, code, path: pathFor(b.kind, code) });
    if ((error as { code?: string }).code !== "23505") return NextResponse.json({ ok: false, error: "Could not create the link." }, { status: 500 });
  }
  return NextResponse.json({ ok: false, error: "Could not create the link. Try again." }, { status: 500 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const [linksRes, eventsRes] = await Promise.all([
    admin.from("signal_links").select("id, code, kind, claim_kind, label, target_url, headline, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(MAX_LINKS),
    admin.from("signal_events").select("link_id, event, visitor_hash, confirmed_at").eq("user_id", user.id).limit(20000),
  ]);
  if (linksRes.error) return NextResponse.json({ ok: true, links: [] });
  type Ev = { link_id: string; event: string; visitor_hash: string | null; confirmed_at: string | null };
  const byLink = new Map<string, Ev[]>();
  for (const e of (eventsRes.data ?? []) as Ev[]) byLink.set(e.link_id, [...(byLink.get(e.link_id) ?? []), e]);
  const links = (linksRes.data ?? []).map((l: { id: string; code: string; kind: string; claim_kind: string | null; label: string | null; target_url: string | null; headline: string | null; created_at: string }) => {
    const evs = byLink.get(l.id) ?? [];
    const signupRows = evs.filter((e) => e.event === "signup");
    return {
      code: l.code, kind: l.kind, claim_kind: l.claim_kind, label: l.label, target_url: l.target_url, headline: l.headline, created_at: l.created_at,
      path: pathFor(l.kind, l.code),
      visits: evs.filter((e) => e.event === "visit").length,
      signups: countSignups(signupRows),
      pending: signupRows.filter((e) => !e.confirmed_at).length,
      confirmed: evs.some((e) => e.event === "confirm"),
    };
  });
  return NextResponse.json({ ok: true, links });
}
