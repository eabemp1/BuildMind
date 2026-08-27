"use client";
import React from "react";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveProjectId, useProjectsQuery } from "@/lib/queries";
import { setActiveProjectId } from "@/lib/api";
import { createProjectWithRoadmap } from "@/lib/buildmind";
import { createClient } from "@/lib/supabase/client";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import { canAccess, incrementDailyStreak } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import {
  Shield, ChevronDown, AlertTriangle, CheckCircle2,
  RefreshCw, Save, X, Loader2, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuildMindCalibrating } from "@/components/BuildMindCalibrating";
import { Card } from "@/components/ui/card";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";
import { sanitizeOutput, sanitizeMarkdown } from "@/lib/sanitizeOutput";
import { Markdown } from "@/components/ui/Markdown";
import { RadialGauge, RadarChart, SeverityStack, type SeverityItem, type Severity } from "@/components/charts";

// ── Types ────────────────────────────────────────────────────────────────────
type RiskSeverity = "Critical" | "High" | "Medium" | "Low";

interface RiskItem {
  category: string;
  severity: RiskSeverity;
  description: string;
  mitigation: string;
}

interface PivotItem {
  title: string;
  description: string;
  target_niche: string;
  why_better: string;
  estimated_score_delta: number;
  key_change: string;
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
  /** Per-dimension 0-100 scores from the 5-agent pipeline's SignalSummary.
   *  The API has always returned this on signal_summary; it just wasn't
   *  read here before. Feeds the radar chart. */
  signalBreakdown?: Array<{ key: string; label: string; value: number; tip?: string }>;
  isSynthetic?: boolean; // D2: true when all agents fell back to hardcoded defaults
  focusAreas?: string[];
  executionPlan?: { mvp_roadmap?: string[]; first_10_actions?: string[]; gtm_plan?: string[] } | null;
  /** Pivot Engine output (lib/agents generatePivots). The backend has always
   *  computed this — it's the system's actual "you might be going in the
   *  wrong direction" signal — but it was dropped before reaching the UI.
   *  Now surfaced as its own card. */
  pivots?: PivotItem[];
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
  signal_summary?: {
    overall_confidence?: number;
    demand_score?: number;
    competition_score?: number;
    timing_score?: number;
    uniqueness_score?: number;
    risk_score?: number;
  };
  execution_plan?: BreakResult["executionPlan"];
  reflexion_action?: BreakResult["reflexionAction"];
  focus_areas?: string[];
  pivots?: PivotItem[];
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
    // FIX: this function stripped think-tags, arrows, dashes, curly quotes,
    // and ellipsis, but never touched markdown syntax. This page renders
    // every AI string as plain JSX text — no ReactMarkdown, no
    // dangerouslySetInnerHTML anywhere in this file (confirmed via grep) —
    // so any markdown the model outputs shows up as literal characters
    // instead of being interpreted. Bold/italic stripped BEFORE the single-
    // asterisk/underscore pass, or **text** would only half-match.
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")   // ***bold italic***
    .replace(/\*\*([^*]+)\*\*/g, "$1")       // **bold**
    .replace(/__([^_]+)__/g, "$1")           // __bold__
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1") // *italic* (not part of **)
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")     // _italic_
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")   // `code` / ```code```
    .replace(/^#{1,6}\s+/gm, "")             // # Heading markers
    .replace(/^[-*+]\s+/gm, "")              // markdown bullet markers
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BreakMyStartupPage() {
  const [reflectionCount, setReflectionCount] = React.useState(0);

  React.useEffect(() => {
    async function fetchCount() {
      try {
        const { createClient: cc } = await import("@/lib/supabase/client");
        const supabase = cc();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count } = await supabase.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", user.id);
        setReflectionCount(count ?? 0);
      } catch { /* non-fatal */ }
    }
    fetchCount();

    fetchBehaviorState<{ break_streak_date: string }>(["break_streak_date"]).then(values => {
      const today = new Date().toISOString().split("T")[0];
      if (values.break_streak_date === today) {
        storage.set("bm_break_streak_date", today);
      }
    }).catch(() => {});
  }, []);
  const { plan, isLoading: planLoading } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: projects = [], isLoading: projectsLoading } = useProjectsQuery();
  const activeProjectId = useActiveProjectId();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [customIdea, setCustomIdea] = useState("");
  const [knownCompetitors, setKnownCompetitors] = useState("");
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [executionMode, setExecutionMode] = useState(false);
  const [loading, setLoading] = useState(false);
  // G4 FIX: Track in-flight request so a network retry or component remount
  // can abort the previous request rather than running two pipelines in parallel.
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<BreakResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcomeSaving, setOutcomeSaving] = useState<string | null>(null);
  // ISSUE-4 FIX: distinguishes "founder deliberately picked an existing
  // project from the dropdown" from "a project got auto-selected because it
  // happened to be active elsewhere in the app". Only the former should let
  // results be saved onto that project — otherwise a genuinely new/custom
  // idea silently gets attached to whatever project the founder was last
  // viewing, instead of being offered as its own new project.
  const [projectExplicitlySelected, setProjectExplicitlySelected] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [addedProjectId, setAddedProjectId] = useState<string | null>(null);
  const [addProjectError, setAddProjectError] = useState<string | null>(null);

  // Pre-fill idea from selected project
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // FIX: this effect used to list `selectedProjectId` in its own dependency
  // array with a guard of `!selectedProjectId` — meaning every time the
  // founder cleared it (by choosing "Use custom idea instead"), the effect
  // re-fired and immediately set it right back to activeProjectId. That's
  // the exact bug: selecting custom idea appeared to instantly snap back to
  // the active project. This should only auto-select the active project
  // ONCE, on initial load — not re-assert itself every time it's cleared.
  const didAutoSelectProject = useRef(false);
  useEffect(() => {
    if (didAutoSelectProject.current) return;
    if (!activeProjectId) return;
    if (projects.some((p) => p.id === activeProjectId)) {
      setSelectedProjectId(activeProjectId);
      didAutoSelectProject.current = true;
    }
  }, [activeProjectId, projects]);

  // ISSUE-4 FIX: remember exactly what text we auto-filled from the project,
  // so handleRunTest can tell "founder is still testing the pre-loaded
  // project as-is" apart from "founder edited this into a different idea".
  // That distinction matters because the backend, when given a projectId,
  // ignores the typed idea entirely and re-reads the project's own stored
  // description — so a diverged custom idea must NOT be sent with a
  // projectId, or it silently gets swapped out for "the existing project"
  // again, discarding what the founder actually wrote.
  const autofilledIdeaRef = useRef<string>("");
  useEffect(() => {
    if (!selectedProjectId) return;
    if (!selectedProject) return;
    const projectIdea = [
      selectedProject.title,
      selectedProject.description,
      selectedProject.problem,
      selectedProject.target_users ? `Target users: ${selectedProject.target_users}` : "",
    ].filter(Boolean).join("\n\n");
    autofilledIdeaRef.current = projectIdea;
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

    // FIX (previous pass): this used to be `differentiationPlan[index] ?? brutalAdvice ?? ...`,
    // which discarded the Risk agent's own per-risk `mitigation` field and
    // substituted the Competitor agent's positioning suggestions instead.
    // That pass reads `riskAgentOutput.top_risks[index].mitigation` first —
    // correct when the Risk agent returns per-risk mitigations. But it left
    // a real duplication path open: whenever the Risk agent's mitigation for
    // a given index is missing/empty (fallback, timeout, or a short/invalid
    // model response), it falls through to `differentiationPlan[index]`,
    // and the Competitive Landscape card below independently falls through
    // to `differentiationPlan[0]` — the SAME index every time. If Market
    // Risk (index 0) also had to fall back, both cards render the exact
    // same string, verbatim. That's the bug the founder is seeing in
    // production (Market Risk and Competitive Landscape showing identical
    // mitigation text). Confirmed by reading this file: nothing tracked
    // which differentiationPlan entries were already used.
    //
    // Fix: track used differentiation-plan indices across ALL risk cards
    // (including the appended Competitive Landscape one) so no two cards
    // can ever render the same fallback text. If every differentiation
    // entry is exhausted, fall back to a distinct final-resort line instead
    // of repeating brutalAdvice/differentiationPlan[0] again.
    const riskAgentOutput = data.agent_outputs?.risk as
      | { top_risks?: Array<{ mitigation?: string }> }
      | undefined;

    const usedDiffIndices = new Set<number>();
    function nextDifferentiationEntry(): string | undefined {
      for (let i = 0; i < differentiationPlan.length; i++) {
        if (!usedDiffIndices.has(i)) {
          usedDiffIndices.add(i);
          return differentiationPlan[i];
        }
      }
      return undefined;
    }

    const risks: RiskItem[] = (killReasons.length ? killReasons : ["Execution risk not enough data yet"]).map((reason, index) => ({
      category: ["Market Risk", "Execution Risk", "Moat Risk", "Revenue Risk"][index] ?? "Startup Risk",
      severity: index === 0 ? overallRisk : overallRisk === "Critical" ? "High" : overallRisk,
      description: reason,
      mitigation:
        cleanAIText(riskAgentOutput?.top_risks?.[index]?.mitigation) ||
        nextDifferentiationEntry() ||
        brutalAdvice ||
        "Talk to 5 target users and validate the riskiest assumption before building more.",
    }));

    if (data.competitor_summary) {
      risks.push({
        category: "Competitive Landscape",
        severity: "Medium",
        description: cleanAIText(data.competitor_summary),
        mitigation:
          nextDifferentiationEntry() ??
          "Pick one underserved niche and position around that pain instead of competing broadly.",
      });
    }

    // D2 FIX: Detect when all agents fell back (overall_confidence ≤ 0.3 and every
    // agent_status is "fallback"). In that case the score is computed from hardcoded
    // defaults — show a banner so founders don't make decisions on synthetic data.
    const allStatuses = Object.values(data.agent_statuses ?? {});
    const isSynthetic =
      (data.signal_summary?.overall_confidence ?? 1) <= 0.35 &&
      allStatuses.length > 0 &&
      allStatuses.every((s) => s === "fallback");

    const agents = Object.entries(data.agent_outputs ?? {}).map(([name, output]) => {
      const reasoning =
        output && typeof (output as Record<string, unknown>).reasoning === "string"
          ? ((output as Record<string, unknown>).reasoning as string)
          : "";
      return {
        name: name[0].toUpperCase() + name.slice(1),
        status: data.agent_statuses?.[name] ?? "complete",
        summary: cleanAIText(reasoning) || "Agent completed with structured analysis.",
        confidence: data.signal_summary?.overall_confidence,
      };
    });

    const ss = data.signal_summary;
    const signalBreakdown =
      ss && [ss.demand_score, ss.competition_score, ss.timing_score, ss.uniqueness_score, ss.risk_score].some(
        (v) => typeof v === "number"
      )
        ? [
            { key: "demand", label: "Demand", value: ss.demand_score ?? 0, tip: "How much real demand signal was found" },
            { key: "competition", label: "Market Space", value: 100 - (ss.competition_score ?? 100), tip: "Inverted competition score — higher means less crowded" },
            { key: "timing", label: "Timing", value: ss.timing_score ?? 0, tip: "How favorable current market timing looks" },
            { key: "uniqueness", label: "Uniqueness", value: ss.uniqueness_score ?? 0, tip: "Differentiation vs. what's already out there" },
            { key: "risk", label: "Safety", value: 100 - (ss.risk_score ?? 100), tip: "Inverted risk score — higher means lower execution risk" },
          ]
        : undefined;

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
      signalBreakdown,
      isSynthetic,
      focusAreas: cleanAIList(data.focus_areas),
      pivots: Array.isArray(data.pivots)
        ? data.pivots.slice(0, 3).map((p) => ({
            title: cleanAIText(p.title),
            description: cleanAIText(p.description),
            target_niche: cleanAIText(p.target_niche),
            why_better: cleanAIText(p.why_better),
            estimated_score_delta: typeof p.estimated_score_delta === "number" ? p.estimated_score_delta : 0,
            key_change: cleanAIText(p.key_change),
          }))
        : undefined,
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

    // ISSUE-4 FIX: the backend, when given a projectId, ignores the `idea`
    // field entirely and re-reads the project's own stored description —
    // see app/api/ai/break-my-startup/route.ts's "if (!projectId)" branch.
    // So if the founder edited the textarea into something that no longer
    // matches what we auto-filled from the selected project, sending
    // projectId would silently discard their edit and re-run the OLD
    // project data instead. Only attach projectId when either the founder
    // explicitly chose that project, or the text still matches what was
    // pre-filled (i.e. they haven't diverged from it).
    const ideaMatchesAutofill = customIdea.trim() === autofilledIdeaRef.current.trim();
    const runProjectId =
      selectedProjectId && (projectExplicitlySelected || ideaMatchesAutofill)
        ? selectedProjectId
        : undefined;

    // G4 FIX: Cancel any in-flight request before starting a new one.
    // This prevents a network-retry from running two full 5-agent pipelines
    // simultaneously and double-charging the AI usage counter.
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const abortController = new AbortController();
    abortRef.current = abortController;

    setLoading(true);
    setResult(null);
    setError(null);
    setSaved(false);
    setAddedProjectId(null);
    setAddProjectError(null);

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
        signal: abortController.signal, // G4 FIX: abort if a newer request starts
        body: JSON.stringify({
          userId: authData.user.id,
          projectId: runProjectId,
          idea,
          focusAreas,
          executionMode,
          knownCompetitors: knownCompetitors
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 8),
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
          persistBehaviorState({ break_streak_date: todayKey });
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

  // ISSUE-4 FIX: When the founder ran the stress test on a custom idea
  // (no project explicitly selected — see projectExplicitlySelected above),
  // give them a real path to turn that idea into a new project instead of
  // it having nowhere to go, or silently landing on whatever project
  // happened to be auto-selected. Reuses the same project-creation flow as
  // onboarding (createProjectWithRoadmap), then attaches this stress test
  // as the project's first note so nothing from the run is lost.
  async function handleAddAsProject() {
    if (!result || !customIdea.trim()) return;
    setAddingProject(true);
    setAddProjectError(null);
    try {
      const firstLine = customIdea.trim().split("\n")[0] ?? customIdea.trim();
      const projectName = firstLine.slice(0, 60).replace(/[.!?]+$/, "").trim() || "Untitled idea";

      const created = await createProjectWithRoadmap({
        project_name: projectName,
        idea_description: customIdea.trim(),
        target_users: selectedProject?.target_users ?? "Not specified yet",
        problem: selectedProject?.problem || result.risks[0]?.description || customIdea.trim(),
      });

      const newProjectId = (created as { id?: string } | null)?.id;
      if (newProjectId) {
        await fetch("/api/ventures/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: newProjectId,
            type: "stress_test",
            content: JSON.stringify(result),
          }),
        }).catch(() => {});
        setAddedProjectId(newProjectId);
        setActiveProjectId(newProjectId);
      }
    } catch {
      setAddProjectError("Couldn't create the project. Please try again.");
    } finally {
      setAddingProject(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setSaved(false);
    setCustomIdea("");
    setProjectExplicitlySelected(false);
    setAddedProjectId(null);
    setAddProjectError(null);
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
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-0 py-5 sm:px-6 sm:py-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <PageHeader
          eyebrow="Adversarial review"
          title="Break My Startup"
          subtitle="Find what breaks first before you invest more time. The useful answer is the uncomfortable one."
          action={
            <span className="inline-flex h-8 items-center gap-2 rounded-[var(--r-sm)] border border-[var(--bm-red-bd)] bg-[var(--bm-red-dim)] px-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--bm-red)]">
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
              <Card variant="data" className="flex flex-col gap-3 p-4">
                <label className="text-xs font-medium text-[var(--bm-text2)] uppercase tracking-widest">
                  Select a Project (optional)
                </label>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value);
                      // Deliberate dropdown interaction — whatever the founder
                      // picks (a project, or "— Use custom idea instead —")
                      // now reflects real intent, not an auto-selection.
                      setProjectExplicitlySelected(Boolean(e.target.value));
                      if (e.target.value) setActiveProjectId(e.target.value);
                      // FIX: this used to also call setCustomIdea("") whenever
                      // the dropdown was set back to "— Use custom idea
                      // instead —", unconditionally wiping whatever the
                      // founder had typed in the textarea below — the exact
                      // reason "custom idea" looked broken: switching the
                      // dropdown at all could erase your own text before you
                      // ever hit submit. Never force-clear text the founder
                      // typed themselves.
                    }}
                    className="h-10 w-full cursor-pointer appearance-none rounded-[var(--r-sm)] pl-3 pr-8 text-sm outline-none"
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

            {/* Known competitors — grounds the Competitor agent's search in
                real, named tools you already know about, instead of leaving
                it entirely to generic keyword search results. */}
            <Textarea
              label="Known competitors (optional)"
              helperText="Name any tools you already know compete with you, comma-separated (e.g. validator.ai, Notion AI). We'll look these up directly alongside the general market search."
              placeholder="validator.ai, Notion AI, ..."
              value={knownCompetitors}
              onChange={(e) => setKnownCompetitors(e.target.value)}
              rows={1}
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
                      className="w-full rounded-[var(--r-sm)] px-3 py-1.5 text-xs font-semibold sm:w-auto"
                  style={{
                    border: "1px solid var(--bm-border)",
                    background: executionMode ? "rgba(92,200,138,0.12)" : "var(--bm-bg3)",
                    color: executionMode ? "var(--bm-green)" : "var(--bm-text3)",
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
                      className="rounded-[var(--r-sm)] border px-3 py-1.5 text-xs font-medium transition-all duration-150"
                      style={{
                        background: active ? "rgba(92,200,138,0.10)" : "var(--bm-bg3)",
                        borderColor: active ? "var(--bm-green-bd)" : "var(--bm-border)",
                        color: active ? "var(--bm-green)" : "var(--bm-text3)",
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
                    className="flex flex-col gap-2 rounded-[var(--r-lg)] border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-5 animate-pulse"
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
                className="flex flex-col gap-4"
          >
            {/* Overall verdict — visceral, full-width */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              style={{
                borderRadius: "var(--r-lg)",
                padding: "clamp(16px, 4vw, 24px)",
                background: "var(--bm-bg2)",
                border: `1px solid ${overallColor(result.overallRisk)}40`,
                boxShadow: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
                {result.survival_probability !== undefined && (
                  <RadialGauge
                    value={result.survival_probability}
                    size={110}
                    label="survive"
                    thresholds={[
                      { min: 60, color: "var(--bm-green)" },
                      { min: 40, color: "var(--bm-amber)" },
                      { min: 0, color: "var(--bm-red)" },
                    ]}
                  />
                )}
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--bm-text3)", letterSpacing: "0.07em", marginBottom: 10, textTransform: "uppercase" }}>
                    Stress-test verdict
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--bm-text4)", letterSpacing: "0.06em", marginBottom: 12 }}>
                    The uncomfortable ones are the useful ones.
                  </div>
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
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1.55, marginBottom: 0 }}>
                      <Markdown textSize={15}>{sanitizeMarkdown(result.summary)}</Markdown>
                    </div>
                  )}
                  {result.score_note && (
                    <p style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 6, lineHeight: 1.5 }}>
                      {sanitizeOutput(result.score_note)}
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
                <div style={{ fontSize: 14, color: "var(--bm-text)", lineHeight: 1.6, fontWeight: 500 }}>
                  <Markdown textSize={14}>{sanitizeMarkdown(result.brutal_advice)}</Markdown>
                </div>
              </motion.div>
            )}

            {/* D2 FIX: Synthetic-analysis warning — shown when all 5 agents fell back */}
            {result.isSynthetic && (
              <div style={{
                background: "var(--bm-amber-muted, rgba(245,158,11,0.12))",
                border: "1px solid var(--bm-amber, #f59e0b)",
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--bm-amber, #f59e0b)" }}>
                    Analysis unavailable — AI providers unreachable
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>
                    All five analysis agents fell back to default values. The score shown is estimated, not
                    computed from your actual idea. Try again in a few minutes when providers recover.
                  </p>
                </div>
              </div>
            )}

            {/* Risk breakdown cards */}
            {result.agents && result.agents.length > 0 && (
            <Card variant="data" className="flex flex-col gap-3 p-4">
                <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--bm-text3)]">Analysis lenses</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {result.agents.map((agent) => (
                    <div key={agent.name} className="rounded-lg p-3" style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--bm-text)]">{agent.name}</span>
                        <span className="text-[10px] uppercase tracking-widest text-[var(--bm-text4)]">{agent.status}</span>
                      </div>
                      <div className="mt-1">
                        <Markdown textSize={12}>{sanitizeMarkdown(agent.summary)}</Markdown>
                      </div>
                    </div>
                  ))}
                </div>
                {result.signalBreakdown && (
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                    <RadarChart axes={result.signalBreakdown} size={240} />
                  </div>
                )}
              </Card>
            )}

            {result.executionPlan && (
              <Card variant="data" className="flex flex-col gap-3 p-4">
                <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--bm-text3)]">Execution plan</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["MVP Roadmap", result.executionPlan.mvp_roadmap],
                    ["First Actions", result.executionPlan.first_10_actions],
                    ["Go To Market", result.executionPlan.gtm_plan],
                  ].map(([title, items]) => (
                    <div key={title as string} className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[var(--bm-text2)]">{title as string}</span>
                      {(items as string[] | undefined)?.slice(0, 4).map((item) => (
                        <p key={item} className="text-xs leading-relaxed text-[var(--bm-text3)]">{sanitizeOutput(item)}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {result.reflexionAction && (
              <Card variant="insight" className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <h3 className="text-sm font-semibold text-[var(--bm-text)]">Reflexion Loop</h3>
                  {typeof result.reflexionAction.confidence === "number" && (
                    <span className="text-xs text-[var(--bm-text3)]">{Math.round(result.reflexionAction.confidence * 100)}% confidence</span>
                  )}
                </div>
                {/* NOTE: reflexionAction.action is the same text already shown in
                    "Brutal advice" above (the API sets brutal_advice = reflexionAction.action) —
                    repeating it here was the source of the "exact copy" duplication. This card
                    now surfaces what Brutal Advice doesn't: why, and how confident the system is. */}
                {result.reflexionAction.rationale ? (
                  <Markdown textSize={13}>{sanitizeMarkdown(result.reflexionAction.rationale)}</Markdown>
                ) : (
                  <p className="text-sm leading-relaxed text-[var(--bm-text2)]">
                    See &ldquo;Brutal advice&rdquo; above — this is the action the Reflexion pipeline recommends.
                  </p>
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
              {result.risks.length > 1 && (
                <SeverityStack
                  title="At a glance"
                  items={result.risks.map((risk): SeverityItem => ({
                    label: risk.category,
                    severity: ({ Critical: "fatal", High: "high", Medium: "medium", Low: "low" } as Record<RiskSeverity, Severity>)[risk.severity],
                  }))}
                />
              )}
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
                    <div style={{ margin: "0 0 10px 0" }}>
                      <Markdown textSize={13}>{sanitizeMarkdown(risk.description)}</Markdown>
                    </div>
                    <div style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      background: "var(--bm-bg3)", borderRadius: "var(--r-sm)", padding: "8px 10px",
                    }}>
                      <CheckCircle2 size={12} style={{ color: "var(--bm-text3)", flexShrink: 0, marginTop: 1 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                          How to de-risk this
                        </div>
                        <Markdown textSize={12}>{sanitizeMarkdown(risk.mitigation)}</Markdown>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Pivot suggestions — the system's actual "you might be going in
                the wrong direction" signal. Computed server-side by the
                Pivot Engine (lib/agents generatePivots) on every run, but
                previously dropped before it reached this page. */}
            {result.pivots && result.pivots.length > 0 && (
              <Card variant="data" className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <RefreshCw size={13} style={{ color: "var(--bm-accent)" }} />
                  <h3 className="text-sm font-semibold text-[var(--bm-text)]">
                    Consider a different direction
                  </h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {result.pivots.map((pivot) => (
                    <div
                      key={pivot.title}
                      className="flex flex-col gap-1.5 rounded-lg p-3"
                      style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--bm-text)]">{pivot.title}</span>
                        {pivot.estimated_score_delta > 0 && (
                          <span
                            className="text-[10px] font-semibold"
                            style={{ color: "var(--bm-green)" }}
                          >
                            +{pivot.estimated_score_delta} viability
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--bm-text3)]">{pivot.description}</p>
                      <p className="text-[11px] leading-relaxed text-[var(--bm-text3)]">
                        <span className="font-semibold text-[var(--bm-text2)]">Target: </span>{pivot.target_niche}
                      </p>
                      <p className="text-[11px] leading-relaxed text-[var(--bm-text3)]">
                        <span className="font-semibold text-[var(--bm-text2)]">Why: </span>{pivot.why_better}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {selectedProjectId && projectExplicitlySelected ? (
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
              ) : customIdea.trim() ? (
                // ISSUE-4 FIX: a custom idea (no project deliberately chosen)
                // now gets its own path to becoming a project, rather than
                // either having no save option or silently attaching to
                // whatever project happened to be active elsewhere.
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddAsProject}
                  loading={addingProject}
                  disabled={Boolean(addedProjectId)}
                >
                  {addedProjectId ? (
                    <>
                      <CheckCircle2 size={13} style={{ color: "var(--bm-green)" }} />
                      Added as Project
                    </>
                  ) : (
                    <>
                      <Plus size={13} />
                      Add as Project
                    </>
                  )}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
              >
                <RefreshCw size={13} />
                Run Again
              </Button>
            </div>
            {addProjectError && (
              <p style={{ fontSize: 12, color: "var(--bm-red)", margin: 0 }}>{addProjectError}</p>
            )}
            {addedProjectId && (
              <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0 }}>
                Saved as a new project — you can find it in your projects list.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
