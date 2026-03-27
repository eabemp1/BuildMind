"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { calculateDashboardStats, computeStartupScore, type ProjectSummary } from "@/lib/buildmind";
import { useDashboardOverviewQuery, useProjectsQuery, useProjectSummariesQuery } from "@/lib/queries";
import { checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";

const STAGE_STEPS = ["Idea", "Validation", "Prototype", "MVP", "Launch", "Revenue"];

const STAGE_ACTIONS: Record<string, Array<{ action: string; message: string; why: string }>> = {
  validation: [
    { action: "Talk to 5 potential users to validate your idea.", message: "Hey — I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens?", why: "User feedback invalidates assumptions faster than any other activity." },
    { action: "Draft 3 test questions and run 2 discovery calls today.", message: "Could I ask 3 quick questions about how you handle [problem]? I'm validating a solution idea.", why: "You need insight depth before you build anything." },
  ],
  mvp: [
    { action: "Send your working link to one warm contact before end of day.", message: "Hey — I've been building [product] to solve [problem]. Would you try it for 10 minutes and tell me what breaks?", why: "What they see today teaches you more than 3 more days of polishing." },
    { action: "Ship one tiny feature you can demo in 60 seconds.", message: "Here's a 60‑sec demo of [product]. What would make this 10x more useful for you?", why: "Small shipped demos create real feedback loops." },
  ],
  launch: [
    { action: "Acquire your first 10 users through a focused channel.", message: "We just launched [product]. Would love your support and brutal feedback: [link]", why: "Launch momentum needs a measurable acquisition experiment." },
    { action: "Post one focused launch update and ask for feedback.", message: "We just shipped [product] for [target users]. What’s the #1 thing you’d want next?", why: "Public feedback gives you real market signals." },
  ],
  revenue: [
    { action: "Call one churned user today — not to win them back, to understand why.", message: "Hey — I noticed you stopped using [product]. I just want to understand what didn't work. 10 minutes?", why: "Churn analysis is the highest‑leverage activity at revenue stage." },
    { action: "Ask 2 active users what they'd pay for next.", message: "Quick question: what would make this worth $X/month for you?", why: "Revenue grows fastest when pricing signals are explicit." },
  ],
  default: [
    { action: "Run quick market research to validate the opportunity.", message: "Hey, quick question — what's your biggest challenge with [your problem area]?", why: "Clarify your target users and validate the problem urgency." },
    { action: "Write a one‑sentence problem statement and test it.", message: "I’m exploring this problem: [problem]. Does that feel accurate to your world?", why: "A sharp problem statement guides every next step." },
  ],
};

function dayOfYear(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((now - start) / 86400000);
}

function pickDailyIndex(seed: string, length: number): number {
  const d = new Date();
  const key = `${seed}-${d.getUTCFullYear()}-${dayOfYear(d)}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 2147483647;
  }
  return length ? hash % length : 0;
}

function getAction(stage: string) {
  const s = stage.toLowerCase();
  if (s.includes("valid") || s.includes("discover")) {
    const items = STAGE_ACTIONS.validation;
    return items[pickDailyIndex("validation", items.length)];
  }
  if (s.includes("mvp") || s.includes("proto")) {
    const items = STAGE_ACTIONS.mvp;
    return items[pickDailyIndex("mvp", items.length)];
  }
  if (s.includes("launch")) {
    const items = STAGE_ACTIONS.launch;
    return items[pickDailyIndex("launch", items.length)];
  }
  if (s.includes("revenue") || s.includes("growth")) {
    const items = STAGE_ACTIONS.revenue;
    return items[pickDailyIndex("revenue", items.length)];
  }
  const items = STAGE_ACTIONS.default;
  return items[pickDailyIndex("default", items.length)];
}

// Resend-style section header
function SectionHeader({ children }: { children: string }) {
  return <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>{children}</div>;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: projects = [], isLoading: projectsLoading } = useProjectsQuery();
  const { data: summaries = [], isLoading: summariesLoading } = useProjectSummariesQuery();
  const { data: overview, isLoading: overviewLoading } = useDashboardOverviewQuery();
  const stats = useMemo(() => calculateDashboardStats(projects), [projects]);

  const activeProjectSummary = useMemo<ProjectSummary | null>(() => {
    if (!summaries.length) return null;
    return summaries.reduce((latest, current) =>
      new Date(current.lastActivity).getTime() > new Date(latest.lastActivity).getTime() ? current : latest,
    );
  }, [summaries]);

  const activeProjectScore = useMemo(() => {
    if (!summaries.length) return 0;
    return computeStartupScore(activeProjectSummary ?? summaries[0]);
  }, [summaries, activeProjectSummary]);

  const activeStage = useMemo(() => {
    if (!activeProjectSummary) return "Idea";
    const stage = (activeProjectSummary.startup_stage ?? "").trim();
    if (stage) return stage;
    const sc = activeProjectSummary.validation_strengths?.length ?? 0;
    if (sc >= 3) return "Validation";
    if (sc > 0) return "Discovery";
    return "Idea";
  }, [activeProjectSummary]);

  const stageIndex = useMemo(() => {
    const s = activeStage.toLowerCase();
    if (s.includes("idea")) return 0;
    if (s.includes("valid") || s.includes("discover")) return 1;
    if (s.includes("proto")) return 2;
    if (s.includes("mvp")) return 3;
    if (s.includes("launch")) return 4;
    return 5;
  }, [activeStage]);

  const nextAction = useMemo(() => getAction(activeStage), [activeStage]);
  const streak = overview?.founderStreakDays ?? 0;
  const computedScore = useMemo(() => {
    if (!summaries.length) return 0;
    return computeStartupScore(activeProjectSummary ?? summaries[0]);
  }, [activeProjectSummary, summaries]);
  const rawExecutionScore = activeProjectSummary?.execution_score ?? 0;
  const executionScore = Math.max(rawExecutionScore, computedScore);
  const accountabilityRate = activeProjectSummary?.progress ?? 0;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (overview?.founderStreakDays) localStorage.setItem("bm_streak", String(overview.founderStreakDays));
  }, [overview?.founderStreakDays]);

  if (projectsLoading || summariesLoading || overviewLoading) {
    return <div style={{ fontSize: 12, color: "#666", padding: "60px 0", textAlign: "center", fontFamily: "system-ui,sans-serif" }}>Loading...</div>;
  }

  if (!projects.length) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ maxWidth: 440, margin: "80px auto", fontFamily: "system-ui,sans-serif" }}>
        <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, padding: "32px 28px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#fff", marginBottom: 8 }}>Create your first project</div>
          <div style={{ fontSize: 13, color: "#888", lineHeight: 1.65, marginBottom: 24 }}>Turn your idea into an execution roadmap with daily actions and AI accountability.</div>
          <button onClick={() => router.push("/projects")}
            style={{ background: "#fff", color: "#000", fontWeight: 500, fontSize: 13, padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            New project
          </button>
        </div>
      </motion.div>
    );
  }

  const scoreColor = executionScore >= 60 ? "#4ade80" : executionScore >= 30 ? "#fbbf24" : "#f87171";
  const acctColor = accountabilityRate >= 60 ? "#4ade80" : "#fbbf24";
  const streakColor = streak >= 3 ? "#fbbf24" : "#e5e5e5";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      style={{ maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5" }}>

      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid #1c1c1c" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Overview</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{activeProjectSummary?.title ?? "BuildMind"} · {activeStage} stage</div>
        </div>
        <button onClick={() => router.push("/projects")}
          style={{ background: "transparent", border: "1px solid #222", color: "#888", fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
          View projects
        </button>
      </div>

      {/* Metric tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
        {[
          { label: "Execution score", value: String(executionScore), suffix: "/100", color: scoreColor },
          { label: "Accountability", value: String(accountabilityRate), suffix: "%", color: acctColor },
          { label: "Streak", value: String(streak), suffix: " days", color: streakColor },
          { label: "Tasks completed", value: String(overview?.completedTasks ?? 0), suffix: "", color: "#e5e5e5" },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "18px 20px", background: "#080808", borderRight: i < 3 ? "1px solid #1c1c1c" : "none" }}>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.09em" }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: s.color, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {s.value}<span style={{ fontSize: 13, color: "#555", fontWeight: 400 }}>{s.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Stage journey */}
      <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, padding: "14px 20px", marginBottom: 16, background: "#080808" }}>
        <SectionHeader>Startup journey</SectionHeader>
        <div style={{ display: "flex", alignItems: "center" }}>
          {STAGE_STEPS.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: i < STAGE_STEPS.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 600,
                  background: i < stageIndex ? "#fff" : "transparent",
                  border: i === stageIndex ? "1px solid #fff" : i < stageIndex ? "1px solid #fff" : "1px solid #2a2a2a",
                  color: i < stageIndex ? "#000" : i === stageIndex ? "#fff" : "#444",
                }}>
                  {i < stageIndex ? "✓" : i + 1}
                </div>
                <div style={{ fontSize: 10, color: i === stageIndex ? "#e5e5e5" : i < stageIndex ? "#666" : "#333", whiteSpace: "nowrap" }}>{s}</div>
              </div>
              {i < STAGE_STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: i < stageIndex ? "#333" : "#1c1c1c", margin: "0 5px", marginBottom: 16 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 12, marginBottom: 12 }}>

        {/* Today's action card — light background for contrast */}
        <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", borderBottom: "1px solid #1c1c1c", background: "#080808", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#888" }}>Today&apos;s action</span>
            <span style={{ fontSize: 10, color: "#555", background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "2px 7px" }}>Stage: {activeStage}</span>
          </div>
          <div style={{ padding: "20px", background: "#f5f5f4" }}>
            <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Do this now</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 14, lineHeight: 1.4, letterSpacing: "-0.01em" }}>{nextAction.action}</div>
            <div style={{ background: "#eaeae8", borderRadius: 6, padding: "11px 13px", marginBottom: 14, position: "relative" }}>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#333", lineHeight: 1.65, fontStyle: "italic", paddingRight: 56 }}>
                &ldquo;{nextAction.message}&rdquo;
              </div>
              <button onClick={() => { navigator.clipboard.writeText(nextAction.message).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                style={{ position: "absolute", top: 8, right: 8, background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "3px 8px", fontSize: 11, color: "#555", cursor: "pointer", fontFamily: "inherit" }}>
                {copied ? "✓" : "Copy"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => router.push("/projects")}
                style={{ flex: 1, background: "#111", color: "#fff", fontWeight: 500, fontSize: 12, padding: "9px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Mark done
              </button>
              <button onClick={() => router.push("/ai-coach")}
                style={{ background: "transparent", border: "1px solid #ccc", color: "#555", fontSize: 12, padding: "9px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                Ask BuildMini
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 10, lineHeight: 1.5 }}>WHY: {nextAction.why}</div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, padding: "14px 16px", background: "#080808" }}>
            <SectionHeader>{`Proven next steps · ${activeStage}`}</SectionHeader>
            <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7, marginBottom: 12 }}>
              {stageIndex === 0 && "Talk to potential users before writing any code. Every assumption is probably wrong."}
              {stageIndex === 1 && "Send 10 personal DMs to potential users before building anything else."}
              {stageIndex === 2 && "Record a 3-minute Loom walkthrough. Ship something visible."}
              {stageIndex === 3 && "Get your link in front of one warm contact today. Polish later."}
              {stageIndex === 4 && "Post on Product Hunt. Imperfect listing beats no listing."}
              {stageIndex >= 5 && "Call one churned user. Every answer beats 10 feature ideas."}
            </div>
            <button onClick={() => router.push("/ai-coach")}
              style={{ fontSize: 12, color: "#777", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              Ask BuildMini for more →
            </button>
          </div>

          <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, padding: "14px 16px", background: "#080808", flex: 1 }}>
            <SectionHeader>Recent activity</SectionHeader>
            {(overview?.recentActivity ?? []).length === 0 ? (
              <div style={{ fontSize: 12, color: "#444" }}>No activity yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(overview?.recentActivity ?? []).slice(0, 5).map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#888", lineHeight: 1.5 }}>
                    <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#444", flexShrink: 0, marginTop: 6 }} />
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Projects table */}
      {summaries.length > 0 && (
        <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "11px 18px", borderBottom: "1px solid #1c1c1c", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#080808" }}>
            <span style={{ fontSize: 12, color: "#888" }}>Active projects</span>
            <button onClick={() => router.push("/projects")} style={{ fontSize: 12, color: "#666", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Project", "Stage", "Progress", "Score", ""].map((h) => (
                  <th key={h} style={{ padding: "9px 18px", textAlign: "left", fontSize: 10, color: "#555", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #111", background: "#080808" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaries.slice(0, 5).map((s, i) => {
                const score = computeStartupScore(s);
                const progress = s.progress ?? 0;
                const sc = score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#888";
                return (
                  <tr key={s.id} onClick={() => router.push(`/projects/${s.id}`)}
                    style={{ cursor: "pointer", borderBottom: i < Math.min(summaries.length, 5) - 1 ? "1px solid #111" : "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#0d0d0d"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                    <td style={{ padding: "12px 18px", fontSize: 13, color: "#d4d4d4", fontWeight: 500 }}>{s.title}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ fontSize: 11, color: "#888", background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "2px 8px" }}>{s.startup_stage ?? "Idea"}</span>
                    </td>
                    <td style={{ padding: "12px 18px", minWidth: 120 }}>
                      <div style={{ height: 2, background: "#1c1c1c", borderRadius: 9999, overflow: "hidden", marginBottom: 4, width: 80 }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: "#444", borderRadius: 9999 }} />
                      </div>
                      <div style={{ fontSize: 11, color: "#666" }}>{progress}%</div>
                    </td>
                    <td style={{ padding: "12px 18px", fontSize: 13, color: sc, fontVariantNumeric: "tabular-nums" }}>{score}</td>
                    <td style={{ padding: "12px 18px", fontSize: 12, color: "#555", textAlign: "right" }}>→</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
