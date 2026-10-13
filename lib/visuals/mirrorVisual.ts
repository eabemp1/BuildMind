/** Founder Mirror as a VisualSpec: what the model believes, how sure it is, and how often it has been right. */
import type { VisualSpec, VisualTone } from "./spec";

export interface MirrorLite {
  beliefs: Array<{ belief: string; confidence: number; trend: "strengthening" | "weakening" | "persistent" | "emerging" }>;
  skills: Array<{ label: string; level: number; progress: number; trend: string }>;
  signals: Array<{ title: string; severity: string; decayed_confidence: number }>;
  strengthening_patterns: string[]; weakening_patterns: string[]; may_be_wrong_about: string[];
  self_reported_accuracy: { sample_size: number; accuracy_pct: number | null; summary: string };
}

const TREND_TONE: Record<string, VisualTone> = { strengthening: "good", weakening: "bad", persistent: "accent", emerging: "neutral" };
const pct = (c: number) => Math.round((c <= 1 ? c * 100 : c));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function buildMirrorVisual(m: MirrorLite): VisualSpec {
  const panels: VisualSpec["panels"] = [];
  const acc = m.self_reported_accuracy;
  panels.push({ type: "stats", items: [
    { label: "Beliefs held", value: String(m.beliefs.length), tone: "accent" },
    { label: "Outcomes checked", value: String(acc.sample_size) },
    { label: "Match rate", value: acc.accuracy_pct == null ? "Learning" : `${acc.accuracy_pct}%`, tone: acc.accuracy_pct == null ? "neutral" : acc.accuracy_pct >= 70 ? "good" : "warn" },
  ] });
  if (acc.accuracy_pct != null) panels.push({ type: "gauge", title: "How often the model was right", value: acc.accuracy_pct, max: 100, label: `${acc.accuracy_pct}%`, caption: clip(acc.summary, 120), tone: acc.accuracy_pct >= 70 ? "good" : acc.accuracy_pct >= 45 ? "warn" : "bad" });
  if (m.beliefs.length) panels.push({ type: "bars", title: "What it believes about you", caption: "Confidence, coloured by direction of change.", unit: "%", items: [...m.beliefs].sort((a, b) => b.confidence - a.confidence).slice(0, 8).map((b) => ({ label: clip(b.belief, 38), value: pct(b.confidence), max: 100, note: b.trend, tone: TREND_TONE[b.trend] ?? "neutral" })) });
  if (m.skills.length >= 3) panels.push({ type: "radar", title: "Skill shape", caption: "Level progress per skill.", axes: m.skills.slice(0, 8).map((s) => ({ label: clip(s.label, 16), value: Math.round((s.progress <= 1 ? s.progress : s.progress / 100) * 100), max: 100 })) });
  if (m.signals.length) panels.push({ type: "signals", title: "Active signals", items: m.signals.slice(0, 5).map((s) => ({ label: clip(s.title, 70), severity: (["low", "medium", "high", "critical"].includes(s.severity) ? s.severity : "medium") as "low" | "medium" | "high" | "critical", confidence: s.decayed_confidence })) });
  if (m.strengthening_patterns.length || m.weakening_patterns.length) panels.push({ type: "tree", title: "What is shifting", root: "Patterns", branches: [
    ...(m.strengthening_patterns.length ? [{ label: "Strengthening", tone: "good" as VisualTone, children: m.strengthening_patterns.slice(0, 4).map((l) => ({ label: clip(l, 70) })) }] : []),
    ...(m.weakening_patterns.length ? [{ label: "Weakening", tone: "bad" as VisualTone, children: m.weakening_patterns.slice(0, 4).map((l) => ({ label: clip(l, 70) })) }] : []),
  ] });
  if (m.may_be_wrong_about.length) panels.push({ type: "callout", title: "It may be wrong about", text: m.may_be_wrong_about.slice(0, 3).join(" · "), tone: "warn" });
  return { title: "Your Founder Mirror, drawn", subtitle: "A revisable model, not a verdict", panels };
}
