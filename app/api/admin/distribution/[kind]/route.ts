import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/distribution/guard";
import { KINDS, SCHEMAS, TABLE, withMetricsStamp, type Kind } from "@/lib/distribution/schemas";

export const dynamic = "force-dynamic";

const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

/** GET /api/admin/distribution/all returns all three lists; /drafts etc. return one. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const g = await requireOwner();
  if ("res" in g) return g.res;
  const { kind } = await params;
  const admin = createAdminClient();
  const load = async (k: Kind) => {
    const { data, error } = await admin.from(TABLE[k]).select("*").eq("user_id", g.userId).order("updated_at", { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  try {
    if (kind === "all") {
      const [drafts, conversations, experiments] = await Promise.all(KINDS.map(load));
      return NextResponse.json({ ok: true, drafts, conversations, experiments });
    }
    if (!isKind(kind)) return NextResponse.json({ ok: false, error: "Unknown kind" }, { status: 404 });
    return NextResponse.json({ ok: true, items: await load(kind) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const missing = /does not exist|relation/i.test(msg);
    return NextResponse.json({ ok: false, error: missing ? "Run the distribution_studio migration first." : "Could not load." }, { status: missing ? 503 : 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const g = await requireOwner();
  if ("res" in g) return g.res;
  const { kind } = await params;
  if (!isKind(kind)) return NextResponse.json({ ok: false, error: "Unknown kind" }, { status: 404 });
  const parsed = SCHEMAS[kind].safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues.slice(0, 3) }, { status: 400 });
  const { data, error } = await createAdminClient().from(TABLE[kind]).insert({ ...withMetricsStamp(kind, parsed.data), user_id: g.userId }).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const g = await requireOwner();
  if ("res" in g) return g.res;
  const { kind } = await params;
  const id = new URL(req.url).searchParams.get("id");
  if (!isKind(kind) || !id) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  const parsed = SCHEMAS[kind].partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  const { data, error } = await createAdminClient().from(TABLE[kind])
    .update({ ...withMetricsStamp(kind, parsed.data), updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", g.userId).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not update." }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const g = await requireOwner();
  if ("res" in g) return g.res;
  const { kind } = await params;
  const id = new URL(req.url).searchParams.get("id");
  if (!isKind(kind) || !id) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  const { error } = await createAdminClient().from(TABLE[kind]).delete().eq("id", id).eq("user_id", g.userId);
  if (error) return NextResponse.json({ ok: false, error: "Could not delete." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
