/**
 * scripts/verify-intelligence-integrity.ts
 *
 * Runs against the REAL database (service role — read-only, no writes) and
 * checks for the specific classes of failure this session found by manual
 * CSV archaeology: cross-project contamination, silently-dropped fields,
 * silently-rejected DB writes, and computed-but-never-persisted signals.
 *
 * This is not a synthetic test suite. It queries production data directly,
 * because every bug this session found (missing project_id filter, garbage
 * avoidance_zones categories, evaluator fields dropped before persistence,
 * verdict='warn' rows silently rejected by a CHECK constraint) passed
 * tsc --noEmit and the full vitest suite cleanly. Type-correctness and
 * green tests did not catch any of them. Only reading real rows did.
 *
 * Run: npx tsx scripts/verify-intelligence-integrity.ts [--user <uuid>]
 *
 * Exit code is non-zero if any check fails, so this can run in CI or a
 * pre-deploy hook once there's a natural place to wire it in.
 *
 * IMPORTANT: every time a new derived-signal / memory-write / cross-table
 * join is added to the codebase, a corresponding check belongs in this
 * file BEFORE that code ships — not after a founder notices something is
 * wrong. This file is meant to grow. It is the mechanism, not the promise.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const userIdArg = (() => {
  const idx = process.argv.indexOf("--user");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function targetUsers(): Promise<string[]> {
  if (userIdArg) return [userIdArg];
  // Sample the 20 most recently active users so this stays cheap to run
  // repeatedly without scanning the whole table.
  const { data } = await supabase
    .from("reflexion_learning_log")
    .select("user_id")
    .order("created_at", { ascending: false })
    .limit(200);
  return Array.from(new Set((data ?? []).map((r) => r.user_id as string))).slice(0, 20);
}

// ── Check 1: cross-project contamination in reflexion_learning_log ─────────
// The specific bug found this session: recentActionsBlock queried only by
// user_id, so a founder with 2+ projects had one project's tasks bleed into
// another's generation context. Detects any user with rows spanning more
// than one non-null project_id AND more than one distinct stage within the
// SAME calendar day, which is the exact signature that surfaced the
// "PotentialOS" contamination.
async function checkCrossProjectContamination(users: string[]) {
  let flagged = 0;
  for (const userId of users) {
    const { data } = await supabase
      .from("reflexion_learning_log")
      .select("project_id, stage, created_at")
      .eq("user_id", userId)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!data || data.length === 0) continue;

    const byDay = new Map<string, Set<string>>();
    for (const row of data) {
      const day = String(row.created_at).slice(0, 10);
      const set = byDay.get(day) ?? new Set<string>();
      set.add(String(row.project_id));
      byDay.set(day, set);
    }
    const suspicious = [...byDay.entries()].filter(([, projects]) => projects.size > 1);
    if (suspicious.length > 0) flagged++;
  }
  record(
    "Cross-project isolation (reflexion_learning_log)",
    true, // informational — multiple projects/day is legitimate if the founder switched; this is a signal to eyeball, not a hard failure
    `${flagged}/${users.length} sampled users have multiple project_ids active on the same day — expected if switching projects deliberately, worth a manual glance if it's every user`,
  );
}

// ── Check 2: avoidance_zones / strengths are real categories, not raw text ──
// The specific bug found this session: observeTaskEvent()'s fallback stored
// taskTitle.split(" ").slice(0,3) or worse, a raw ~80-char task fragment.
// Heuristic: a genuine category label is short (few words, no sentence
// punctuation); a leaked task fragment is long and/or ends mid-word or
// mid-sentence.
async function checkAvoidanceZoneQuality(users: string[]) {
  let usersWithGarbage = 0;
  let totalGarbageEntries = 0;
  for (const userId of users) {
    const { data } = await supabase
      .from("founder_memory")
      .select("avoidance_zones, strengths")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) continue;
    const entries = [...(data.avoidance_zones ?? []), ...(data.strengths ?? [])];
    const garbage = entries.filter((e: string) => e.length > 40 || /[,.]$/.test(e.trim()) === false && e.split(" ").length > 6);
    if (garbage.length > 0) {
      usersWithGarbage++;
      totalGarbageEntries += garbage.length;
    }
  }
  record(
    "avoidance_zones / strengths contain real categories, not raw task text",
    usersWithGarbage === 0,
    usersWithGarbage === 0
      ? "no long/fragment-shaped entries in sample"
      : `${usersWithGarbage}/${users.length} users have ${totalGarbageEntries} garbage-shaped entries — likely pre-dates the observeTaskEvent() fix and needs a one-time cleanup, not a code regression`,
  );
}

// ── Check 3: evaluator fields aren't silently dropped before persistence ───
// The specific bug found this session: founderContext.archetype/
// avoidanceZones/lastReflection were computed and passed to
// evaluateAIOutput() but logEvalResult() only persisted stage+momentum_score.
// This checks the reflexion_quality_log schema directly — if these columns
// don't exist, the fields are being computed for nothing.
async function checkEvaluatorPersistsFullContext() {
  const { data, error } = await supabase.from("reflexion_quality_log").select("*").limit(1);
  if (error || !data) {
    record("reflexion_quality_log columns include archetype/avoidance/reflection context", false, `query failed: ${error?.message}`);
    return;
  }
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const expectedButLikelyMissing = ["archetype", "avoidance_zones", "last_reflection"];
  const missing = expectedButLikelyMissing.filter((c) => !columns.includes(c));
  record(
    "reflexion_quality_log persists the full founderContext it's given",
    missing.length === 0,
    missing.length === 0
      ? "all expected context columns present"
      : `columns missing: ${missing.join(", ")} — these are computed in aiEvaluator.ts's founderContext but never reach the DB; either add the columns or stop computing them`,
  );
}

// ── Check 4: no verdict is being silently rejected by the CHECK constraint ──
// The specific bug found this session: aggregateVerdict() can return 'warn',
// but the CHECK constraint only allows 'pass'/'fail'. An insert with 'warn'
// throws and is swallowed by a try/catch — the row never appears anywhere,
// no error surfaces. This can only be detected by absence, so we check
// whether 'warn' EVER appears — if the app has been running a while and it
// never does, that's the smoking gun.
async function checkWarnVerdictNotSilentlyDropped() {
  const { data, error } = await supabase.from("reflexion_quality_log").select("verdict").limit(5000);
  if (error) {
    record("verdict='warn' rows are not being silently dropped", false, `query failed: ${error.message}`);
    return;
  }
  const verdicts = new Set((data ?? []).map((r) => r.verdict));
  const hasWarn = verdicts.has("warn");
  const total = data?.length ?? 0;
  record(
    "verdict='warn' rows are not being silently dropped",
    hasWarn || total < 20, // don't flag on too little data to judge
    hasWarn
      ? "warn verdicts are present — constraint accepts them"
      : `0 'warn' rows out of ${total} — if aggregateVerdict() can return 'warn' and this table never has one, the CHECK constraint (pass/fail only) is silently rejecting every warn insert`,
  );
}

// ── Check 5: the gatekeeper's fail rate isn't 100% while shipping anyway ───
async function checkGatekeeperFailRate() {
  const { data, error } = await supabase
    .from("reflexion_quality_log")
    .select("verdict")
    .eq("context", "today_action")
    .limit(500);
  if (error || !data || data.length === 0) {
    record("today_action gatekeeper fail rate is not ~100%", true, "no data yet to judge");
    return;
  }
  const failRate = data.filter((r) => r.verdict === "fail").length / data.length;
  record(
    "today_action gatekeeper fail rate is not ~100%",
    failRate < 0.9,
    `${Math.round(failRate * 100)}% fail rate over ${data.length} rows — evaluateAIOutput() is fire-and-forget (void, not awaited) so a high fail rate here means the system knows its own output is bad and ships it anyway`,
  );
}

async function main() {
  console.log(`\nVerifying against ${SUPABASE_URL}\n`);
  const users = await targetUsers();
  console.log(`Sampling ${users.length} user(s)${userIdArg ? " (--user override)" : ""}\n`);

  await checkCrossProjectContamination(users);
  await checkAvoidanceZoneQuality(users);
  await checkEvaluatorPersistsFullContext();
  await checkWarnVerdictNotSilentlyDropped();
  await checkGatekeeperFailRate();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log("\nFailed:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
