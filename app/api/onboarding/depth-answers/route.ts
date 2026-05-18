/**
 * app/api/onboarding/depth-answers/route.ts — Product Improvement #6
 *
 * Persists the 3 optional depth-screen answers into:
 *   - founder_memory.avoidance_zones[]  (if avoidance filled)
 *   - projects.revenue_model            (if revenueModel filled — stored in description extension)
 *   - projects.target_users             (if targetUsers filled)
 *
 * Called fire-and-forget from onboarding — never blocks navigation.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  avoidance:       z.string().max(200).optional().default(""),
  revenueModel:    z.string().max(120).optional().default(""),
  targetUsers:     z.string().max(120).optional().default(""),
  // Extended fields for richer cold-start seeding (Audit v8 PROD #3)
  biggestBlocker:  z.string().max(200).optional().default(""),
  strengths:       z.string().max(200).optional().default(""),
  cofounderStyle:  z.enum(["direct-challenger","strategic-partner","execution-coach","devil-advocate"]).optional(),
  startupStage:    z.string().max(50).optional().default(""),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { avoidance, revenueModel, targetUsers, biggestBlocker, strengths, cofounderStyle, startupStage } = schema.parse(body);

    const admin = createAdminClient();

    // 1. Persist all founder_memory fields from onboarding (Audit v8 PROD #3: cold start seeding)
    // This pre-populates behavioral signals so the first AI output feels personal,
    // not generic. The cold start problem is worst when there's no memory data.
    {
      const { data: existing } = await admin
        .from("founder_memory")
        .select("avoidance_zones, strengths, biggest_blocker")
        .eq("user_id", user.id)
        .maybeSingle();

      const currentAvoidance: string[] = existing?.avoidance_zones ?? [];
      const currentStrengths: string[] = existing?.strengths ?? [];

      const memoryUpdate: Record<string, unknown> = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };

      if (avoidance.trim()) {
        const entry = avoidance.trim().slice(0, 100);
        if (!currentAvoidance.includes(entry)) {
          memoryUpdate.avoidance_zones = [...currentAvoidance, entry];
        }
      }

      if (strengths.trim()) {
        const entry = strengths.trim().slice(0, 100);
        if (!currentStrengths.includes(entry)) {
          memoryUpdate.strengths = [...currentStrengths, entry];
        }
      }

      if (biggestBlocker.trim()) {
        memoryUpdate.biggest_blocker = biggestBlocker.trim().slice(0, 100);
      }

      if (cofounderStyle) {
        memoryUpdate.cofounder_style = cofounderStyle;
      }

      if (Object.keys(memoryUpdate).length > 2) { // more than just user_id + updated_at
        await admin.from("founder_memory").upsert(memoryUpdate, { onConflict: "user_id" });
      }
    }

    // 2. Persist target_users and revenue_model to the founder's active project
    if (targetUsers.trim() || revenueModel.trim()) {
      const { data: project } = await admin
        .from("projects")
        .select("id, description")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (project) {
        const updates: Record<string, string> = {};
        if (targetUsers.trim()) updates.target_users = targetUsers.trim();
        // revenue_model lives as a JSON extension in description metadata for now
        // (proper column added in a follow-up migration if needed)
        if (revenueModel.trim()) {
          const existingDesc = project.description ?? "";
          // Append revenue model as structured note only if not already present
          if (!existingDesc.includes("Revenue model:")) {
            updates.description = `${existingDesc}\nRevenue model: ${revenueModel.trim()}`.trim();
          }
        }
        if (Object.keys(updates).length > 0) {
          await admin.from("projects").update(updates).eq("id", project.id);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[depth-answers]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
