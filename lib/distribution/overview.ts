/**
 * lib/distribution/overview.ts — the daily action queue and verified metrics.
 * Everything here is derived from what the founder has logged. No logged data
 * means null metrics and an explicit empty state, never a made-up number.
 */
import type { Experiment } from "./experiments";

export type ConvStatus = "queued" | "replied" | "followed_up" | "interested" | "interview" | "trial" | "paid" | "closed";
export const CONV_STATUSES: ConvStatus[] = ["queued", "replied", "followed_up", "interested", "interview", "trial", "paid", "closed"];

export interface Conversation {
  id: string;
  platform: string;
  url?: string | null;
  excerpt?: string | null;
  segment?: string | null;
  relevance?: string | null;
  suggested_reply?: string | null;
  status: ConvStatus;
  next_action?: string | null;
  notes?: string | null;
  last_contacted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Draft { id: string; platform: string; body: string; updated_at: string; diagnosis?: unknown }

export type ActionKind = "contact" | "engage" | "write" | "learn";
export interface Action { id: string; kind: ActionKind; title: string; why: string; rank: number; ref?: { type: "conversation" | "experiment" | "draft"; id: string } }

export interface Metric { label: string; value: number | null; sub: string; source: string }

export interface Overview {
  metrics: Metric[];
  actions: Action[];
  interactionsToday: number;
  insight: { text: string; basis: string } | null;
}

const DAY = 86_400_000;
const WARM: ConvStatus[] = ["interested", "interview", "trial", "paid"];
const REAL: ConvStatus[] = ["replied", "followed_up", "interested", "interview", "trial", "paid"];

const within = (iso: string | null | undefined, ms: number, now: number) => !!iso && now - new Date(iso).getTime() <= ms;
const short = (t: string | null | undefined, n = 60) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, n) || "a saved conversation";

export function buildOverview(d: { conversations: Conversation[]; experiments: Experiment[]; drafts: Draft[] }, now = Date.now()): Overview {
  const { conversations: cs, experiments: es } = d;
  const contactedToday = cs.filter((c) => within(c.last_contacted_at, DAY, now));
  const interactionsToday = contactedToday.length;

  const meaningful7 = cs.filter((c) => REAL.includes(c.status) && within(c.last_contacted_at, 7 * DAY, now)).length;
  const qualified = cs.filter((c) => WARM.includes(c.status)).length;
  const logged = cs.length > 0;
  const expWithActivations = es.some((e) => e.activations != null);
  const expWithPaid = es.some((e) => e.paid != null);
  const metrics: Metric[] = [
    { label: "Meaningful conversations", value: logged ? meaningful7 : null, sub: "Last 7 days", source: "Your conversation log" },
    { label: "Qualified founders", value: logged ? qualified : null, sub: "Interested, interviewing, trialling or paid", source: "Your conversation log" },
    { label: "Product activations", value: expWithActivations ? es.reduce((s, e) => s + (e.activations ?? 0), 0) : null, sub: "Entered on experiments", source: "Entered by you" },
    { label: "Paid conversions", value: expWithPaid ? es.reduce((s, e) => s + (e.paid ?? 0), 0) : null, sub: "Entered on experiments", source: "Entered by you" },
  ];

  const actions: Action[] = [];
  // The accountability rule always comes first.
  if (interactionsToday === 0) {
    actions.push({ id: "rule-contact", kind: "contact", rank: 100, title: "Make one real contact today", why: "Before you improve this tool, talk to a potential customer. Reply to a discussion or message a founder." });
  }
  for (const c of cs.filter((x) => (x.status === "interested" || x.status === "followed_up") && !within(x.last_contacted_at, 3 * DAY, now))) {
    actions.push({ id: `fu-${c.id}`, kind: "contact", rank: 90, title: `Follow up: ${short(c.excerpt)}`, why: "Someone showed interest and has not heard from you in 3+ days.", ref: { type: "conversation", id: c.id } });
  }
  for (const c of cs.filter((x) => x.status === "queued").slice(0, 3)) {
    actions.push({ id: `q-${c.id}`, kind: "engage", rank: 70, title: `Join: ${short(c.excerpt)}`, why: c.relevance?.trim() || "Queued discussion. Contribute before you pitch.", ref: { type: "conversation", id: c.id } });
  }
  for (const e of es.filter((x) => x.status !== "planned" && x.impressions == null && x.run_on && now - new Date(x.run_on).getTime() > 2 * DAY)) {
    actions.push({ id: `rec-${e.id}`, kind: "learn", rank: 80, title: `Record results: ${short(e.hypothesis)}`, why: "Posted over 2 days ago with no results logged. Early numbers are the cheapest to capture.", ref: { type: "experiment", id: e.id } });
  }
  for (const e of es.filter((x) => x.status === "done" && !x.learning?.trim())) {
    actions.push({ id: `learn-${e.id}`, kind: "learn", rank: 60, title: `Write the learning: ${short(e.hypothesis)}`, why: "A finished experiment with no recorded learning teaches nothing next time.", ref: { type: "experiment", id: e.id } });
  }
  if (!es.some((e) => within(e.run_on, 7 * DAY, now))) {
    actions.push({ id: "exp-new", kind: "write", rank: 50, title: "Run one writing experiment", why: "No experiment in the last 7 days. Test one specific hook, not more volume." });
  }
  actions.sort((a, b) => b.rank - a.rank);

  return { metrics, actions: actions.slice(0, 6), interactionsToday, insight: insightFrom(es, cs) };
}

/** An insight only when logged data supports it; otherwise none. */
export function insightFrom(es: Experiment[], cs: Conversation[]): Overview["insight"] {
  const scored = es.filter((e) => (e.impressions ?? 0) >= 100);
  if (scored.length >= 2) {
    const reach = scored.reduce((s, e) => s + (e.impressions ?? 0), 0);
    const people = scored.reduce((s, e) => s + (e.qualified_founders ?? 0) + (e.meaningful_exchanges ?? 0), 0);
    if (people / reach < 0.005) {
      return { text: "Your posts are reaching people but starting few conversations. Test a more specific, experience-based opening before increasing volume.", basis: `${scored.length} experiments, ${reach.toLocaleString()} impressions, ${people} conversations or qualified founders logged.` };
    }
  }
  if (cs.length >= 5 && cs.every((c) => c.status === "queued" || c.status === "closed")) {
    return { text: "You have saved conversations but none have moved past the queue. Reply to the first one today.", basis: `${cs.length} conversations logged, none replied to.` };
  }
  return null;
}
