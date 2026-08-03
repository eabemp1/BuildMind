/**
 * /weekly-share — RETIRED as a standalone page.
 *
 * This page used to independently aggregate streak, score, momentum, and
 * tasks via three separate API calls (/api/data/overview,
 * /api/founder-context/scorecard, /api/ai/weekly-report) with its own
 * fallback chain for streak — a fourth, separate source of the same
 * numbers that /progress, /reports, and /overview also compute, which is
 * exactly the kind of drift that caused real bugs earlier (streak/momentum
 * mismatches between pages, fixed across two prior sessions).
 *
 * /progress's "This Week" tab now computes the same information correctly
 * via the single shared lib/weeklyPulseData.ts, and already has its own
 * Share and Download-image buttons (components/WeeklyPulseCard.tsx). This
 * route now just redirects there instead of maintaining a second, drifting
 * implementation of the same feature.
 */

import { redirect } from "next/navigation";

export default function WeeklySharePage() {
  redirect("/progress");
}
