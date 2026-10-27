/**
 * POST   /api/integrations/connect  { provider: "stripe"|"polar"|"paystack"|"github", key, repo? }
 *   Tests the key against the real service first and returns what BuildMind
 *   found. Only a successful test is saved, encrypted.
 * DELETE /api/integrations/connect?provider=...  Removes the key and its snapshot.
 *
 * Read-only by design: Stripe needs a restricted key; GitHub a read-only token.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/integrations/crypto";
import { fetchRevenue, isRevenueProvider, revenueFacts } from "@/lib/integrations/revenue";
import { fetchGithubSummary, githubFacts, parseRepo } from "@/lib/integrations/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ provider: z.enum(["stripe", "polar", "paystack", "github"]), key: z.string().min(10).max(400), repo: z.string().max(210).optional() });

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = Body.safeParse(await request.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ ok: false, error: "Paste the key first." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });
  const { provider, key, repo } = p.data;

  let summary: unknown; let facts; let databaseId: string | null = null;
  if (provider !== "github") {
    const r = await fetchRevenue(provider, key);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.message }, { status: r.kind === "network" ? 502 : 400 });
    summary = r.summary; facts = revenueFacts(r.summary);
  } else {
    const parsed = parseRepo(repo ?? "");
    if (!parsed) return NextResponse.json({ ok: false, error: "Paste the address of the repository from your browser, for example https://github.com/yourname/yourproject." }, { status: 400 });
    const r = await fetchGithubSummary(key, parsed);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.message }, { status: r.kind === "network" ? 502 : 400 });
    summary = r.summary; facts = githubFacts(r.summary); databaseId = parsed;
  }

  let stored: string;
  try { stored = encryptSecret(key.trim()); } catch { return NextResponse.json({ ok: false, error: "Could not store the key securely." }, { status: 500 }); }
  const admin = createAdminClient();
  const { error } = await admin.from("integrations").upsert({
    user_id: user.userId, provider, access_token: stored, database_id: databaseId,
    metadata: { summary, needs_reconnect: false }, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) return NextResponse.json({ ok: false, error: "Could not save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, provider, found: facts, shipped: provider === "github" ? (summary as { shipped: string[] }).shipped : undefined });
}

export async function DELETE(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isRevenueProvider(provider) && provider !== "github" && provider !== "search_console") return NextResponse.json({ ok: false, error: "Unknown app." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });
  await createAdminClient().from("integrations").delete().eq("user_id", user.userId).eq("provider", provider);
  return NextResponse.json({ ok: true });
}
