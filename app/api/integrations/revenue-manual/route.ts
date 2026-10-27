/**
 * POST { payingCustomers, mrr?, currency, paymentsLast30d? } — typed-in revenue for any payment tool BuildMind does
 * not read. Saved as self-reported. DELETE removes it. Nothing here touches the founder's real accounts.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/integrations/crypto";
import { ManualRevenueSchema, summariseManual } from "@/lib/integrations/revenue/manual";
import { revenueFacts } from "@/lib/integrations/revenue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 503 });
  const parsed = ManualRevenueSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Check the numbers and try again." }, { status: 400 });

  const summary = summariseManual(parsed.data);
  let stored: string;
  try { stored = encryptSecret("manual"); } catch { return NextResponse.json({ ok: false, error: "Could not save securely." }, { status: 500 }); }
  const { error } = await createAdminClient().from("integrations").upsert({
    user_id: user.userId, provider: "revenue_manual", access_token: stored, database_id: null,
    metadata: { summary, needs_reconnect: false }, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) return NextResponse.json({ ok: false, error: "Could not save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, found: revenueFacts(summary) });
}
