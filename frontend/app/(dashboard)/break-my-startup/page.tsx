"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useProjectsQuery } from "@/lib/queries";
import { createClient } from "@/lib/supabase/client";
import { getPlan } from "@/lib/plan";
import { useLimitModal } from "@/components/LimitModal";

type Analysis = {
  verdict: string;
  kill_reasons: string[];
  survive_reasons: string[];
  brutal_advice: string;
  survival_probability: number;
};

const surfaceCard = {
  background: "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(9,12,22,0.96))",
  border: "1px solid rgba(99,102,241,0.15)",
  borderRadius: 18,
  boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
};

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}33`,
        background: `${color}12`,
        fontFamily: "monospace",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function ProbabilityRing({ value }: { value: number }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const color = value >= 65 ? "#4ade80" : value >= 40 ? "#fbbf24" : "#f87171";

  return (
    <div style={{ position: "relative", width: 132, height: 132, flexShrink: 0 }}>
      <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="66" cy="66" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <motion.circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (value / 100) * circumference }}
          transition={{ duration: 1.25, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color, letterSpacing: "-0.04em", lineHeight: 1 }}>{value}%</div>
        <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 4 }}>survival</div>
      </div>
    </div>
  );
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let index = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (index >= text.length) return;
      const chunk = Math.floor(Math.random() * 3) + 2;
      index = Math.min(index + chunk, text.length);
      setDisplayed(text.slice(0, index));
      const delay = text[index - 1] === "." ? 46 : 16;
      window.setTimeout(tick, delay);
    };

    const starter = window.setTimeout(tick, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(starter);
    };
  }, [text]);

  return (
    <span>
      {displayed}
      {displayed.length < text.length ? (
        <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity }} style={{ marginLeft: 2, color: "#a78bfa" }}>
          ▊
        </motion.span>
      ) : null}
    </span>
  );
}

function ReasonList({ title, color, icon, items }: { title: string; color: string; icon: string; items: string[] }) {
  return (
    <div style={{ ...surfaceCard, overflow: "hidden" }}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <div style={{ fontSize: 11, color, textTransform: "uppercase", letterSpacing: "0.11em", fontFamily: "monospace" }}>{title}</div>
        </div>
        <div style={{ fontSize: 10, color: "var(--bm-text4)", fontFamily: "monospace" }}>{items.length} points</div>
      </div>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((item, index) => (
          <motion.div
            key={`${title}-${index}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + index * 0.06 }}
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 12,
              border: `1px solid ${color}1f`,
              background: `${color}0d`,
            }}
          >
            <div style={{ color, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{String(index + 1).padStart(2, "0")}</div>
            <div style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65 }}>{item}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AnalysisSkeleton() {
  const steps = [
    "Reading your active project and validation notes",
    "Checking task completion and milestone momentum",
    "Looking for missing proof of demand",
    "Scoring distribution, timing, and execution risk",
    "Writing the brutally honest summary",
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ ...surfaceCard, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(167,139,250,0.3)", borderTopColor: "#a78bfa" }}
        />
        <div style={{ fontSize: 13, color: "var(--bm-text2)", fontWeight: 600 }}>Running adversarial analysis...</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((step, index) => (
          <motion.div
            key={step}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.12 }}
            style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--bm-text3)", fontFamily: "monospace" }}
          >
            <span style={{ color: "#818cf8" }}>→</span>
            {step}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function TeaserAnalysis({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gap: 16 }}>
      <div style={{ ...surfaceCard, padding: 24, position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 22 }}>
          <ProbabilityRing value={41} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Chip label="preview" color="#f59e0b" />
              <Chip label="builder unlock" color="#818cf8" />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--bm-text)", letterSpacing: "-0.03em", marginBottom: 8 }}>
              Your startup is in the danger zone.
            </div>
            <div style={{ fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.7, maxWidth: 520, filter: "blur(4px)", userSelect: "none" }}>
              Weak proof of demand, fragile momentum, and unclear monetisation are making this much harder to survive than it needs to be.
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(7,10,18,0.42), rgba(7,10,18,0.84))",
            backdropFilter: "blur(7px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 24,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Full breakdown lives on Builder</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", maxWidth: 320, lineHeight: 1.7, marginBottom: 16 }}>
            See the real survival score, every kill reason, every survive reason, and the single move that changes the odds.
          </div>
          <button
            onClick={onUpgrade}
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 13, padding: "11px 22px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit" }}
          >
            Unlock Builder — $19/mo →
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        <ReasonList title="Kill reasons" color="#f87171" icon="✕" items={[
          "No clear proof that users urgently want this today.",
          "Hidden on Builder: the operational bottleneck most likely to stall you.",
          "Hidden on Builder: the assumption your current plan is leaning on too hard.",
        ]} />
        <ReasonList title="Survive reasons" color="#4ade80" icon="✓" items={[
          "Hidden on Builder: the strongest signal already in your favor.",
          "Hidden on Builder: the leverage point that could improve the odds fast.",
          "Hidden on Builder: the execution pattern worth doubling down on.",
        ]} />
      </div>
    </motion.div>
  );
}

export default function BreakMyStartupPage() {
  const router = useRouter();
  const { showLimit } = useLimitModal();
  const { data: projects = [], isLoading } = useProjectsQuery();
  const [selectedId, setSelectedId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);

  const plan = getPlan();
  const isFree = plan === "free";
  const activeId = selectedId || projects[0]?.id || "";
  const activeProject = projects.find((project) => project.id === activeId) ?? projects[0];

  const runAnalysis = async () => {
    if (!activeId) return;
    setLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not authenticated");

      const res = await fetch("/api/ai/break-my-startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id, projectId: activeId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error || "Analysis failed"));

      if (isFree) setShowTeaser(true);
      else setAnalysis(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ fontSize: 12, color: "var(--bm-text4)", padding: "60px 0", textAlign: "center", fontFamily: "system-ui,sans-serif" }}>
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>Loading analysis room...</motion.div>
      </div>
    );
  }

  if (!projects.length) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 460, margin: "80px auto", fontFamily: "system-ui,sans-serif" }}>
        <div style={{ ...surfaceCard, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 42, marginBottom: 14 }}>🧪</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No project to attack yet</div>
          <div style={{ fontSize: 13, color: "var(--bm-text3)", marginBottom: 22, lineHeight: 1.7 }}>
            Create a project first so BuildMind has real validation, task, and milestone data to analyze.
          </div>
          <button onClick={() => router.push("/projects")} style={{ background: "#fff", color: "#000", fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            Create project
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: 1080, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "var(--bm-text)", paddingBottom: 40 }}>
      <div style={{ ...surfaceCard, padding: 24, marginBottom: 18, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at top right, rgba(248,113,113,0.22), transparent 38%), radial-gradient(circle at bottom left, rgba(99,102,241,0.18), transparent 35%)" }} />
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
          <div style={{ maxWidth: 620 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <Chip label="adversarial review" color="#f87171" />
              <Chip label={isFree ? "free preview" : "builder unlocked"} color={isFree ? "#f59e0b" : "#818cf8"} />
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.05, marginBottom: 10 }}>
              Break My Startup
            </div>
            <div style={{ fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.75, maxWidth: 560 }}>
              This is the uncomfortable room. We pressure-test your startup like a hostile investor and an exhausted founder at the same time.
              The goal is not to flatter you. The goal is to surface what breaks before reality does.
            </div>
          </div>

          <div style={{ minWidth: 250, maxWidth: 300, width: "100%" }}>
            {projects.length > 1 ? (
              <select
                value={activeId}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{ width: "100%", background: "rgba(8,10,18,0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "var(--bm-text2)", outline: "none", fontFamily: "inherit", cursor: "pointer", marginBottom: 12 }}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.title}</option>
                ))}
              </select>
            ) : null}
            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.18)", padding: 14 }}>
              <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, fontFamily: "monospace" }}>Current target</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", marginBottom: 4 }}>{activeProject?.title ?? "Untitled project"}</div>
              <div style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.6 }}>{isFree ? "You’ll see a preview first." : "You’ll get the full analysis on this run."}</div>
            </div>
          </div>
        </div>
      </div>

      {!confirmed && !analysis && !showTeaser ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ ...surfaceCard, padding: 24, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Ready for the truth?</div>
              <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.75, marginBottom: 16 }}>
                We’re going to look for weak demand signals, fragile execution patterns, monetization gaps, and the blind spots your optimism may be covering up.
              </div>
              {isFree ? (
                <div style={{ fontSize: 12, color: "#fbbf24", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.6, fontFamily: "monospace" }}>
                  Free plan shows a preview only. Builder unlocks the full survival score, complete failure reasons, and the one move that changes the odds.
                </div>
              ) : null}
            </div>
            <div style={{ borderRadius: 14, border: "1px solid rgba(248,113,113,0.14)", background: "rgba(248,113,113,0.06)", padding: 16 }}>
              <div style={{ fontSize: 10, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, fontFamily: "monospace" }}>Attack surface</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.65 }}>
                <div>• Validation signals versus your claims</div>
                <div>• Task and milestone momentum versus your ambition</div>
                <div>• Where the startup is likely to stall first</div>
                <div>• The strongest reason it may still survive</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setConfirmed(true); void runAnalysis(); }}
              style={{ background: "linear-gradient(135deg,#ef4444,#8b5cf6)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: "11px 18px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}
            >
              {isFree ? "Preview analysis →" : "Run full analysis →"}
            </motion.button>
            <button onClick={() => router.push("/dashboard")} style={{ background: "transparent", border: "1px solid var(--bm-border)", color: "var(--bm-text3)", fontSize: 13, padding: "11px 18px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
              Not yet
            </button>
          </div>
        </motion.div>
      ) : null}

      {loading ? <AnalysisSkeleton /> : null}

      {error ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 13, color: "#f87171", padding: "12px 16px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, marginTop: 16 }}>
          {error}
        </motion.div>
      ) : null}

      <AnimatePresence>{showTeaser && !loading ? <TeaserAnalysis onUpgrade={() => showLimit("break_startup")} /> : null}</AnimatePresence>

      <AnimatePresence>
        {analysis && !loading ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} style={{ display: "grid", gap: 16 }}>
            <div style={{ ...surfaceCard, padding: 24 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
                <ProbabilityRing value={analysis.survival_probability} />
                <div style={{ flex: 1, minWidth: 250 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <Chip label={analysis.survival_probability >= 65 ? "promising" : analysis.survival_probability >= 40 ? "fragile" : "high risk"} color={analysis.survival_probability >= 65 ? "#4ade80" : analysis.survival_probability >= 40 ? "#fbbf24" : "#f87171"} />
                    <Chip label="full analysis" color="#818cf8" />
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", marginBottom: 10 }}>Verdict</div>
                  <div style={{ fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.8, minHeight: 56 }}>
                    <TypewriterText text={analysis.verdict} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
              <ReasonList title="Kill reasons" color="#f87171" icon="✕" items={analysis.kill_reasons ?? []} />
              <ReasonList title="Survive reasons" color="#4ade80" icon="✓" items={analysis.survive_reasons ?? []} />
            </div>

            {analysis.brutal_advice ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} style={{ ...surfaceCard, padding: 24, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at top left, rgba(167,139,250,0.16), transparent 32%)" }} />
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <Chip label="brutal advice" color="#a78bfa" />
                    <Chip label="what to fix next" color="#60a5fa" />
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 10 }}>The move that matters most</div>
                  <div style={{ fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.8 }}>
                    <TypewriterText text={analysis.brutal_advice} />
                  </div>
                </div>
              </motion.div>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => { setAnalysis(null); setConfirmed(false); setShowTeaser(false); }} style={{ background: "transparent", border: "1px solid var(--bm-border)", color: "var(--bm-text3)", fontSize: 12, padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                Run again
              </button>
              <button onClick={() => router.push("/ai-coach")} style={{ background: "transparent", border: "1px solid rgba(99,102,241,0.22)", color: "#818cf8", fontSize: 12, padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                Discuss with AI Coach →
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
