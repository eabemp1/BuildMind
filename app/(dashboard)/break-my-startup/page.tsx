"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectsQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { canAccess } from "@/lib/plan";
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
}

type BreakApiData = {
  verdict?: string;
  kill_reasons?: string[];
  survive_reasons?: string[];
  brutal_advice?: string;
  survival_probability?: number;
  competitor_summary?: string;
  differentiation_plan?: string[];
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

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-6 text-center flex flex-col items-center gap-3">
      <div className="text-base font-semibold text-[var(--bm-text)]">{title}</div>
      <div className="text-sm text-[var(--bm-text3)] max-w-md">{description}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
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
  const { plan } = usePlan();
  const { showLimitModal } = useLimitModal();
  const { data: projects = [], isLoading: projectsLoading } = useProjectsQuery();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [customIdea, setCustomIdea] = useState("");
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BreakResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pre-fill idea from selected project
  const selectedProject = projects.find((p: any) => p.id === selectedProjectId);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!selectedProject) return;
    const projectIdea = [
      selectedProject.title,
      selectedProject.description,
      (selectedProject as any).problem,
      (selectedProject as any).target_users ? `Target users: ${(selectedProject as any).target_users}` : "",
    ].filter(Boolean).join("\n\n");
    setCustomIdea(projectIdea);
  }, [selectedProjectId, selectedProject]);

  function mapApiResult(data: BreakApiData): BreakResult {
    const probability = typeof data.survival_probability === "number" ? data.survival_probability : undefined;
    const overallRisk: RiskSeverity =
      probability == null ? "High" :
      probability < 25 ? "Critical" :
      probability < 50 ? "High" :
      probability < 75 ? "Medium" : "Low";

    const risks: RiskItem[] = (data.kill_reasons?.length ? data.kill_reasons : ["Execution risk not enough data yet"]).map((reason, index) => ({
      category: ["Market Risk", "Execution Risk", "Moat Risk", "Revenue Risk"][index] ?? "Startup Risk",
      severity: index === 0 ? overallRisk : overallRisk === "Critical" ? "High" : overallRisk,
      description: reason,
      mitigation: data.differentiation_plan?.[index] ?? data.brutal_advice ?? "Talk to 5 target users and validate the riskiest assumption before building more.",
    }));

    if (data.competitor_summary) {
      risks.push({
        category: "Competitive Landscape",
        severity: "Medium",
        description: data.competitor_summary,
        mitigation: data.differentiation_plan?.[0] ?? "Pick one underserved niche and position around that pain instead of competing broadly.",
      });
    }

    return {
      overallRisk,
      summary: data.verdict ?? "Stress test complete. Review the risks before deciding what to build next.",
      risks,
      survival_probability: probability,
      brutal_advice: data.brutal_advice,
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

      const res = await fetch("/api/ai/break-my-startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authData.user.id,
          projectId: selectedProjectId || undefined,
          idea,
          focusAreas,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) throw new Error(payload?.error ?? "Request failed");

      setResult(mapApiResult(payload.data ?? {}));

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

  function handleReset() {
    setResult(null);
    setError(null);
    setSaved(false);
    setCustomIdea("");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1"
      >
        <div className="flex items-center gap-2">
          <Shield size={20} style={{ color: "var(--bm-red)" }} />
          <h1 className="text-3xl font-bold text-[var(--bm-text)] tracking-tight">
            Break My Startup
          </h1>
        </div>
        <p className="text-sm text-[var(--bm-text2)] leading-relaxed max-w-xl mt-1">
          Run a brutal, honest stress-test on your current project or any idea.
          No sugarcoating. The goal is to make you stronger, not scare you.
        </p>
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
                    {projects.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.title ?? p.project_name ?? p.name ?? "Untitled"}
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
              <label className="text-xs font-medium text-[var(--bm-text2)] uppercase tracking-widest">
                Focus Areas (optional)
              </label>
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
                Leave empty to stress-test everything.
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
                className="self-start"
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
            {/* Overall risk header */}
            <Card
              className="p-5 flex items-center gap-5 flex-wrap"
              style={{
                borderColor: overallColor(result.overallRisk) + "44",
                background: `linear-gradient(135deg, ${overallColor(result.overallRisk)}08 0%, var(--bm-bg2) 60%)`,
              }}
            >
              {result.survival_probability !== undefined && (
                <SurvivalRing value={result.survival_probability} />
              )}

              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--bm-text3)] uppercase tracking-widest">Overall Risk</span>
                  <Badge variant={severityVariant(result.overallRisk)} size="md" dot>
                    {result.overallRisk}
                  </Badge>
                </div>
                {result.summary && (
                  <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{result.summary}</p>
                )}
              </div>
            </Card>

            {/* Brutal advice */}
            {result.brutal_advice && (
              <Card
                className="p-4 flex flex-col gap-2"
                style={{
                  borderColor: "rgba(232,160,32,0.25)",
                  background: "rgba(232,160,32,0.04)",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={12} style={{ color: "var(--bm-amber)" }} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--bm-amber)" }}>
                    Brutal Advice
                  </span>
                </div>
                <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{result.brutal_advice}</p>
              </Card>
            )}

            {/* Risk breakdown cards */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-[var(--bm-text)]">Risk Breakdown</h3>
              {result.risks.map((risk, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                >
                  <Card className="p-4 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--bm-text)]">{risk.category}</span>
                      <Badge variant={severityVariant(risk.severity)} size="sm" dot>
                        {risk.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-[var(--bm-text2)] leading-relaxed">{risk.description}</p>
                    <div
                      className="flex items-start gap-2 text-xs p-3 rounded-lg"
                      style={{
                        background: "var(--bm-bg3)",
                        color: "var(--bm-text3)",
                      }}
                    >
                      <CheckCircle2
                        size={12}
                        className="shrink-0 mt-0.5"
                        style={{ color: "var(--bm-accent)" }}
                      />
                      <span>{risk.mitigation}</span>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
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
