/**
 * scripts/eval-calibration.ts
 *
 * Read-only. Answers: when BuildMind says a task has a 70% chance of working for a founder, does it work
 * about 70% of the time? Uses resolved Founder Intelligence predictions from reflexion_learning_log.
 *
 * Run: npx tsx scripts/eval-calibration.ts [--user <uuid>]
 * Exit code 1 only on a read error. A poor result is a finding, not a failure.
 */
import { createClient } from "@supabase/supabase-js";
import { evaluateCalibration, pairFromLearningRow } from "../lib/calibrationEval";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const userIdx = process.argv.indexOf("--user");
const user = userIdx >= 0 ? process.argv[userIdx + 1] : null;

async function main() {
  const supabase = createClient(url!, key!);
  let q = supabase
    .from("reflexion_learning_log")
    .select("outcome, evidence_match_score, decision_rationale")
    .eq("prediction_source", "founder_intelligence")
    .not("evidence_match_score", "is", null)
    .limit(5000);
  if (user) q = q.eq("user_id", user);
  const { data, error } = await q;
  if (error) { console.error("Read failed:", error.message); process.exit(1); }
  const pairs = (data ?? []).map(pairFromLearningRow).filter((p): p is NonNullable<typeof p> => p !== null);
  const report = evaluateCalibration(pairs);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n${report.summary}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
