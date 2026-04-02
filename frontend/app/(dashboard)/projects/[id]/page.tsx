"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import {
  type BuildMindMilestone,
  type BuildMindTask,
  computeStartupScore,
  updateMilestoneForCurrentUser,
} from "@/lib/buildmind";
import { useDeleteProjectMutation, useProjectDetailQuery, useUpdateTaskMutation } from "@/lib/queries";
import { setActiveProjectId } from "@/lib/api";
import { recordTaskCompletion, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";

type Tab = "milestones" | "tasks" | "validation" | "roadmap";

const inp = {
  background: "#080808", border: "1px solid #1c1c1c", borderRadius: 6,
  padding: "8px 12px", fontSize: 13, color: "#d4d4d4", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box" as const, transition: "border-color 0.15s",
};

const STAGE_ROADMAPS: Record<string, { step: string; detail: string; time: string }[]> = {
  Idea: [
    { step: "Talk to 5 people who have this problem — before writing any code.", detail: "Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.", time: "2 hrs" },
    { step: "Write down your riskiest assumption and the cheapest way to test it.", detail: "The biggest startup killers are untested assumptions held for too long.", time: "30 min" },
    { step: "Find 3 existing solutions and understand exactly why users are still frustrated.", detail: "If a solution exists, understand the gap before you build another one.", time: "1 hr" },
  ],
  Validation: [
    { step: "Send 10 personal outreach DMs — no pitch, just questions.", detail: "The Mom Test: ask about their life, not your idea. You'll get honest answers.", time: "1–2 hrs" },
    { step: "Run 5 user interviews and record every one.", detail: "Patterns only emerge across conversations, not from a single one.", time: "1 wk" },
    { step: "Map every piece of feedback to a specific problem — not a feature.", detail: "Feature requests are symptoms. Problems are what you're solving.", time: "30 min" },
  ],
  MVP: [
    { step: "Get your working link to one warm contact before end of day.", detail: "The version they see today teaches you more than 3 more days of polishing.", time: "30 min" },
    { step: "Define what MVP success looks like in numbers, not feelings.", detail: "You can't improve what you don't measure.", time: "20 min" },
    { step: "Run 3 usability sessions — watch someone use it without helping them.", detail: "You'll find problems in 20 minutes you'd never find on your own.", time: "1 hr each" },
  ],
  Launch: [
    { step: "Post on Product Hunt — imperfect listing beats no listing.", detail: "Notion launched imperfect and got 10K users in 24h. Visibility > polish.", time: "3 hrs" },
    { step: "Post your story on Indie Hackers with your launch numbers.", detail: "Transparency builds trust. The community rewards honesty.", time: "1 hr" },
    { step: "Set up a day 1 / day 3 / day 7 retention email sequence.", detail: "Acquisition is expensive. Retention compounds.", time: "2 hrs" },
  ],
  Revenue: [
    { step: "Call one churned user — not to win them back, to understand why.", detail: "Churn analysis beats 10 feature ideas every time.", time: "1 hr" },
    { step: "Identify your top 3 retention levers and run one experiment.", detail: "A 5% improvement in retention can double revenue over time.", time: "1 wk" },
    { step: "Set a revenue goal for this quarter and work backwards to weekly actions.", detail: "Goals without weekly checkpoints are just wishes.", time: "30 min" },
  ],
};

function appendNote(existing: string | null | undefined, next: string): string {
  if (!next.trim()) return existing ?? "";
  return existing ? `${existing}||${next.trim()}` : next.trim();
}
function splitNotes(notes?: string | null): string[] {
  if (!notes) return [];
  return notes.split("||").map((n) => n.trim()).filter(Boolean);
}

function ScoreRing({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const color = score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ position: "relative", width: 70, height: 70, flexShrink: 0 }}>
      <svg width="70" height="70" viewBox="0 0 70 70" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
        <motion.circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          style={{ fontSize: 18, fontWeight: 600, color, lineHeight: 1 }}>{score}</motion.div>
        <div style={{ fontSize: 8, color: "#444", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 1 }}>score</div>
      </div>
    </div>
  );
}

function TaskCheckbox({ checked, onChange, size = 16 }: { checked: boolean; onChange: () => void; size?: number }) {
  const controls = useAnimation();
  const handleClick = async () => {
    if (!checked) {
      await controls.start({ scale: [1, 1.35, 0.9, 1.1, 1], transition: { duration: 0.35 } });
    }
    onChange();
  };
  return (
    <motion.button animate={controls} onClick={handleClick}
      style={{ width: size, height: size, borderRadius: 4, border: checked ? "none" : "1px solid #2a2a2a", background: checked ? "#fff" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}>
      {checked && <span style={{ fontSize: size * 0.6, color: "#000", lineHeight: 1 }}>✓</span>}
    </motion.button>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error } = useProjectDetailQuery(id);
  const deleteMutation = useDeleteProjectMutation();

  // FIX: use useUpdateTaskMutation which invalidates summaries → stage recomputes
  const updateMutation = useUpdateTaskMutation(id);

  useEffect(() => {
    if (id) setActiveProjectId(id);
  }, [id]);

  const milestoneMutation = useMutation({
    mutationFn: (payload: { id: string; title?: string; stage?: string }) =>
      updateMilestoneForCurrentUser(payload.id, { title: payload.title, stage: payload.stage }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.project(id) }),
  });

  const [tab, setTab] = useState<Tab>("milestones");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [newNoteDraft, setNewNoteDraft] = useState<Record<string, string>>({});
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { project, milestones = [], tasks = [] } = data ?? {};

  const stage = project?.startup_stage ?? "MVP";
  const score = useMemo(() => project ? computeStartupScore({
    progress: tasks.length ? Math.round((tasks.filter((t) => t.is_completed).length / tasks.length) * 100) : 0,
    validation_strengths: project.validation_strengths,
    execution_score: project.execution_score,
  }) : 0, [project, tasks]);

  const completedCount = useMemo(() => tasks.filter((t) => t.is_completed).length, [tasks]);
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  const toggleTask = (task: BuildMindTask) => {
    const newCompleted = !task.is_completed;
    updateMutation.mutate({ taskId: task.id, isCompleted: newCompleted, notes: notesDraft[task.id] ?? task.notes ?? "" });
    if (newCompleted) {
      recordTaskCompletion();
      const streak = Number(localStorage.getItem("bm_streak") ?? "1");
      const { shouldUpgrade } = checkUpgradeTrigger(streak);
      if (shouldUpgrade) setShowUpgrade(true);
    }
  };

  const milestoneProgress = (m: BuildMindMilestone) => {
    const mt = tasks.filter((t) => t.milestone_id === m.id);
    if (!mt.length) return 0;
    return Math.round((mt.filter((t) => t.is_completed).length / mt.length) * 100);
  };

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#333", fontSize: 12 }}>
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
        Loading project...
      </motion.div>
    </div>
  );

  if (error || !project) return (
    <div style={{ fontSize: 13, color: "#f87171", padding: 20 }}>
      {error instanceof Error ? error.message : "Project not found."}
      <button onClick={() => router.back()} style={{ display: "block", marginTop: 12, background: "none", border: "none", color: "#555", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Back</button>
    </div>
  );

  const roadmapSteps = STAGE_ROADMAPS[stage] ?? STAGE_ROADMAPS["MVP"];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 840, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", paddingBottom: 48 }}>

      {/* Upgrade nudge */}
      <AnimatePresence>
        {showUpgrade && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa" }}>You're making progress.</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Unlock your next steps and keep building.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => router.push(`/upgrade?tasks=${getTasksDone()}&streak=${localStorage.getItem("bm_streak") ?? 1}`)}
                style={{ background: "#fff", color: "#000", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Continue →
              </button>
              <button onClick={() => setShowUpgrade(false)}
                style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 18, lineHeight: 1, fontFamily: "inherit" }}>×</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1c1c1c", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button onClick={() => router.back()}
            style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 12, padding: 0, marginBottom: 8, fontFamily: "inherit" }}>
            ← Projects
          </button>
          <div style={{ fontSize: 20, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em", wordBreak: "break-word" }}>{project.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: "#a78bfa", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 4, padding: "2px 8px" }}>
              {stage}
            </span>
            <span style={{ fontSize: 11, color: "#555" }}>{completedCount}/{tasks.length} tasks</span>
            <span style={{ fontSize: 11, color: "#555" }}>{progress}% complete</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <ScoreRing score={score} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={() => router.push("/today")}
              style={{ background: "#fff", color: "#000", fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              ⚡ Today's action
            </button>
            <button onClick={() => {
              if (window.confirm(`Delete "${project.title}"?`)) {
                deleteMutation.mutate(id, { onSuccess: () => router.push("/projects") });
              }
            }}
              style={{ background: "none", border: "1px solid #1c1c1c", color: "#333", fontSize: 12, padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "#111", borderRadius: 9999, overflow: "hidden", marginBottom: 20 }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", background: progress >= 60 ? "#4ade80" : "#6366f1", borderRadius: 9999 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1c1c1c", marginBottom: 20 }}>
        {(["milestones", "tasks", "roadmap", "validation"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 16px", fontSize: 13, fontWeight: tab === t ? 500 : 400, color: tab === t ? "#fff" : "#444", background: "none", border: "none", borderBottom: tab === t ? "1.5px solid #fff" : "1.5px solid transparent", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize", transition: "color 0.15s", marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* MILESTONES TAB */}
      {tab === "milestones" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {milestones.length === 0 && (
            <div style={{ fontSize: 13, color: "#444", textAlign: "center", padding: 40 }}>
              No milestones yet. BuildMind generates them from your project idea.
            </div>
          )}
          {milestones.map((m, mi) => {
            const mp = milestoneProgress(m);
            const mt = tasks.filter((t) => t.milestone_id === m.id);
            const isComplete = mt.length > 0 && mt.every((t) => t.is_completed);
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: mi * 0.06 }}
                style={{ background: "#0d0d0d", border: isComplete ? "1px solid rgba(74,222,128,0.2)" : "1px solid #1c1c1c", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #111" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: isComplete ? "#4ade80" : "transparent", border: isComplete ? "none" : "1.5px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {isComplete && <span style={{ fontSize: 11, color: "#000", lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: isComplete ? "#4ade80" : "#d4d4d4" }}>{m.title}</div>
                    <div style={{ fontSize: 10, color: "#444", marginTop: 1 }}>{mt.filter((t) => t.is_completed).length}/{mt.length} tasks · {mp}%</div>
                  </div>
                  <div style={{ width: 40, height: 2, background: "#111", borderRadius: 9999, overflow: "hidden", flexShrink: 0 }}>
                    <div style={{ height: "100%", width: `${mp}%`, background: "#6366f1", borderRadius: 9999 }} />
                  </div>
                </div>
                {mt.length > 0 && (
                  <div style={{ padding: "8px 16px 12px" }}>
                    {mt.map((task) => (
                      <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderBottom: "1px solid #0f0f0f" }}>
                        <div style={{ paddingTop: 1 }}>
                          <TaskCheckbox checked={task.is_completed} onChange={() => toggleTask(task)} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: task.is_completed ? "#2a2a2a" : "#94a3b8", textDecoration: task.is_completed ? "line-through" : "none", lineHeight: 1.45, transition: "all 0.25s" }}>
                            {task.title}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* TASKS TAB */}
      {tab === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tasks.length === 0 && <div style={{ fontSize: 13, color: "#444", textAlign: "center", padding: 40 }}>No tasks yet.</div>}
          {tasks.map((task, ti) => {
            const milestone = milestones.find((m) => m.id === task.milestone_id);
            const notes = splitNotes(task.notes);
            return (
              <motion.div key={task.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ti * 0.04 }}
                style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ paddingTop: 2 }}>
                    <TaskCheckbox checked={task.is_completed} onChange={() => toggleTask(task)} size={15} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: task.is_completed ? "#333" : "#d4d4d4", textDecoration: task.is_completed ? "line-through" : "none", marginBottom: milestone ? 3 : 0, lineHeight: 1.45 }}>
                      {task.title}
                    </div>
                    {milestone && (
                      <div style={{ fontSize: 10, color: "#444" }}>{milestone.title}</div>
                    )}
                    {notes.map((n, ni) => (
                      <div key={ni} style={{ fontSize: 11, color: "#555", marginTop: 5, background: "#111", borderRadius: 4, padding: "4px 8px" }}>📝 {n}</div>
                    ))}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <input value={newNoteDraft[task.id] ?? ""} onChange={(e) => setNewNoteDraft((d) => ({ ...d, [task.id]: e.target.value }))}
                        placeholder="Add a note..."
                        style={{ ...inp, fontSize: 11, padding: "5px 9px", flex: 1 }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const next = newNoteDraft[task.id] ?? "";
                            if (next.trim()) {
                              updateMutation.mutate({ taskId: task.id, isCompleted: task.is_completed, notes: appendNote(task.notes, next) });
                              setNewNoteDraft((d) => ({ ...d, [task.id]: "" }));
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ROADMAP TAB */}
      {tab === "roadmap" && (
        <div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>
            Proven actions for <span style={{ color: "#a78bfa" }}>{stage}</span> stage — based on what actually works
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {roadmapSteps.map((step, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: "#818cf8", fontWeight: 600 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#d4d4d4", marginBottom: 6, lineHeight: 1.45 }}>{step.step}</div>
                    <div style={{ fontSize: 12, color: "#444", lineHeight: 1.6, marginBottom: 6 }}>{step.detail}</div>
                    <div style={{ fontSize: 10, color: "#333" }}>⏱ {step.time}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* VALIDATION TAB */}
      {tab === "validation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Strengths", items: project.validation_strengths, color: "#4ade80", icon: "✓" },
            { label: "Weaknesses", items: project.validation_weaknesses, color: "#f87171", icon: "✗" },
            { label: "Suggestions", items: project.validation_suggestions, color: "#fbbf24", icon: "→" },
          ].map(({ label, items, color, icon }) => (
            <div key={label} style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{label}</div>
              {(!items || items.length === 0) && (
                <div style={{ fontSize: 13, color: "#333" }}>None identified yet.</div>
              )}
              {(items ?? []).map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: i < items.length - 1 ? "1px solid #111" : "none" }}>
                  <span style={{ color, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.55 }}>{item}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
