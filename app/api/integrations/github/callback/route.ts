/** GET — GitHub redirects here after the App is installed. Stores the installation number (not a secret) and the repository. */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import { verifyOAuthState } from "@/lib/server/oauthState";
import { encryptSecret } from "@/lib/integrations/crypto";
import { fetchGithubSummary } from "@/lib/integrations/github";
import { listInstallationRepos, mintInstallationToken, pickRepo, toStoredToken, userOwnsInstallation } from "@/lib/integrations/githubApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const ret = request.cookies.get("bm_oauth_return")?.value ?? "/settings";
  const path = ["/today", "/settings"].includes(ret) ? ret : "/settings";
  const back = (status: string) => {
    const r = NextResponse.redirect(`${APP_URL}${path}?integration=github&status=${status}`);
    r.cookies.set("bm_oauth_return", "", { maxAge: 0, path: "/" });
    return r;
  };
  const installationId = q.get("installation_id") ?? "";
  if (!/^\d{1,15}$/.test(installationId) || q.get("setup_action") === "request") return back("denied");

  try {
    // The state proves which BuildMind account started this; GitHub echoes it back unchanged.
    const userId = verifyOAuthState(q.get("state"));
    if (!userId) return back("error");

    // Installation numbers are guessable. Only accept one the signed-in GitHub user can actually see.
    if (!(await userOwnsInstallation(q.get("code") ?? "", installationId))) return back("error");

    const token = await mintInstallationToken(installationId);
    if (!token) return back("error");
    const repos = await listInstallationRepos(token);
    const repo = pickRepo(repos);
    if (!repo) return back("no_repo");

    const stored = toStoredToken(installationId);
    const first = await fetchGithubSummary(stored, repo);
    await createAdminClient().from("integrations").upsert({
      user_id: userId, provider: "github", access_token: encryptSecret(stored), database_id: repo,
      metadata: { via: "github_app", repos: repos.map((r) => r.full_name).slice(0, 50), needs_reconnect: false, ...(first.ok ? { summary: first.summary } : {}) },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    return back("connected");
  } catch (err) {
    logError("integrations/github/callback", err);
    return back("error");
  }
}
