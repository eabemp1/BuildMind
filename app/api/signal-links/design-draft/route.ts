/**
 * POST /api/signal-links/design-draft { draft, projectId? } -> { ok, sections }
 * Drafts the benefits, steps and closing lines for a landing page from the founder's own copy. Nothing is saved or
 * published. Anything that states a number, experience or term the founder never gave is dropped.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { callModelJSON } from "@/lib/ai-providers";
import { loadProject } from "@/lib/prep/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSectionsPrompt, guardSections } from "@/lib/landing/design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { draft?: unknown; projectId?: unknown };
  const draft = typeof b.draft === "string" ? b.draft.trim() : "";
  if (draft.length < 20) return NextResponse.json({ ok: false, error: "Write the landing copy first." }, { status: 400 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Unavailable right now." }, { status: 503 });
  const blocked = await gateAIUsage(user.userId, "core");
  if (blocked) return blocked;

  const projectId = typeof b.projectId === "string" && UUID.test(b.projectId) ? b.projectId : null;
  const project = await loadProject(createAdminClient(), user.userId, projectId);
  let raw: unknown = null;
  try {
    raw = await callModelJSON<unknown>([{ role: "user", content: buildSectionsPrompt({ name: project.name, draft, what: project.description || project.problem, customer: project.targetUsers }) }]);
  } catch { /* handled below */ }
  if (raw === null) return NextResponse.json({ ok: false, error: "BuildMind could not draft the sections just now. Nothing was changed." }, { status: 502 });
  const sections = guardSections(raw, [draft, project.name, project.description, project.problem, project.targetUsers].join(" "));
  return NextResponse.json({ ok: true, sections });
}
