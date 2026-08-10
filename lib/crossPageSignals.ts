/**
 * lib/crossPageSignals.ts
 *
 * Part of the "page coherence" work — the founder's own words were "nothing
 * encourages me on why I should open this page or the next." This computes
 * a small set of sharp, data-backed reasons to visit specific pages, surfaced
 * as nav badges (see components/layout/sidebar.tsx) and — for the strongest
 * one — a Today header callout.
 *
 * DESIGN CONSTRAINT: this runs on every sidebar mount, so it must stay
 * cheap. It deliberately does NOT re-run the full founder-intelligence
 * pipeline (lib/founderIntelligence.ts) just to populate a nav badge — that
 * pipeline does 9 parallel DB queries and is meant for one full generation
 * per day, not a background poll on every page. Instead this reads directly
 * from small, already-materialized fields (founder_memory.avoidance_zones,
 * founder_context.pending_stage_transition, a lightweight milestones query)
 * that other parts of the app already keep current.
 *
 * VOICE: every headline cites a real number pulled from the query, never a
 * vague "you have updates" — sharp, specific, a little blunt. This is
 * deliberate: generic nudges get ignored, a real number earned from the
 * founder's own data doesn't.
 */

import type { createAdminClient } from "@/lib/supabase/admin";

export interface CrossPageSignal {
  page: "progress" | "founder-mirror" | "projects";
  href: string;
  /** Short — this is what renders as the nav badge text itself. */
  badge: string;
  /** One sharp sentence — used for the Today header callout when this is
   *  the single strongest signal across all pages. */
  headline: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getCrossPageSignals(
  admin: AdminClient,
  userId: string,
  projectId: string | null,
): Promise<CrossPageSignal[]> {
  const signals: CrossPageSignal[] = [];

  const [memoryRes, contextRes, milestonesRes] = await Promise.allSettled([
    admin.from("founder_memory").select("avoidance_zones").eq("user_id", userId).maybeSingle(),
    admin.from("founder_context").select("pending_stage_transition").eq("user_id", userId).maybeSingle(),
    projectId
      ? admin.from("milestones").select("title, status, target_date").eq("project_id", projectId).eq("user_id", userId).neq("status", "completed")
      : Promise.resolve({ data: [] }),
  ]);

  // ── Founder Mirror: avoidance patterns detected ──────────────────────────
  // Deliberately counts avoidance_zones, not the full trend-accuracy system
  // in lib/founderMirror.ts — that needs the full intelligence state, too
  // expensive to run here. Zone count is cheap, real, and already clean
  // (post the actionCategoryLabel() fix), so it's a fair proxy: more zones
  // detected genuinely means more for Founder Mirror to show you.
  if (memoryRes.status === "fulfilled") {
    const zones = (memoryRes.value.data as { avoidance_zones?: string[] } | null)?.avoidance_zones ?? [];
    const count = zones.filter(Boolean).length;
    if (count > 0) {
      signals.push({
        page: "founder-mirror",
        href: "/founder-mirror",
        badge: `${count} pattern${count === 1 ? "" : "s"}`,
        headline: count === 1
          ? `You're avoiding one specific kind of work — Founder Mirror names it.`
          : `${count} avoidance patterns detected — Founder Mirror shows exactly what you're routing around.`,
      });
    }
  }

  // ── Projects: a stage-up is on the table ─────────────────────────────────
  if (contextRes.status === "fulfilled") {
    const pending = (contextRes.value.data as { pending_stage_transition?: {
      project_id?: string; recommended_stage?: string | null;
    } | null } | null)?.pending_stage_transition;
    if (pending?.recommended_stage) {
      signals.push({
        page: "projects",
        href: pending.project_id ? `/projects/${pending.project_id}` : "/projects",
        badge: "ready",
        headline: `You're hitting ${pending.recommended_stage}-stage signals — see why on Projects.`,
      });
    }
  }

  // ── Progress: milestones actually at risk ────────────────────────────────
  // Cheap client-side pacing check (days remaining vs. days elapsed) rather
  // than importing computeMilestonePacing()'s full scoring — this only
  // needs a rough "is this genuinely close to late" signal for a badge,
  // not the precise risk tier Progress itself computes when you open it.
  if (milestonesRes.status === "fulfilled") {
    const rows = (milestonesRes.value.data as Array<{ title?: string; target_date?: string | null }> | null) ?? [];
    const now = Date.now();
    const atRisk = rows.filter((m) => {
      if (!m.target_date) return false;
      const daysLeft = (new Date(m.target_date).getTime() - now) / 86_400_000;
      return daysLeft <= 3; // due within 3 days or already overdue, still open
    });
    if (atRisk.length > 0) {
      signals.push({
        page: "progress",
        href: "/progress",
        badge: `${atRisk.length} at risk`,
        headline: atRisk.length === 1
          ? `"${atRisk[0].title}" is due within days and still open — Progress has the full picture.`
          : `${atRisk.length} milestones are due within days and still open — Progress has the full picture.`,
      });
    }
  }

  return signals;
  }
