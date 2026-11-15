/**
 * lib/projectFacts.ts: one list of what BuildMind knows about the founder's situation, shared by Coach, Today
 * and the Work tools so they stop disagreeing. Each fact carries where it came from and when.
 *
 * Sources: "founder" (they said it or corrected it), "project" (the project's own fields),
 * "reflection" (said in a saved reflection), "settings" (limits, test run). Nothing here is inferred by a model.
 * A correction from the founder always wins, and keeps the older value in the history.
 * Stored in user_behavior_state under "project_facts" (corrections only), so no migration.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConstraints } from "@/lib/constraints";
import { loadTestMode } from "@/lib/testMode";
import { lacksContacts } from "@/lib/todayFallbacks";

export const FACTS_KEY = "project_facts";

/** The facts a founder can state or correct by hand. */
export const CORRECTABLE = {
  contacts: "People you already know in your customer group",
  target_location: "Where your customers are",
  founder_location: "Where you are",
  team: "Who is on the team",
  product_status: "Is there a product people can use yet",
} as const;
export type CorrectableKey = keyof typeof CORRECTABLE;

export interface Correction { key: CorrectableKey; value: string; at: string }
export interface Fact { key: string; label: string; value: string | null; source: "founder" | "project" | "reflection" | "settings" | "unknown"; at: string | null }

export function parseCorrections(v: unknown): Correction[] {
  const items = (v as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: Correction[] = [];
  for (const it of items.slice(-60)) {
    const o = it as Record<string, unknown>;
    const key = String(o?.key ?? "") as CorrectableKey;
    const value = typeof o?.value === "string" ? o.value.trim().slice(0, 200) : "";
    const at = typeof o?.at === "string" ? o.at : "";
    if (key in CORRECTABLE && value && at) out.push({ key, value, at });
  }
  return out;
}

/** The newest correction per key. Older ones stay in the stored history. */
export function latestCorrections(c: Correction[]): Map<CorrectableKey, Correction> {
  const m = new Map<CorrectableKey, Correction>();
  for (const x of [...c].sort((a, b) => a.at.localeCompare(b.at))) m.set(x.key, x);
  return m;
}

export interface FactsInput {
  project: { name?: string; description?: string; problem?: string; targetUsers?: string; stage?: string } | null;
  recentBlockers: string[];
  corrections: Correction[];
  constraints: { minutesPerDay: number | null; monthlyBudget: number | null } | null;
  testMode: boolean;
}

/** Pure: assemble the list. Unknown facts are listed as unknown, never filled in. */
export function assembleFacts(i: FactsInput): Fact[] {
  const fixed = latestCorrections(i.corrections);
  const facts: Fact[] = [];
  const add = (key: string, label: string, value: string | null | undefined, source: Fact["source"], at: string | null = null) =>
    facts.push({ key, label, value: value && value.trim() ? value.trim() : null, source: value && value.trim() ? source : "unknown", at });
  const fx = (k: CorrectableKey) => fixed.get(k);

  add("product", "Product", [i.project?.name, i.project?.description].filter(Boolean).join(": "), "project");
  add("customer", "Customer", i.project?.targetUsers, "project");
  add("problem", "Problem", i.project?.problem, "project");
  add("stage", "Stage", i.project?.stage, "project");

  const noContact = lacksContacts(i.recentBlockers);
  add("contacts", CORRECTABLE.contacts,
    fx("contacts")?.value ?? (noContact ? `None. The founder said: "${noContact.slice(0, 120)}"` : null),
    fx("contacts") ? "founder" : "reflection", fx("contacts")?.at ?? null);
  add("target_location", CORRECTABLE.target_location, fx("target_location")?.value, "founder", fx("target_location")?.at ?? null);
  add("founder_location", CORRECTABLE.founder_location, fx("founder_location")?.value, "founder", fx("founder_location")?.at ?? null);
  add("team", CORRECTABLE.team, fx("team")?.value, "founder", fx("team")?.at ?? null);
  add("product_status", CORRECTABLE.product_status, fx("product_status")?.value, "founder", fx("product_status")?.at ?? null);

  const c = i.constraints;
  add("time", "Time per day", c?.minutesPerDay != null ? `${c.minutesPerDay} minutes` : null, "settings");
  add("budget", "Money per month", c?.monthlyBudget != null ? (c.monthlyBudget === 0 ? "none" : String(c.monthlyBudget)) : null, "settings");
  if (i.testMode) add("test_run", "Test run", "Yes. Nothing here is real customer or market evidence.", "settings");
  return facts;
}

/** Text for any prompt. Unknowns are stated as unknown so a model does not fill the gap. */
export function factsBlock(facts: Fact[]): string {
  const known = facts.filter((f) => f.value);
  const unknown = facts.filter((f) => !f.value && ["contacts", "target_location", "founder_location", "team", "product_status"].includes(f.key));
  if (!known.length && !unknown.length) return "";
  const lines = known.map((f) => `- ${f.label}: ${f.value} (${f.source === "founder" ? "stated by the founder" : f.source === "reflection" ? "from a saved reflection" : f.source})`);
  const gaps = unknown.map((f) => `- ${f.label}: NOT KNOWN. Do not assume it. Ask, or write it as a question.`);
  const geo = "The founder's own location and the customers' location are different facts. Never use one for the other.";
  return `WHAT IS KNOWN ABOUT THIS FOUNDER'S SITUATION (the founder can correct any line; the latest correction wins):\n${[...lines, ...gaps].join("\n")}\n${geo}`;
}

export async function loadFacts(admin: SupabaseClient, userId: string, projectId?: string | null): Promise<Fact[]> {
  try {
    let pq = admin.from("projects").select("name,title,description,problem,target_users,startup_stage").eq("user_id", userId);
    pq = projectId ? pq.eq("id", projectId) : pq.order("updated_at", { ascending: false });
    const [{ data: p }, { data: refl }, { data: stored }, constraints, testMode] = await Promise.all([
      pq.limit(1).maybeSingle(),
      admin.from("reflections").select("blocker").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      admin.from("user_behavior_state").select("value").eq("user_id", userId).eq("key", FACTS_KEY).maybeSingle(),
      loadConstraints(admin, userId),
      loadTestMode(admin, userId),
    ]);
    const d = (p ?? {}) as Record<string, string | null>;
    return assembleFacts({
      project: p ? { name: d.name ?? d.title ?? "", description: d.description ?? "", problem: d.problem ?? "", targetUsers: d.target_users ?? "", stage: d.startup_stage ?? "" } : null,
      recentBlockers: ((refl ?? []) as { blocker: string | null }[]).map((r) => r.blocker ?? "").filter(Boolean),
      corrections: parseCorrections(stored?.value),
      constraints,
      testMode,
    });
  } catch {
    return [];
  }
}
