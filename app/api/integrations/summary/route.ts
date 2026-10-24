/**
 * GET ?provider=stripe|github — what BuildMind can see from a connected read-only app, so a connection is never
 * invisible. Same states as the Search Console card: live numbers, a dated saved copy, or a reconnect prompt.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/integrations/crypto";
import { fetchStripeSummary, stripeFacts, type StripeSummary } from "@/lib/integrations/stripe";
import { fetchGithubSummary, githubFacts, type GithubSummary } from "@/lib/integrations/github";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "stripe" | "github";

const USED_FOR: Record<Provider, string> = {
  stripe: "Used in investor update drafts. It does not change which task you are given.",
  github: "Used for the \"what we shipped\" lines in drafts and scripts. It does not change which task you are given.",
};

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, state: "unauthorized" }, { status: 401 });
  const provider = new URL(request.url).searchParams.get("provider");
  if (provider !== "stripe" && provider !== "github") return NextResponse.json({ ok: false, state: "error" }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, state: "error" });
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("integrations").select("access_token, database_id, metadata").eq("user_id", user.userId).eq("provider", provider).maybeSingle();
    if (!data) return NextResponse.json({ ok: true, state: "not_connected" });
    const meta = (data.metadata ?? {}) as { summary?: StripeSummary | GithubSummary; needs_reconnect?: boolean };
    const token = decryptSecret(data.access_token);
    if (!token || (provider === "github" && !data.database_id)) return NextResponse.json({ ok: true, state: "reconnect" });

    const shape = (s: StripeSummary | GithubSummary, state: "live" | "cached") => NextResponse.json({
      ok: true, state, asOf: s.asOf, used: USED_FOR[provider],
      facts: provider === "stripe" ? stripeFacts(s as StripeSummary) : githubFacts(s as GithubSummary),
      shipped: provider === "github" ? (s as GithubSummary).shipped.slice(0, 8) : [],
    });

    const live = provider === "stripe" ? await fetchStripeSummary(token) : await fetchGithubSummary(token, data.database_id as string);
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
