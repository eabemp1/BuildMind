/**
 * GET ?provider=stripe|polar|paystack|revenue_manual|github — what BuildMind can see from a connected read-only app, so a connection is never
 * invisible. Same states as the Search Console card: live numbers, a dated saved copy, or a reconnect prompt.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/integrations/crypto";
import { fetchRevenue, isRevenueProvider, revenueFacts, type RevenueProvider, type RevenueSummary } from "@/lib/integrations/revenue";
import { fetchGithubSummary, githubFacts, type GithubSummary } from "@/lib/integrations/github";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = RevenueProvider | "github";

const REVENUE_USED = "Used in investor update drafts, and to steer which task you are given: with no payments yet, Today favours tasks that lead to a first payment.";
const USED_FOR: Record<Provider, string> = {
  stripe: REVENUE_USED, polar: REVENUE_USED, paystack: REVENUE_USED, revenue_manual: REVENUE_USED + " These are the numbers you typed in.",
  github: "Used for the \"what we shipped\" lines in drafts and scripts, and so Today does not assign work you have already shipped.",
};

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, state: "unauthorized" }, { status: 401 });
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isRevenueProvider(provider) && provider !== "github") return NextResponse.json({ ok: false, state: "error" }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, state: "error" });
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("integrations").select("access_token, database_id, metadata").eq("user_id", user.userId).eq("provider", provider).maybeSingle();
    if (!data) return NextResponse.json({ ok: true, state: "not_connected" });
    const meta = (data.metadata ?? {}) as { summary?: RevenueSummary | GithubSummary; needs_reconnect?: boolean };
    const token = decryptSecret(data.access_token);
    if (!token || (provider === "github" && !data.database_id)) return NextResponse.json({ ok: true, state: "reconnect" });

    const shape = (s: RevenueSummary | GithubSummary, state: "live" | "cached") => NextResponse.json({
      ok: true, state, asOf: s.asOf, used: USED_FOR[provider],
      facts: isRevenueProvider(provider) ? revenueFacts({ ...(s as RevenueSummary), provider }) : githubFacts(s as GithubSummary),
      shipped: provider === "github" ? (s as GithubSummary).shipped.slice(0, 8) : [],
    });

    if (provider === "revenue_manual") return meta.summary ? shape(meta.summary, "cached") : NextResponse.json({ ok: true, state: "error" });
    const live = isRevenueProvider(provider) ? await fetchRevenue(provider, token) : await fetchGithubSummary(token, data.database_id as string);
    if (live.ok) {
      void Promise.resolve(admin.from("integrations").update({ metadata: { ...meta, summary: live.summary, needs_reconnect: false }, updated_at: new Date().toISOString() }).eq("user_id", user.userId).eq("provider", provider)).catch(() => {});
      return shape(live.summary, "live");
    }
    if (live.kind !== "network") return NextResponse.json({ ok: true, state: "reconnect", message: live.message });
    if (meta.summary) return shape(meta.summary, "cached");
    return NextResponse.json({ ok: true, state: "error" });
  } catch (err) {
    logError("integrations/summary", err);
    return NextResponse.json({ ok: false, state: "error" });
  }
}
