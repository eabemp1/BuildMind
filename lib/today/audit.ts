/**
 * lib/today/audit.ts — after-the-fact check of a generated task against what the founder has actually said.
 * Audit only: it never changes or blocks a task. It exists to surface the flaws a founder would otherwise have to
 * report by hand: invented product parts, a build task for something already built, users assumed that do not exist,
 * and more than one channel in a single task. Deterministic, no AI. Pure.
 */
import type { Ledger } from "@/lib/today/facts";
import { ALLOWED_PLATFORMS } from "@/lib/today/compose";
import { BUILT_RE } from "@/lib/today/builtClaim";
import { allNamedPlatforms } from "@/lib/today/platformInText";

export type AuditFinding = "assumed_component" | "built_but_asked_to_build" | "assumes_users" | "multiple_channels";

const BUILD_VERB = /\b(?:build|create|implement|code|develop|design|add|make)\b/i;
/** Product parts a task can only name if the founder has said they exist. */
const COMPONENT_TERMS = ["json", "api", "endpoint", "webhook", "database", "schema", "oauth", "sdk", "backend", "frontend", "front-end", "results page", "progress bar", "progress bars", "dashboard", "admin panel", "settings page", "login page", "sign-up page", "signup page", "payment page", "checkout page"];
const ASSUMES_USERS = /\b(?:your|the)\s+(?:last\s+\d+\s+|first\s+\d+\s+|existing\s+|current\s+)?(?:users|customers|subscribers)\b|\bpaying\s+customers\b/i;

const has = (hay: string, needle: string) => new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i").test(hay);

/** `founderText` is everything the founder wrote: project fields and reflections. */
export function auditTask(task: string, founderText: string, ledger?: Ledger): AuditFinding[] {
  const out: AuditFinding[] = [];
  const t = task ?? "";
  if (BUILD_VERB.test(t)) {
    const invented = COMPONENT_TERMS.filter((c) => has(t, c) && !has(founderText, c));
    if (invented.length > 0) out.push("assumed_component");
    if (BUILT_RE.test(founderText)) out.push("built_but_asked_to_build");
  }
  if (ledger?.facts.some((f) => f.kind === "no_users") && ASSUMES_USERS.test(t)) out.push("assumes_users");
  if (allNamedPlatforms(t, ALLOWED_PLATFORMS).length >= 2) out.push("multiple_channels");
  return out;
}
