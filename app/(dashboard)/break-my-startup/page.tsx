"use client";
import { classifyRiskCategory, stripUnsupportedTraitClaims } from "@/lib/breakGuards";
import type { EvidenceLayer } from "@/lib/breakEvidence";
import { StressTestProgress } from "@/components/break/StressTestProgress";
import React from "react";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveProjectId, useProjectsQuery } from "@/lib/queries";
import { setActiveProjectId } from "@/lib/api";
import { createProjectWithRoadmap } from "@/lib/buildmind";
import { createClient } from "@/lib/supabase/client";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import { canAccess } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import { Shield, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuildMindCalibrating } from "@/components/BuildMindCalibrating";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";
import { BreakResultView } from "@/components/break-my-startup/BreakResultView";
import type { BreakResult, CompetitorRow, FocusAreaCoverage, PivotItem, RiskItem, RiskSeverity } from "@/components/break-my-startup/viewTypes";

// ── Types ────────────────────────────────────────────────────────────────────
// Result types live in components/break-my-startup/viewTypes.ts so the result
// view and this page share one definition (Next page files cannot export them).
type BreakApiData = {
  verdict?: string;
  kill_reasons?: string[];
  kill_reason_tags?: string[][];
  survive_reasons?: string[];
  survive_reason_tags?: string[][];
  brutal_advice?: string;
  survival_probability?: number;
  evidence_layer?: EvidenceLayer;
  competitor_summary?: string;
  differentiation_plan?: string[];
  differentiation_plan_tags?: string[][];
  pivot_focus_tags?: string[][];
  focus_area_coverage?: FocusAreaCoverage | null;
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
    // cleanAIList can drop an item entirely (.filter(Boolean), when an item
    // is nothing but a stripped think-tag/markdown artifact) — pairing text
    // with its tag BEFORE that filter, not after, so kill_reason_tags[i]
    // can't end up describing the wrong reason once indices shift.
    function cleanWithTags(items: string[] | undefined, tags: string[][] | undefined): { texts: string[]; tags: string[][] } {
      const paired = (items ?? [])
        .map((item, i) => ({ text: cleanAIText(item), tags: tags?.[i] ?? [] }))
        .filter((x) => Boolean(x.text));
      return { texts: paired.map((x) => x.text), tags: paired.map((x) => x.tags) };
    }
    const killPaired = cleanWithTags(data.kill_reasons, data.kill_reason_tags);
    const killReasons = killPaired.texts;
    const survivePaired = cleanWithTags(data.survive_reasons, data.survive_reason_tags);
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

    // Real per-competitor data the Competitor agent already computes on
    // every run — confirmed via grep that it reaches agent_outputs.competitor
    // but nothing before this read direct_competitors back out; only the
    // generic competitor_summary paragraph was ever shown.
    const competitorAgentOutput = data.agent_outputs?.competitor as
      | { direct_competitors?: Array<{ name?: string; url?: string; weakness?: string; threat_level?: string }> }
      | undefined;
    const competitorTable: CompetitorRow[] | undefined = competitorAgentOutput?.direct_competitors?.length
      ? competitorAgentOutput.direct_competitors.slice(0, 5).map((c) => ({
          name: cleanAIText(c.name) || "Unnamed competitor",
          url: c.url,
          weakness: cleanAIText(c.weakness) || "No specific gap identified yet.",
          threat_level: (c.threat_level === "high" || c.threat_level === "low") ? c.threat_level : "medium",
        }))
      : undefined;

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
      category: classifyRiskCategory(reason),
      severity: index === 0 ? overallRisk : overallRisk === "Critical" ? "High" : overallRisk,
      description: reason,
      mitigation:
        stripUnsupportedTraitClaims([cleanAIText(riskAgentOutput?.top_risks?.[index]?.mitigation)], false)[0] ||
        nextDifferentiationEntry() ||
        brutalAdvice ||
        "Talk to 5 target users and validate the riskiest assumption before building more.",
      relatedFocusAreas: killPaired.tags[index]?.length ? killPaired.tags[index] : undefined,
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
    // Un-inverted counterpart of the above, for the at-a-glance score tiles —
    // same source numbers, just literal (Competition/Risk read as-is, not
    // flipped for the "more filled = better" radar convention).
    const signalScores = ss && [ss.demand_score, ss.competition_score, ss.timing_score, ss.uniqueness_score, ss.risk_score].some(
      (v) => typeof v === "number"
    )
      ? {
          demand: Math.round(ss.demand_score ?? 0),
          competition: Math.round(ss.competition_score ?? 0),
          timing: Math.round(ss.timing_score ?? 0),
          uniqueness: Math.round(ss.uniqueness_score ?? 0),
          risk: Math.round(ss.risk_score ?? 0),
        }
      : undefined;

    return {
      evidence: data.evidence_layer,
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
      signalScores,
      competitorTable,
      surviveReasons: survivePaired.texts,
      surviveReasonTags: survivePaired.tags,
      focusAreaCoverage: data.focus_area_coverage ?? null,
      isSynthetic,
      focusAreas: cleanAIList(data.focus_areas),
      pivots: Array.isArray(data.pivots)
        ? data.pivots.slice(0, 3).map((p, i) => ({
            title: cleanAIText(p.title),
            description: cleanAIText(p.description),
            target_niche: cleanAIText(p.target_niche),
            why_better: cleanAIText(p.why_better),
            estimated_score_delta: typeof p.estimated_score_delta === "number" ? p.estimated_score_delta : 0,
            key_change: cleanAIText(p.key_change),
            relatedFocusAreas: data.pivot_focus_tags?.[i]?.length ? data.pivot_focus_tags[i] : undefined,
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

  // "Explore Pivot" — takes the founder from a pivot suggestion straight
  // into a fresh stress test on that pivot, instead of leaving it as a
  // dead-end card. Composes the re-run idea from the pivot's own real
  // fields (title/description/target_niche/key_change) rather than any
  // separately generated copy.
  function handleExplorePivot(pivot: PivotItem) {
    setResult(null);
    setError(null);
    setSaved(false);
    setSelectedProjectId("");
    setProjectExplicitlySelected(false);
    setCustomIdea(
      `${pivot.title}: ${pivot.description}\n\nTarget users: ${pivot.target_niche}\nKey change from current approach: ${pivot.key_change}`
    );
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
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
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-0 py-5 sm:px-6 sm:py-8">

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

            {/* Progress while the pipeline runs */}
            {loading && <StressTestProgress idea={customIdea || (projects.find((p) => p.id === selectedProjectId)?.title ?? "")} />}

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
            <BreakResultView
              result={result}
              saveMode={selectedProjectId && projectExplicitlySelected ? "project" : customIdea.trim() ? "new" : "none"}
              saving={saving} saved={saved} onSave={handleSave}
              addingProject={addingProject} addedProjectId={addedProjectId} onAddAsProject={handleAddAsProject} addProjectError={addProjectError}
              onReset={handleReset}
              onExplorePivot={handleExplorePivot}
              outcomeSaving={outcomeSaving} onOutcome={handleOutcome}
              onUnlock={() => showLimitModal("break_startup")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
  }
