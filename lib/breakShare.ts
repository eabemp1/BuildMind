/**
 * lib/breakShare.ts
 *
 * What goes public when a founder shares a Break My Startup result.
 * An allow-list: the idea title, score, verdict, every risk with its fix, why it could survive,
 * competitors, up to three pivots and the blunt advice. Founder execution style, project ids,
 * evidence internals, the execution plan and the next-action suggestion never leave the account.
 */
import type { BreakResult } from "@/components/break-my-startup/viewTypes";

export interface BreakSharePayload {
  idea: string;
  score: number | null;
  risk: "Critical" | "High" | "Medium" | "Low";
  summary: string;
  risks: Array<{ category: string; severity: string; text: string }>;
  survive: string[];
  pivot: { title: string; why: string } | null;
  signals: Array<{ label: string; value: number }>;
  sharedAt: string;
  /** The rest of the report. Absent on links made before the full-report share. */
  full?: {
    advice: string;
    risks: Array<{ category: string; severity: string; text: string; fix: string }>;
    survive: string[];
    competitors: Array<{ name: string; weakness: string; threat: string }>;
    pivots: Array<{ title: string; why: string; step: string }>;
  };
}

const clip = (s: unknown, n: number) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

export function buildSharePayload(result: BreakResult, idea: string, now = new Date()): BreakSharePayload {
  const score = typeof result.survival_probability === "number" ? Math.max(0, Math.min(100, Math.round(result.survival_probability))) : null;
  const sev = ["Critical", "High", "Medium", "Low"].includes(result.overallRisk) ? result.overallRisk : "Medium";
  const order = { Critical: 0, High: 1, Medium: 2, Low: 3 } as Record<string, number>;
  const risks = [...(result.risks ?? [])]
    .sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
    .slice(0, 3)
    .map((r) => ({ category: clip(r.category, 40), severity: r.severity, text: clip(r.description, 150) }));
  const p = result.pivots?.[0];
  return {
    idea: clip(idea, 140) || "A startup idea",
    score,
    risk: sev,
    summary: clip(result.summary, 320),
    risks,
    survive: (result.surviveReasons ?? []).slice(0, 2).map((s) => clip(s, 130)).filter(Boolean),
    pivot: p ? { title: clip(p.title, 70), why: clip(p.why_better, 150) } : null,
    signals: (result.signalBreakdown ?? []).slice(0, 5).map((s) => ({ label: clip(s.label, 24), value: Math.max(0, Math.min(100, Math.round(s.value))) })),
    sharedAt: now.toISOString(),
    full: {
      advice: clip(result.brutal_advice, 400),
      risks: [...(result.risks ?? [])].sort((x, y) => (order[x.severity] ?? 9) - (order[y.severity] ?? 9)).slice(0, 8)
        .map((r) => ({ category: clip(r.category, 40), severity: r.severity, text: clip(r.description, 260), fix: clip(r.mitigation, 220) })),
      survive: (result.surviveReasons ?? []).slice(0, 4).map((x) => clip(x, 160)).filter(Boolean),
      competitors: (result.competitorTable ?? []).slice(0, 6).map((c) => ({ name: clip(c.name, 50), weakness: clip(c.weakness, 160), threat: clip(c.threat_level, 10) })),
      pivots: (result.pivots ?? []).slice(0, 3).map((x) => ({ title: clip(x.title, 70), why: clip(x.why_better, 180), step: clip(x.first_step, 160) })),
    },
  };
}

/** Re-validates a stored payload before rendering it publicly. */
export function readSharePayload(raw: unknown): BreakSharePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<BreakSharePayload>;
  if (typeof r.idea !== "string" || typeof r.summary !== "string" || !Array.isArray(r.risks)) return null;
  return {
    idea: clip(r.idea, 140), score: typeof r.score === "number" ? r.score : null,
    risk: (["Critical", "High", "Medium", "Low"] as const).find((x) => x === r.risk) ?? "Medium",
    summary: clip(r.summary, 320),
    risks: r.risks.slice(0, 3).map((x) => ({ category: clip(x?.category, 40), severity: clip(x?.severity, 10), text: clip(x?.text, 150) })),
    survive: Array.isArray(r.survive) ? r.survive.slice(0, 2).map((s) => clip(s, 130)) : [],
    pivot: r.pivot && typeof r.pivot === "object" ? { title: clip(r.pivot.title, 70), why: clip(r.pivot.why, 150) } : null,
    signals: Array.isArray(r.signals) ? r.signals.slice(0, 5).map((s) => ({ label: clip(s?.label, 24), value: Math.max(0, Math.min(100, Number(s?.value) || 0)) })) : [],
    sharedAt: typeof r.sharedAt === "string" ? r.sharedAt : new Date().toISOString(),
    full: readFull(r.full),
  };
}

function readFull(raw: unknown): BreakSharePayload["full"] {
  if (!raw || typeof raw !== "object") return undefined;
  const f = raw as Record<string, unknown>;
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n) : []) as Array<Record<string, unknown>>;
  return {
    advice: clip(f.advice, 400),
    risks: list(f.risks, 8).map((x) => ({ category: clip(x?.category, 40), severity: clip(x?.severity, 10), text: clip(x?.text, 260), fix: clip(x?.fix, 220) })),
    survive: (Array.isArray(f.survive) ? f.survive.slice(0, 4) : []).map((x) => clip(x, 160)).filter(Boolean),
    competitors: list(f.competitors, 6).map((x) => ({ name: clip(x?.name, 50), weakness: clip(x?.weakness, 160), threat: clip(x?.threat, 10) })),
    pivots: list(f.pivots, 3).map((x) => ({ title: clip(x?.title, 70), why: clip(x?.why, 180), step: clip(x?.step, 160) })),
  };
}

export const SEVERITY_HEX: Record<string, string> = { Critical: "#E8706A", High: "#E8A54A", Medium: "#6AA8E8", Low: "#5CC592" };

export function shareHeadline(p: BreakSharePayload): string {
  return p.score !== null ? `I ran my idea through Break My Startup: ${p.score}% survival odds.` : "I ran my idea through Break My Startup.";
}
