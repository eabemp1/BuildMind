/**
 * lib/taxonomy/workSignals.ts
 *
 * Yes/no questions about a piece of work ("does this touch the outside world?",
 * "does this move revenue?"), answered from the shared task taxonomy instead of
 * a private keyword list per file. Three files used to each carry their own
 * slightly different regex for this and disagreed.
 */
import { classifyTask } from "@/lib/taxonomy/taskTaxonomy";

const LEGACY_EXTERNAL = /\b(user|customer|interview|feedback|talk(?:ed)?|call(?:ed)?|met|spoke|revenue|sale|paid|pricing|launch|publish|post|pitch|email|reach out|dm|contact)\b/i;
const LEGACY_REVENUE = /\b(revenue|sale|paid|pricing|price|charge|payment|mrr|arr|invoice|subscription|upsell|close)\b/i;

/** Phrases a founder writes about what HAPPENED (reflection text), which prove an outside party acted. */
const RESULT_OF_CONTACT =
  /\b(repl(?:y|ied)|respond(?:ed)?|response|answered|agreed|said yes|said no|signed up|sign-?ed up|signup|subscribed|booked|paid|pre-?order(?:ed)?|committed|commitment|introduc(?:ed|tion)|referred|told me|they (?:said|want|need|asked)|got \d+|\d+ (?:replies|responses|signups|sign-ups|users|calls|interviews))\b/i;

/** Work that puts the founder in contact with, or in front of, people outside the team. */
export function isExternalWork(text: string): boolean {
  const c = classifyTask(text);
  if (c.confident && c.purpose) {
    return c.purpose === "evidence" || c.purpose === "distribution" || c.purpose === "revenue" || c.domain === "Outreach & sales";
  }
  return LEGACY_EXTERNAL.test(text);
}

/** Work that can produce a real answer from a user, customer or buyer (stricter than isExternalWork). */
export function isEvidenceWork(text: string): boolean {
  const c = classifyTask(text);
  if (c.confident) return c.evidenceValue >= 60;
  return LEGACY_EXTERNAL.test(text) && /\b(user|customer|interview|feedback|pric|paid|pre-?order)\b/i.test(text);
}

export function isRevenueWork(text: string): boolean {
  const c = classifyTask(text);
  if (c.confident && c.domain) return c.domain === "Pricing & revenue" || c.leafId === "sales_calls";
  return LEGACY_REVENUE.test(text);
}

/**
 * Did this completed reflection show real external evidence? Either the task
 * itself was evidence work, or the founder's own account says someone outside
 * responded. Blocked or unfinished attempts never count (callers check outcome).
 */
export function showsUserEvidence(parts: { task?: unknown; note?: unknown; happened?: unknown; learned?: unknown }): boolean {
  const task = String(parts.task ?? "");
  const account = `${parts.note ?? ""} ${parts.happened ?? ""} ${parts.learned ?? ""}`;
  if (RESULT_OF_CONTACT.test(account)) return true;
  return isEvidenceWork(task) || (account.trim().length > 0 && isEvidenceWork(account));
}

export type FocusArea = "revenue" | "customer evidence" | "build" | "distribution" | "research" | "operations";

/** The coarse focus bucket used for "what did you actually spend this week on". */
export function focusAreaOf(text: string): FocusArea {
  const c = classifyTask(text);
  if (c.confident && c.domain) {
    switch (c.domain) {
      case "Pricing & revenue": return "revenue";
      case "Customer discovery":
      case "Outreach & sales": return c.leafId === "sales_calls" ? "revenue" : "customer evidence";
      case "Product engineering":
      case "Design & UX": return "build";
      case "Content & distribution":
      case "Launch & growth":
      case "Team & community": return "distribution";
      case "Research & strategy": return "research";
      default: return "operations";
    }
  }
  const t = text.toLowerCase();
  if (LEGACY_REVENUE.test(t)) return "revenue";
  if (/\b(message|dm|email|reach out|contact|call|talk|interview|feedback)\b/i.test(t)) return "customer evidence";
  if (/\b(build|ship|code|implement|deploy|fix|feature)\b/i.test(t)) return "build";
  if (/\b(write|post|publish|content|tweet|thread|blog)\b/i.test(t)) return "distribution";
  if (/\b(research|review|analyze|read|study|compare)\b/i.test(t)) return "research";
  return "operations";
}
