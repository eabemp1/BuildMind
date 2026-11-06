/**
 * GET /api/today/draft?task=…&mk=… — is there already a saved draft for today's task? Read-only: it looks up the
 * same cached row /api/ai/prep would serve and returns its shape, never generating anything.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepKindFor, taskHash } from "@/lib/prep/kinds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(request.url);
  const task = (url.searchParams.get("task") ?? "").slice(0, 600);
  const mk = url.searchParams.get("mk");
  const kind = task.length >= 4 ? prepKindFor(task, mk) : null;
  if (!kind || !hasAdminEnv()) return NextResponse.json({ ok: true, draft: null });

  const { data, error } = await createAdminClient()
    .from("prepared_work").select("payload")
    .eq("user_id", user.userId).eq("day", new Date().toISOString().slice(0, 10)).eq("task_hash", taskHash(task, kind))
    .maybeSingle();
  if (error || !data) return NextResponse.json({ ok: true, draft: null }, { headers: { "Cache-Control": "private, no-store" } });
  const p = (data as { payload?: { degraded?: boolean; variants?: unknown[]; sections?: unknown[] } }).payload ?? {};
  return NextResponse.json({
    ok: true,
    draft: { degraded: Boolean(p.degraded), variants: Array.isArray(p.variants) ? p.variants.map(() => 1) : [], sections: Array.isArray(p.sections) ? p.sections.map(() => 1) : [] },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
