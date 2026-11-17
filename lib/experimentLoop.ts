/**
 * lib/experimentLoop.ts: Evidence -> offer -> founder action -> recorded result -> next recommendation. Pure and client-safe.
 *
 * Nothing here is written by a model. Evidence is what the founder entered and how sure it is (assumption, founder report,
 * observed). An offer is the founder's own text, versioned. The stage decides what kind of offer makes sense and what is
 * still unknown. The next recommendation is built from those records and says which ones it used.
 */
import { effectiveEvents, nextMove, tally, type Experiment, type ExperimentEvent } from "@/lib/experiments";

// ── Stage ───────────────────────────────────────────────────────────────────
// BuildMind's own stages are Idea → Validation → MVP → Launch → Growth. The loop reads them like this.
export const LOOP_STAGES = ["idea", "validation", "build", "first_revenue", "after_revenue"] as const;
export type LoopStage = (typeof LOOP_STAGES)[number];
export const LOOP_STAGE_LABEL: Record<LoopStage, string> = {
  idea: "Idea", validation: "Validation", build: "Build", first_revenue: "First revenue", after_revenue: "After revenue",
};

/**
 * The founder's own choice wins. Otherwise the project stage, except that a confirmed payment moves a Launch project
 * to "after revenue", and nothing else moves a stage. Unknown stages are read as Idea, the most cautious.
 */
export function loopStage(chosen: string | null | undefined, projectStage: string | null | undefined, hasConfirmedPayment: boolean): LoopStage {
  const c = LOOP_STAGES.find((s) => s === chosen);
  if (c) return c;
  const p = (projectStage ?? "").trim().toLowerCase();
  if (p === "validation") return "validation";
  if (p === "mvp" || p === "build") return "build";
  if (p === "launch") return hasConfirmedPayment ? "after_revenue" : "first_revenue";
  if (p === "growth") return "after_revenue";
  return "idea";
}

export interface OfferGuide { what: string; notYet: string | null; fields: Array<keyof OfferFields>; priceLabel: string }
export const OFFER_GUIDE: Record<LoopStage, OfferGuide> = {
  idea: { what: "A problem statement and an invitation to talk. Not a sales offer yet.", notYet: "Do not offer a product or a price at this stage.", fields: ["problem", "scope"], priceLabel: "" },
  validation: { what: "A specific solution or pilot you could offer, and the concrete answer you will ask for.", notYet: "Interest is not a sale. Record interest, a no, a pilot agreement and payment separately.", fields: ["problem", "solution", "scope", "price_hypothesis"], priceLabel: "Price to test (a guess, not a fact)" },
  build: { what: "A working demonstration, or a limited version you can really deliver today.", notYet: "Only claim what works now. Say what does not work yet.", fields: ["problem", "solution", "availability", "scope", "proof"], priceLabel: "" },
  first_revenue: { what: "A small paid pilot or product offer: what is included, what is not, the proof you have and a price to test.", notYet: "The price is a hypothesis until someone pays it.", fields: ["problem", "solution", "availability", "scope", "proof", "price_hypothesis"], priceLabel: "Price to test (a guess, not a fact)" },
  after_revenue: { what: "A refined or repeatable version of what already sold.", notYet: "Repeat sales are what to find out, so treat the next sale as a test.", fields: ["problem", "solution", "availability", "scope", "proof", "price_hypothesis"], priceLabel: "Price to test (a guess, not a fact)" },
};

// ── Evidence ────────────────────────────────────────────────────────────────
export const EVIDENCE_KINDS = ["conversation", "enquiry", "observation", "assumption"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const EVIDENCE_STATUSES = ["assumption", "founder_report", "observed"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = { conversation: "A conversation", enquiry: "An enquiry", observation: "Something I saw", assumption: "An assumption" };
export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = { assumption: "Assumption", founder_report: "You reported this", observed: "Observed and checkable" };

export interface Evidence { id?: string; kind: EvidenceKind; status: EvidenceStatus; note: string; source: string; source_date: string | null; last_checked: string | null; created_at: string; synthetic?: boolean }
export interface OfferFields { problem: string; solution: string; availability: string; scope: string; proof: string; price_hypothesis: string }
export interface Offer extends OfferFields { id?: string; version: number; evidence_ids?: string[]; created_at: string; synthetic?: boolean }

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n) : "");
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

export function parseEvidence(b: unknown): { ok: true; value: { kind: EvidenceKind; status: EvidenceStatus; note: string; source: string; source_date: string | null } } | { ok: false; error: string } {
  const o = (b ?? {}) as Record<string, unknown>;
  const kind = EVIDENCE_KINDS.find((k) => k === o.kind);
  if (!kind) return { ok: false, error: "Pick what kind of evidence this is." };
  const note = clip(o.note, 500);
  if (note.length < 5) return { ok: false, error: "Say what you saw or heard, in a sentence." };
  // An assumption is always an assumption. Anything else needs the founder to say how they know.
  const asked = EVIDENCE_STATUSES.find((s) => s === o.status);
  const status: EvidenceStatus = kind === "assumption" ? "assumption" : asked && asked !== "assumption" ? asked : "founder_report";
  const source = clip(o.source, 300);
  // "Observed" means someone else could check it, so it needs a source to point to.
  if (status === "observed" && !source) return { ok: false, error: "To call this observed, say where someone could check it. Otherwise mark it as your report." };
  return { ok: true, value: { kind, status, note, source, source_date: isoDate(o.source_date) } };
}

export function parseOffer(b: unknown): { ok: true; value: OfferFields & { evidence_ids: string[] } } | { ok: false; error: string } {
  const o = (b ?? {}) as Record<string, unknown>;
  const v: OfferFields = { problem: clip(o.problem, 400), solution: clip(o.solution, 400), availability: clip(o.availability, 300), scope: clip(o.scope, 400), proof: clip(o.proof, 400), price_hypothesis: clip(o.price_hypothesis, 120) };
  if (!v.problem) return { ok: false, error: "Say the problem this is about." };
  const ids = Array.isArray(o.evidence_ids) ? (o.evidence_ids as unknown[]).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20) : [];
  return { ok: true, value: { ...v, evidence_ids: ids } };
}

const DAY = 86_400_000;
export const STALE_DAYS = 30;
/** When the evidence was last known to be true: the later of its source date and the last time the founder checked it. */
export function lastKnown(e: Pick<Evidence, "source_date" | "last_checked" | "created_at">): string {
  return [e.last_checked, e.source_date, e.created_at].filter((x): x is string => !!x).sort().pop() as string;
}
export const isStale = (e: Pick<Evidence, "source_date" | "last_checked" | "created_at" | "kind">, now = Date.now()) =>
  e.kind !== "assumption" && now - Date.parse(lastKnown(e)) > STALE_DAYS * DAY;

/** Evidence that counts: not from a test run. */
export const eligibleEvidence = (list: Evidence[]) => list.filter((e) => !e.synthetic);

export interface Knowledge { known: string[]; assumed: string[]; unknown: string[] }
const short = (t: string, n = 110) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** What is known, what is only assumed, and what nobody has found out yet. */
export function knowledge(stage: LoopStage, evidence: Evidence[], offer: Offer | null, events: ExperimentEvent[], now = Date.now()): Knowledge {
  const ev = eligibleEvidence(evidence);
  const known: string[] = [];
  const assumed: string[] = [];
  const unknown: string[] = [];
  for (const e of ev) {
    if (e.status === "assumption") assumed.push(short(e.note));
    else {
      const stale = isStale(e, now);
      known.push(`${short(e.note)} (${EVIDENCE_STATUS_LABEL[e.status].toLowerCase()}${stale ? `, last checked over ${STALE_DAYS} days ago, may have changed` : ""})`);
    }
  }
  const t = tally(events);
  if (t.paid > 0) known.push(`${t.paid} ${t.paid === 1 ? "person has" : "people have"} paid (you confirmed it)`);
  if (t.replied + t.conversations > 0) known.push(`${t.replied + t.conversations} replied or talked with you (you confirmed it)`);

  if (!ev.length) unknown.push("No evidence recorded yet. Add one thing you saw or heard, or write down an assumption.");
  if (stage !== "idea" && !offer) unknown.push("No offer written yet.");
  if (offer) {
    const guide = OFFER_GUIDE[stage];
    const label: Record<keyof OfferFields, string> = { problem: "the problem", solution: "what you are offering", availability: "whether it works and can be delivered today", scope: "what is and is not included", proof: "your proof", price_hypothesis: "the price" };
    for (const f of guide.fields) if (!offer[f]) unknown.push(`Not stated: ${label[f]}.`);
    if (offer.price_hypothesis) assumed.push(`Price ${offer.price_hypothesis} is a guess until someone pays it.`);
    if (offer.proof && !ev.some((e) => e.status !== "assumption")) unknown.push("The proof in your offer is not backed by any evidence entry.");
  }
  if (t.paid === 0 && (stage === "first_revenue" || stage === "after_revenue")) unknown.push("Whether anyone will pay: no confirmed payment yet.");
  return { known, assumed, unknown };
}

export interface LoopNext { headline: string; why: string; because: string[] }

/** One next step, with the records it rests on. Outcome rules come from nextMove; this adds what must exist before them. */
export function loopNext(stage: LoopStage, evidence: Evidence[], offer: Offer | null, events: ExperimentEvent[], milestoneTitle?: string | null): LoopNext {
  const ev = eligibleEvidence(evidence);
  const t = tally(events);
  const real = effectiveEvents(events).length;
  const solid = ev.filter((e) => e.status !== "assumption").length;
  const because: string[] = [
    `Stage: ${LOOP_STAGE_LABEL[stage]}`,
    ...(milestoneTitle ? [`Milestone: ${milestoneTitle}`] : []),
    `${solid} evidence ${solid === 1 ? "entry" : "entries"} you reported or observed, ${ev.length - solid} assumption${ev.length - solid === 1 ? "" : "s"}`,
    offer ? `Offer version ${offer.version}` : "No offer yet",
    `${real} confirmed outcome${real === 1 ? "" : "s"} recorded`,
  ];
  if (!ev.length && !real) return { headline: "Write down one thing you actually saw or heard about this problem, or mark one belief as an assumption.", why: "Everything after this rests on it, and BuildMind will not make one up.", because };
  if (stage !== "idea" && !offer) return { headline: `Write the offer for this stage. ${OFFER_GUIDE[stage].what}`, why: "Without a written offer there is nothing concrete to put in front of anyone.", because };
  if (offer && (stage === "build" || stage === "first_revenue" || stage === "after_revenue") && !offer.availability) return { headline: "Say what works and can be delivered today, and what does not.", why: "An offer that claims more than exists will cost you trust.", because };
  if (offer && stage === "first_revenue" && !offer.price_hypothesis) return { headline: "Put a price to test on the offer, so you can ask for a real answer.", why: "A price you have not stated cannot be accepted or refused.", because };
  const move = nextMove(t);
  if (stage === "idea" && t.paid === 0 && t.wouldPay === 0 && t.replied + t.conversations === 0 && real > 0) return { headline: move.headline, why: `${move.why} At the idea stage you are asking for a conversation, not a sale.`, because };
  return { headline: move.headline, why: move.why, because };
}

/** Coach and Work context: the loop state, with assumptions kept visibly apart from facts. */
export function loopBlock(stage: LoopStage, evidence: Evidence[], offer: Offer | null, events: ExperimentEvent[]): string {
  const k = knowledge(stage, evidence, offer, events);
  const lines = [
    `LOOP STATE (stage: ${LOOP_STAGE_LABEL[stage]}; every line is founder-entered):`,
    k.known.length ? `Known (founder reported or observed): ${k.known.join("; ")}` : "Known: nothing recorded yet.",
    k.assumed.length ? `Assumed (not verified, never present as fact): ${k.assumed.join("; ")}` : "",
    k.unknown.length ? `Unknown (say so, do not fill in): ${k.unknown.join(" ")}` : "",
    offer ? `Current offer v${offer.version}: problem "${offer.problem}"${offer.solution ? `; offering "${offer.solution}"` : ""}${offer.availability ? `; available now: "${offer.availability}"` : ""}${offer.price_hypothesis ? `; price to test (a guess): ${offer.price_hypothesis}` : ""}` : "",
    "Do not invent meetings, customers, features, testimonials, prices or privacy promises. Interest is not payment.",
  ];
  return lines.filter(Boolean).join("\n");
}

export type { Experiment };
