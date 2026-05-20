"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectsQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { storage } from "@/lib/storage";
import { canAccess, incrementDailyStreak } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import {
  Shield, ChevronDown, AlertTriangle, CheckCircle2,
  RefreshCw, Save, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";

// ── Types ────────────────────────────────────────────────────────────────────
type RiskSeverity = "Critical" | "High" | "Medium" | "Low";

interface RiskItem {
  category: string;
  severity: RiskSeverity;
  description: string;
  mitigation: string;
}

interface BreakResult {
  overallRisk: RiskSeverity;
  summary: string;
  risks: RiskItem[];
  survival_probability?: number;
  brutal_advice?: string;
  gated?: boolean;
  score_note?: string;
  agents?: Array<{ name: string; status: string; summary: string; confidence?: number }>;
  focusAreas?: string[];
  executionPlan?: { mvp_roadmap?: string[]; first_10_actions?: string[]; gtm_plan?: string[] } | null;
  reflexionAction?: {
    action?: string;
    rationale?: string;
    confidence?: number;
    supporting_signals?: string[];
    risks?: string[];
    log_row_id?: string | null;
  } | null;
}

type BreakApiData = {
  verdict?: string;
  kill_reasons?: string[];
  survive_reasons?: string[];
  brutal_advice?: string;
  survival_probability?: number;
  competitor_summary?: string;
  differentiation_plan?: string[];
  gated?: boolean;
  reasoning?: string[];
  agent_outputs?: Record<string, Record<string, unknown> | null>;
  agent_statuses?: Record<string, string>;
  signal_summary?: { overall_confidence?: number };
  execution_plan?: BreakResult["executionPlan"];
  reflexion_action?: BreakResult["reflexionAction"];
  focus_areas?: string[];
};

const FOCUS_AREAS = [
  "Business Model",
  "Unit Economics",
  "Market Size",
  "Competitive Moat",
  "Founder-Market Fit",
  "Tech Risk",
  "Regulatory Risk",
] as const;
type FocusArea = (typeof FOCUS_AREAS)[number];

function severityVariant(s: RiskSeverity): BadgeVariant {
  if (s === "Critical") return "danger";
  if (s === "High") return "warning";
  if (s === "Medium") return "info";
  return "neutral";
}

function overallColor(s: RiskSeverity) {
  if (s === "Critical") return "var(--bm-red)";
  if (s === "High") return "var(--bm-amber)";
  if (s === "Medium") return "var(--bm-blue)";
  return "var(--bm-green)";
}

function cleanAIText(value = ""): string {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/^[\s\S]*<\/think>/gi, "")
    .replace(/[•→⇒➜➔]/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u2026/g, "...")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function cleanAIList(items?: string[]): string[] {
  return (items ?? []).map(cleanAIText).filter(Boolean);
}

// ── Survival ring ─────────────────────────────────────────────────────────────
function SurvivalRing({ value, size = 110 }: { value: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 60 ? "var(--bm-green)" : value >= 40 ? "var(--bm-amber)" : "var(--bm-red)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (value / 100) * circ }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
          style={{ filter: `drop-shadow(0 0 5px ${color}55)` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          {value}%
        </motion.span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>survive</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BreakMyStartupPage() {
  const { plan, isLoading: planLoading } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: projects = [], isLoading: projectsLoading } = useProjectsQuery();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [customIdea, setCustomIdea] = useState("");
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [executionMode, setExecutionMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BreakResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcomeSaving, setOutcomeSaving] = useState<string | null>(null);

  // Pre-fill idea from selected project
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!selectedProject) return;
    const projectIdea = [
      selectedProject.title,
      selectedProject.description,
      selectedProject.problem,
      selectedProject.target_users ? `Target users: ${selectedProject.target_users}` : "",
    ].filter(Boolean).join("\n\n");
    setCustomIdea(projectIdea);
  }, [selectedProjectId, selectedProject]);

  function mapApiResult(data: BreakApiData): BreakResult {
    const probability = typeof data.survival_probability === "number" ? data.survival_probability : undefined;
    const killReasons = cleanAIList(data.kill_reasons);
    const differentiationPlan = cleanAIList(data.differentiation_plan);
    const brutalAdvice = cleanAIText(data.brutal_advice);
    const overallRisk: RiskSeverity =
      probability == null ? "High" :
      probability < 25 ? "Critical" :
      probability < 50 ? "High" :
      probability < 75 ? "Medium" : "Low";

    const risks: RiskItem[] = (killReasons.length ? killReasons : ["Execution risk not enough data yet"]).map((reason, index) => ({
      category: ["Market Risk", "Execution Risk", "Moat Risk", "Revenue Risk"][index] ?? "Startup Risk",
      severity: index === 0 ? overallRisk : overallRisk === "Critical" ? "High" : overallRisk,
      description: reason,
      mitigation: differentiationPlan[index] ?? brutalAdvice ?? "Talk to 5 target users and validate the riskiest assumption before building more.",
    }));

    if (data.competitor_summary) {
      risks.push({
        category: "Competitive Landscape",
        severity: "Medium",
        description: cleanAIText(data.competitor_summary),
        mitigation: differentiationPlan[0] ?? "Pick one underserved niche and position around that pain instead of competing broadly.",
      });
    }

    const agents = Object.entries(data.agent_outputs ?? {}).map(([name, output]) => {
      const text = output
        ? Object.values(output)
            .flat()
            .filter((value) => typeof value === "string")
            .slice(0, 2)
            .join(" ")
        : "";
      return {
        name: name[0].toUpperCase() + name.slice(1),
        status: data.agent_statuses?.[name] ?? "complete",
        summary: cleanAIText(text) || "Agent completed with structured analysis.",
        confidence: data.signal_summary?.overall_confidence,
      };
    });

    return {
      overallRisk,
      summary: cleanAIText(data.verdict) || "Stress test complete. Review the risks before deciding what to build next.",
      risks,
      survival_probability: probability,
      brutal_advice: brutalAdvice || undefined,
      gated: data.gated,
      score_note: data.gated
        ? "Free preview score: estimated from your written idea only."
        : cleanAIList(data.reasoning).filter((item) =>
            /focus areas|5-agent|viability score|competitor/i.test(item)
          ).join(" | ") || "Calculated from execution data, validation signals, stage, and competitor context.",
      agents,
      focusAreas: cleanAIList(data.focus_areas),
      executionPlan: data.execution_plan
        ? {
            mvp_roadmap: cleanAIList(data.execution_plan.mvp_roadmap),
            first_10_actions: cleanAIList(data.execution_plan.first_10_actions),
            gtm_plan: cleanAIList(data.execution_plan.gtm_plan),
          }
        : null,
      reflexionAction: data.reflexion_action
        ? {
            ...data.reflexion_action,
            action: cleanAIText(data.reflexion_action.action),
            rationale: cleanAIText(data.reflexion_action.rationale),
            supporting_signals: cleanAIList(data.reflexion_action.supporting_signals),
            risks: cleanAIList(data.reflexion_action.risks),
          }
        : null,
    };
  }

  function toggleFocus(area: FocusArea) {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  }

  async function handleRunTest() {
    const idea = customIdea.trim() || selectedProject?.description || selectedProject?.title || "";
    if (!idea) {
      setError("Please describe your startup idea or select a project.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);
    setSaved(false);

    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Not authenticated");

      const freePreviewKey = `bm_break_preview_used_${authData.user.id}`;
      // Wait for server-authoritative plan before applying free gate —
      // prevents Builder users from being blocked during the plan loading window.
      if (!planLoading && plan === "free" && storage.get(freePreviewKey)) {
        showLimitModal("break_startup");
        return;
      }

      const res = await fetch("/api/ai/break-my-startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authData.user.id,
          projectId: selectedProjectId || undefined,
          idea,
          focusAreas,
          executionMode,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) throw new Error(payload?.error ?? "Request failed");

      const mappedResult = mapApiResult(payload.data ?? {});
      setResult(mappedResult);
      if (plan === "free") storage.set(freePreviewKey, "1");

      // Track achievement
      try {
        updateAchievementStats({ breakMyStartupUsed: true });
        await checkAndUnlockAchievements();
        // Break My Startup counts as a streak-qualifying activity — increment once per day
        const todayKey = new Date().toISOString().split("T")[0];
        if (storage.get("bm_break_streak_date") !== todayKey) {
          incrementDailyStreak();
          storage.set("bm_break_streak_date", todayKey);
        }
      } catch {}
    } catch {
      setError("Something went wrong running the stress test. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result || !selectedProjectId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      // Save result to project notes
      await fetch("/api/ventures/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          type: "stress_test",
          content: JSON.stringify(result),
        }),
      });
      setSaved(true);
    } catch {
      // Silently fail — user can still copy the result
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setSaved(false);
    setCustomIdea("");
  }

  async function handleOutcome(outcome: "completed" | "partial" | "overridden") {
    const logRowId = result?.reflexionAction?.log_row_id;
    if (!logRowId) return;
    setOutcomeSaving(outcome);
    try {
      await fetch("/api/ai/reflexion-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_row_id: logRowId, outcome }),
      });
    } finally {
      setOutcomeSaving(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <PageHeader
          title="Break My Startup"
          subtitle="Run a brutal, honest stress-test on your current project or any idea. No sugarcoating. The goal is to make you stronger, not scare you."
          action={
            <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--bm-red)]">
              <Shield size={15} />
              Stress test
            </span>
          }
        />
      </motion.div>

      {/* Input panel */}
      <AnimatePresence mode="wait">
        {!result && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-5"
          >
            {/* Project selector */}
            {!projectsLoading && projects.length > 0 && (
              <Card className="p-4 flex flex-col gap-3">
                <label className="text-xs font-medium text-[var(--bm-text2)] uppercase tracking-widest">
                  Select a Project (optional)
                </label>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value);
                      if (!e.target.value) setCustomIdea("");
                    }}
                    className="w-full h-10 rounded-lg pl-3 pr-8 text-sm outline-none appearance-none cursor-pointer"
                    style={{
                      background: "var(--bm-bg3)",
                      border: "1px solid var(--bm-border2)",
                      color: "var(--bm-text)",
                    }}
                  >
                    <option value="">— Use custom idea instead —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title ?? "Untitled"}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={13}
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--bm-text3)" }}
                  />
                </div>

                {selectedProject && (
                  <p className="text-xs text-[var(--bm-text3)] leading-relaxed line-clamp-2">
                    {selectedProject.description ?? "No description"}
                  </p>
                )}
              </Card>
            )}

            {/* Custom idea textarea */}
            <Textarea
              label={selectedProjectId ? "Startup context to stress-test" : "Describe your startup idea"}
              helperText={selectedProjectId ? "Loaded from your selected project. You can edit or add domain-specific context before running the test." : undefined}
              placeholder="What are you building? Who is it for? How do you plan to make money? Paste your pitch, business model, domain, or current strategy..."
              value={customIdea}
              onChange={(e) => setCustomIdea(e.target.value)}
              rows={6}
            />

            {/* Focus areas */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-xs font-medium text-[var(--bm-text2)] uppercase tracking-widest">
                  Focus Areas (optional)
                </label>
                <button
                  type="button"
                  onClick={() => setExecutionMode((value) => !value)}
                  className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold sm:w-auto"
                  style={{
                    border: "1px solid var(--bm-border)",
                    background: executionMode ? "rgba(92,200,138,0.12)" : "var(--bm-bg3)",
                    color: executionMode ? "var(--bm-accent)" : "var(--bm-text3)",
                  }}
                >
                  Focus Mode {executionMode ? "On" : "Off"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREAS.map((area) => {
                  const active = focusAreas.includes(area);
                  return (
                    <button
                      key={area}
                      onClick={() => toggleFocus(area)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150"
                      style={{
                        background: active ? "rgba(92,200,138,0.10)" : "var(--bm-bg3)",
                        borderColor: active ? "var(--bm-accent-bd)" : "var(--bm-border)",
                        color: active ? "var(--bm-accent)" : "var(--bm-text3)",
                      }}
                    >
                      {area}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[var(--bm-text3)]">
                Leave empty to stress-test everything. Focus Mode turns the result into an execution-first plan.
              </p>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm p-3 rounded-lg"
                style={{
                  background: "rgba(224,85,85,0.08)",
                  border: "1px solid rgba(224,85,85,0.2)",
                  color: "var(--bm-red)",
                }}
              >
                <AlertTriangle size={14} />
                {error}
              </motion.div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl p-5 border border-[var(--bm-border)] bg-[var(--bm-bg2)] animate-pulse flex flex-col gap-2"
                  >
                    <div className="h-4 w-36 rounded-full bg-[var(--bm-bg3)]" />
                    <div className="h-3 w-full rounded-full bg-[var(--bm-bg3)] opacity-70" />
                    <div className="h-3 w-5/6 rounded-full bg-[var(--bm-bg3)] opacity-50" />
                    <div className="h-3 w-2/3 rounded-full bg-[var(--bm-bg3)] opacity-40" />
                  </div>
                ))}
              </motion.div>
            )}

            {!loading && (
              <Button
                size="lg"
                onClick={handleRunTest}
                disabled={!customIdea.trim() && !selectedProjectId}
                className="w-full sm:w-auto sm:self-start"
              >
                <AlertTriangle size={15} />
                Run Stress Test →
              </Button>
            )}
          </motion.div>
        )}

        {/* Result panel */}
        {result && !loading && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col gap-5"
          >
            {/* Overall verdict — visceral, full-width */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              style={{
                borderRadius: "var(--r-xl)",
                padding: "clamp(16px, 4vw, 24px)",
                background: `linear-gradient(135deg, ${overallColor(result.overallRisk)}12 0%, var(--bm-bg2) 100%)`,
                border: `1px solid ${overallColor(result.overallRisk)}40`,
                boxShadow: `0 0 32px ${overallColor(result.overallRisk)}18`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
                {result.survival_probability !== undefined && (
                  <SurvivalRing value={result.survival_probability} />
                )}
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: "var(--bm-text3)",
                    }}>
                      Verdict
                    </span>
                    <Badge variant={severityVariant(result.overallRisk)} size="md" dot>
                      {result.overallRisk} Risk
                    </Badge>
                  </div>
                  {result.summary && (
                    <p style={{ fontSize: 15, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1.55, marginBottom: 0 }}>
                      {result.summary}
                    </p>
                  )}
                  {result.score_note && (
                    <p style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 6, lineHeight: 1.5 }}>
                      {result.score_note}
                    </p>
                  )}
                  {result.gated && (
                    <button
                      type="button"
                      onClick={() => showLimitModal("break_startup")}
                      style={{
                        marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6,
                        fontSize: 12, fontWeight: 600, color: "var(--bm-text-inv)",
                        background: "var(--bm-accent)", border: "none", borderRadius: "var(--r-md)",
                        padding: "8px 16px", cursor: "pointer",
                      }}
                    >
                      Unlock full analysis →
                    </button>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Brutal advice — high contrast */}
            {result.brutal_advice && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                style={{
                  borderRadius: "var(--r-lg)",
                  padding: "16px 18px",
                  background: "rgba(232,160,32,0.06)",
                  border: "1px solid rgba(232,160,32,0.3)",
                  borderLeft: "3px solid var(--bm-amber)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <AlertTriangle size={13} style={{ color: "var(--bm-amber)", flexShrink: 0 }} />
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.12em", color: "var(--bm-amber)",
                  }}>
                    Brutal advice
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "var(--bm-text)", lineHeight: 1.6, fontWeight: 500, margin: 0 }}>
                  {result.brutal_advice}
                </p>
              </motion.div>
            )}

            {/* Risk breakdown cards */}
            {result.agents && result.agents.length > 0 && (
              <Card className="p-4 flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-[var(--bm-text)]">Five-Agent Analysis</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {result.agents.map((agent) => (
                    <div key={agent.name} className="rounded-lg p-3" style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--bm-text)]">{agent.name}</span>
                        <span className="text-[10px] uppercase tracking-widest text-[var(--bm-text4)]">{agent.status}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--bm-text3)]">{agent.summary}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {result.executionPlan && (
              <Card className="p-4 flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-[var(--bm-text)]">Focus Mode Plan</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["MVP Roadmap", result.executionPlan.mvp_roadmap],
                    ["First Actions", result.executionPlan.first_10_actions],
                    ["Go To Market", result.executionPlan.gtm_plan],
                  ].map(([title, items]) => (
                    <div key={title as string} className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[var(--bm-text2)]">{title as string}</span>
                      {(items as string[] | undefined)?.slice(0, 4).map((item) => (
                        <p key={item} className="text-xs leading-relaxed text-[var(--bm-text3)]">{item}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {result.reflexionAction && (
              <Card className="p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <h3 className="text-sm font-semibold text-[var(--bm-text)]">Reflexion Loop</h3>
                  {typeof result.reflexionAction.confidence === "number" && (
                    <span className="text-xs text-[var(--bm-text3)]">{Math.round(result.reflexionAction.confidence * 100)}% confidence</span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-[var(--bm-text2)]">{result.reflexionAction.action}</p>
                {result.reflexionAction.rationale && (
                  <p className="text-xs leading-relaxed text-[var(--bm-text3)]">{result.reflexionAction.rationale}</p>
                )}
                {result.reflexionAction.log_row_id && (
                  <div className="flex flex-wrap gap-2">
                    {(["completed", "partial", "overridden"] as const).map((outcome) => (
                      <Button key={outcome} variant="ghost" size="sm" onClick={() => handleOutcome(outcome)} loading={outcomeSaving === outcome}>
                        Mark {outcome}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Risk breakdown cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-text)", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Kill reasons
                </h3>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: "var(--bm-red)",
                  background: "rgba(224,85,85,0.1)", border: "1px solid rgba(224,85,85,0.2)",
                  borderRadius: 4, padding: "1px 6px",
                }}>
                  {result.risks.length} found
                </span>
              </div>
              {result.risks.map((risk, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  style={{
                    borderRadius: "var(--r-md)",
                    overflow: "hidden",
                    border: `1px solid ${
                      risk.severity === "Critical" ? "rgba(224,85,85,0.3)" :
                      risk.severity === "High" ? "rgba(232,160,32,0.25)" :
                      "var(--bm-border)"
                    }`,
                    background: "var(--bm-bg2)",
                  }}
                >
                  <div style={{ height: 3, background: overallColor(risk.severity), opacity: 0.7 }} />
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", minWidth: 18, flexShrink: 0 }}>
                        #{i + 1}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)", flex: 1 }}>
                        {risk.category}
                      </span>
                      <Badge variant={severityVariant(risk.severity)} size="sm" dot>
                        {risk.severity}
                      </Badge>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.55, margin: "0 0 10px 0" }}>
                      {risk.description}
                    </p>
                    <div style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      background: "var(--bm-bg3)", borderRadius: "var(--r-sm)", padding: "8px 10px",
                    }}>
                      <CheckCircle2 size={12} style={{ color: "var(--bm-accent)", flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>{risk.mitigation}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {selectedProjectId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  disabled={saved}
                >
                  {saved ? (
                    <>
                      <CheckCircle2 size={13} style={{ color: "var(--bm-green)" }} />
                      Saved to Project
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      Save to Project
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
              >
                <RefreshCw size={13} />
                Run Again
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
