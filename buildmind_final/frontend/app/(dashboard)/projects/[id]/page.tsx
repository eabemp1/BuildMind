"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type BuildMindMilestone,
  type BuildMindTask,
  computeStartupScore,
  updateMilestoneForCurrentUser,
  updateTaskStatus,
} from "@/lib/buildmind";
import { useDeleteProjectMutation, useProjectDetailQuery } from "@/lib/queries";
import { setActiveProjectId } from "@/lib/api";
import { recordTaskCompletion, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";

type Tab = "milestones" | "tasks" | "validation" | "roadmap";

// ─── Design tokens (consistent with global dark system) ──────────────────────
const inp = {
  background: "#080808", border: "1px solid #1c1c1c", borderRadius: 6,
  padding: "8px 12px", fontSize: 13, color: "#d4d4d4", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box" as const, transition: "border-color 0.15s",
};

// ─── Stage roadmap content per stage ─────────────────────────────────────────
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
  Prototype: [
    { step: "Record a 3-minute Loom and send it to 5 people for feedback.", detail: "Dropbox got 75K signups from a demo video before building their backend.", time: "Under 2 hrs" },
    { step: "Define your 3 core value propositions and test each in user calls.", detail: "If you can't explain it in 10 seconds, users won't understand it either.", time: "1 hr" },
    { step: "Set a public ship date — social, so you can't move it.", detail: "Deadlines are the only thing that prevent infinite polish loops.", time: "5 min" },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function splitNotes(notes?: string | null): string[] {
  if (!notes) return [];
  return notes.split("||").map((n) => n.trim()).filter(Boolean);
}
function appendNote(existing: string | null | undefined, next: string): string {
  if (!next.trim()) return existing ?? "";
  return existing ? `${existing}||${next.trim()}` : next.trim();
}
function isMilestoneComplete(m: BuildMindMilestone): boolean {
  return Boolean(m.is_completed);
}

// ─── Animated score ring ──────────────────────────────────────────────────────
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

// ─── Confetti burst on task complete ─────────────────────────────────────────
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
      style={{ width: size, height: size, borderRadius: 4, border: checked ? "none" : "1px solid #2a2a2a", background: checked ? "#fff" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 0.2s, border-color 0.2s" }}>
      {checked && <span style={{ fontSize: size * 0.6, color: "#000", lineHeight: 1 }}>✓</span>}
    </motion.button>
  );
}

// ─── Upgrade nudge (shown inside the page after interaction) ─────────────────
function UpgradeNudge({ reason, onDismiss, onUpgrade }: { reason: string; onDismiss: () => void; onUpgrade: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#c7d2fe", marginBottom: 4 }}>You&apos;re making real progress.</div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.55 }}>{reason}</div>
        </div>
        <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      <button onClick={onUpgrade}
        style={{ marginTop: 12, width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 600, fontSize: 13, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
        Unlock full access — $10/mo →
      </button>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const qc = useQueryClient();

  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneDrafts, setMilestoneDrafts] = useState<Record<string, { title: string; stage: string }>>({});
  const [activeTab, setActiveTab] = useState<Tab>("milestones");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showUpgradeNudge, setShowUpgradeNudge] = useState(false);
  const [tasksCompletedToday, setTasksCompletedToday] = useState(0);
  const [recentlyCompleted, setRecentlyCompleted] = useState<string | null>(null);

  const { data, isLoading, error } = useProjectDetailQuery(projectId);
  const deleteMutation = useDeleteProjectMutation();

  const project = data?.project ?? null;
  const milestones = data?.milestones ?? [];
  const tasks = data?.tasks ?? [];
  const validationTotal = (project?.validation_strengths?.length ?? 0)
    + (project?.validation_weaknesses?.length ?? 0)
    + (project?.validation_suggestions?.length ?? 0);
  const validationPending = isLoading || (project && validationTotal === 0);

  const progress = useMemo(() => {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((t) => t.is_completed).length / tasks.length) * 100);
  }, [tasks]);

  const completedCount = useMemo(() => tasks.filter((t) => t.is_completed).length, [tasks]);
  const completedMilestones = useMemo(() => milestones.filter((m) => isMilestoneComplete(m)).length, [milestones]);
  const score = project ? computeStartupScore(project as Parameters<typeof computeStartupScore>[0]) : 0;

  const stage = useMemo(() => {
    const s = (project?.startup_stage ?? "").trim();
    if (s) return s;
    const sc = project?.validation_strengths?.length ?? 0;
    return sc >= 3 ? "Validation" : sc > 0 ? "Discovery" : "Idea";
  }, [project]);

  const roadmapKey = Object.keys(STAGE_ROADMAPS).find(k => stage.toLowerCase().includes(k.toLowerCase())) ?? "Idea";
  const roadmapItems = STAGE_ROADMAPS[roadmapKey] ?? STAGE_ROADMAPS["Idea"];

  const tasksByMilestone = useMemo(() => {
    const map = new Map<string, BuildMindTask[]>();
    for (const task of tasks) {
      if (!task.milestone_id) continue;
      const arr = map.get(task.milestone_id) ?? [];
      arr.push(task);
      map.set(task.milestone_id, arr);
    }
    return map;
  }, [tasks]);

  useEffect(() => {
    if (project?.id) setActiveProjectId(Number(project.id));
  }, [project?.id]);

  const updateMutation = useMutation({
    mutationFn: (payload: { taskId: string; isCompleted: boolean; notes?: string }) =>
      updateTaskStatus(payload.taskId, payload.isCompleted, payload.notes),
    onSuccess: (_data, variables) => {
      qc.setQueryData<{ project: unknown; milestones: BuildMindMilestone[]; tasks: BuildMindTask[] } | undefined>(
        ["project", projectId],
        (current) => {
          if (!current) return current;
          return {
            ...current,
            tasks: current.tasks.map((t) =>
              t.id === variables.taskId ? { ...t, is_completed: variables.isCompleted, notes: variables.notes ?? t.notes } : t
            ),
          };
        },
      );
      if (variables.isCompleted) {
        setRecentlyCompleted(variables.taskId);
        setTimeout(() => setRecentlyCompleted(null), 1500);
        const newCount = tasksCompletedToday + 1;
        setTasksCompletedToday(newCount);
        recordTaskCompletion();
        if (newCount >= 2 && !showUpgradeNudge) setShowUpgradeNudge(true);
        const streak = Number(localStorage.getItem("bm_streak") ?? "1");
        const { shouldUpgrade } = checkUpgradeTrigger(streak);
        if (shouldUpgrade) router.push(`/upgrade?tasks=${getTasksDone()}&streak=${streak}`);
      }
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: (payload: { id: string; title: string; stage: string }) =>
      updateMilestoneForCurrentUser(payload.id, { title: payload.title, stage: payload.stage }),
    onSuccess: (updated) => {
      qc.setQueryData<{ project: unknown; milestones: BuildMindMilestone[]; tasks: BuildMindTask[] } | undefined>(
        ["project", projectId],
        (current) => {
          if (!current) return current;
          return { ...current, milestones: current.milestones.map((m) => m.id === updated.id ? { ...m, ...updated } : m) };
        },
      );
      setEditingMilestoneId(null);
    },
  });

  const toggleTask = (task: BuildMindTask) => {
    updateMutation.mutate({ taskId: task.id, isCompleted: !task.is_completed, notes: notesDraft[task.id] ?? task.notes ?? "" });
  };

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, fontFamily: "system-ui,sans-serif" }}>
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ fontSize: 12, color: "#333" }}>Loading project...</motion.div>
    </div>
  );

  if (error || !project) return (
    <div style={{ fontFamily: "system-ui,sans-serif", padding: "40px 0", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#f87171", marginBottom: 14 }}>Failed to load project.</div>
      <button onClick={() => router.push("/projects")}
        style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#555", fontSize: 12, padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
        ← Back to projects
      </button>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 960, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", paddingBottom: 48 }}>

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid #1c1c1c" }}>
        <button onClick={() => router.push("/projects")}
          style={{ background: "none", border: "none", color: "#333", fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <span>←</span><span>Projects</span>
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em", margin: 0 }}>{project.title}</h1>
              <span style={{ fontSize: 11, color: "#818cf8", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20, padding: "2px 10px" }}>
                {stage}
              </span>
            </div>
            {project.description && (
              <div style={{ fontSize: 13, color: "#555", lineHeight: 1.55, maxWidth: 560 }}>{project.description}</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            <button onClick={() => router.push("/ai-coach")}
              style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: 12, padding: "7px 13px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.14)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.08)"; }}>
              Ask BuildMini
            </button>
            <button onClick={() => router.push("/today")}
              style={{ background: "#fff", color: "#000", fontWeight: 600, fontSize: 12, padding: "7px 13px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              ⚡ Today
            </button>
            <button onClick={() => setConfirmDelete(true)}
              style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#333", fontSize: 12, padding: "7px 13px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.3)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#333"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c"; }}>
              Delete
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Delete confirm ── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginBottom: 14 }}>
            <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ fontSize: 13, color: "#f87171" }}>Delete &ldquo;{project.title}&rdquo;? This cannot be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmDelete(false)} style={{ background: "transparent", border: "1px solid #222", color: "#555", fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={() => { deleteMutation.mutate(projectId); router.push("/projects"); }}
                  style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                  Confirm delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Upgrade nudge ── */}
      <AnimatePresence>
        {showUpgradeNudge && (
          <UpgradeNudge
            reason="You've completed 2 tasks today. Unlock AI coaching, weekly mirror, and stage-aware roadmap to keep this momentum."
            onDismiss={() => setShowUpgradeNudge(false)}
            onUpgrade={() => router.push("/upgrade")}
          />
        )}
      </AnimatePresence>

      {/* ── Stats row ── */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: 12, marginBottom: 14, alignItems: "stretch" }}>

        {/* Score ring */}
        <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <ScoreRing score={score} />
        </div>

        {[
          { label: "Progress", value: `${progress}%`, sub: `${completedCount} of ${tasks.length} tasks`, color: progress >= 60 ? "#4ade80" : progress >= 30 ? "#fbbf24" : "#555" },
          { label: "Milestones", value: `${completedMilestones}/${milestones.length}`, sub: completedMilestones === milestones.length && milestones.length > 0 ? "All done ✓" : `${milestones.length - completedMilestones} remaining`, color: "#e5e5e5" },
          { label: "Stage", value: stage, sub: "Current focus", color: "#818cf8" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "14px 18px" }}>
            <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 7 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: s.color, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#333" }}>{s.sub}</div>
          </div>
        ))}
      </motion.div>

      {/* ── Animated progress bar ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
        style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: "#333" }}>Overall progress</div>
          <div style={{ fontSize: 11, color: progress >= 60 ? "#4ade80" : "#555" }}>{progress}%</div>
        </div>
        <div style={{ height: 3, background: "#111", borderRadius: 9999, overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            style={{ height: "100%", background: progress >= 60 ? "#4ade80" : progress > 0 ? "#6366f1" : "#1c1c1c", borderRadius: 9999 }} />
        </div>
      </motion.div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", borderBottom: "1px solid #1c1c1c", marginBottom: 20, gap: 0 }}>
        {(["milestones", "tasks", "validation", "roadmap"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ background: "none", border: "none", borderBottom: activeTab === t ? "2px solid #fff" : "2px solid transparent", color: activeTab === t ? "#fff" : "#444", fontSize: 13, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit", marginBottom: -1, textTransform: "capitalize", transition: "color 0.15s" }}>
            {t === "roadmap" ? "📍 Roadmap" : t}
            {t === "tasks" && tasks.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, color: "#555", background: "#111", borderRadius: 9999, padding: "1px 6px" }}>{completedCount}/{tasks.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ MILESTONES TAB ══ */}
      {activeTab === "milestones" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {milestones.length === 0 && (
            <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 8, padding: "32px", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#444" }}>No milestones generated yet. BuildMind AI creates these from your project description.</div>
            </div>
          )}
          {milestones.map((milestone, mi) => {
            const mt = tasksByMilestone.get(milestone.id) ?? [];
            const mp = mt.length ? Math.round((mt.filter((t) => t.is_completed).length / mt.length) * 100) : 0;
            const mc = isMilestoneComplete(milestone);
            const isEditing = editingMilestoneId === milestone.id;
            const draft = milestoneDrafts[milestone.id] ?? { title: milestone.title, stage: milestone.stage };

            return (
              <motion.div key={milestone.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: mi * 0.04 }}
                style={{ background: "#0d0d0d", border: `1px solid ${mc ? "rgba(74,222,128,0.15)" : "#1c1c1c"}`, borderRadius: 10, overflow: "hidden", transition: "border-color 0.3s" }}>

                {/* Milestone header */}
                <div style={{ padding: "12px 16px", background: "#080808", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: mt.length ? "1px solid #111" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <motion.div
                      animate={mc ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.3 }}
                      style={{ width: 18, height: 18, borderRadius: "50%", border: mc ? "none" : "1px solid #2a2a2a", background: mc ? "#4ade80" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: "#000", transition: "all 0.25s" }}>
                      {mc ? "✓" : ""}
                    </motion.div>

                    {isEditing ? (
                      <div style={{ display: "flex", gap: 6, flex: 1 }}>
                        <input value={draft.stage} onChange={(e) => setMilestoneDrafts((prev) => ({ ...prev, [milestone.id]: { ...draft, stage: e.target.value } }))} placeholder="Stage" style={{ ...inp, width: 100 }} />
                        <input value={draft.title} onChange={(e) => setMilestoneDrafts((prev) => ({ ...prev, [milestone.id]: { ...draft, title: e.target.value } }))} placeholder="Milestone title" style={{ ...inp, flex: 1 }} />
                      </div>
                    ) : (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: "#333", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{milestone.stage}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: mc ? "#4ade80" : "#d4d4d4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{milestone.title}</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    {/* Mini progress */}
                    {mt.length > 0 && !isEditing && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 48, height: 2, background: "#1c1c1c", borderRadius: 9999, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${mp}%`, background: mp === 100 ? "#4ade80" : "#6366f1", borderRadius: 9999, transition: "width 0.5s ease" }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#444" }}>{mp}%</div>
                      </div>
                    )}
                    {isEditing ? (
                      <>
                        <button onClick={() => updateMilestoneMutation.mutate({ id: milestone.id, title: draft.title, stage: draft.stage })}
                          style={{ background: "#fff", color: "#000", fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                        <button onClick={() => setEditingMilestoneId(null)}
                          style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#555", fontSize: 11, padding: "4px 10px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => { setEditingMilestoneId(milestone.id); setMilestoneDrafts((prev) => ({ ...prev, [milestone.id]: { title: milestone.title, stage: milestone.stage } })); }}
                        style={{ background: "transparent", border: "none", color: "#2a2a2a", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#666"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#2a2a2a"; }}>
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {/* Tasks under milestone */}
                {mt.map((task, ti) => (
                  <motion.div key={task.id}
                    animate={recentlyCompleted === task.id ? { backgroundColor: ["transparent", "rgba(74,222,128,0.06)", "transparent"] } : {}}
                    transition={{ duration: 0.8 }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 16px", borderBottom: ti < mt.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                    <TaskCheckbox checked={task.is_completed} onChange={() => toggleTask(task)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: task.is_completed ? "#2a2a2a" : "#94a3b8", textDecoration: task.is_completed ? "line-through" : "none", lineHeight: 1.45, transition: "all 0.25s" }}>
                        {task.title}
                      </div>
                      {splitNotes(task.notes).map((note, ni) => (
                        <div key={ni} style={{ fontSize: 11, color: "#333", marginTop: 3 }}>· {note}</div>
                      ))}
                    </div>
                    <AnimatePresence>
                      {task.is_completed && (
                        <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                          style={{ fontSize: 10, color: "#4ade80", background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>
                          Done
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ══ TASKS TAB ══ */}
      {activeTab === "tasks" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {/* Completion header */}
          {tasks.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#555" }}>
                <span style={{ color: completedCount === tasks.length ? "#4ade80" : "#e5e5e5", fontWeight: 600 }}>{completedCount}</span>
                <span> of {tasks.length} completed</span>
              </div>
              {completedCount === tasks.length && tasks.length > 0 && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ fontSize: 12, color: "#4ade80", display: "flex", alignItems: "center", gap: 5 }}>
                  <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5, delay: 0.2 }}>🎉</motion.span>
                  All done!
                </motion.div>
              )}
            </div>
          )}

          <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, overflow: "hidden" }}>
            {tasks.length === 0 && (
              <div style={{ padding: "32px", fontSize: 13, color: "#444", textAlign: "center" }}>No tasks yet.</div>
            )}
            {tasks.length > 0 && tasks.map((task, i) => (
              <motion.div key={task.id}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                animate-2={recentlyCompleted === task.id ? { backgroundColor: ["transparent", "rgba(74,222,128,0.05)", "transparent"] } : {}}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderBottom: i < tasks.length - 1 ? "1px solid #0a0a0a" : "none" }}>
                <TaskCheckbox checked={task.is_completed} onChange={() => toggleTask(task)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: task.is_completed ? "#2a2a2a" : "#94a3b8", textDecoration: task.is_completed ? "line-through" : "none", marginBottom: 4, transition: "all 0.2s" }}>
                    {task.title}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input value={notesDraft[task.id] ?? ""}
                      onChange={(e) => setNotesDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      placeholder="Add note..."
                      style={{ ...inp, fontSize: 12, padding: "5px 10px", width: 180 }}
                      onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333"; }}
                      onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1c1c1c"; }}
                    />
                    <button onClick={() => {
                      const next = notesDraft[task.id] ?? "";
                      updateMutation.mutate({ taskId: task.id, isCompleted: task.is_completed, notes: appendNote(task.notes, next) });
                      setNotesDraft((prev) => ({ ...prev, [task.id]: "" }));
                    }}
                      style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#444", fontSize: 11, padding: "4px 9px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#333"; (e.currentTarget as HTMLButtonElement).style.color = "#888"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c"; (e.currentTarget as HTMLButtonElement).style.color = "#444"; }}>
                      Save
                    </button>
                  </div>
                  {splitNotes(task.notes).map((note, ni) => (
                    <div key={ni} style={{ fontSize: 11, color: "#333", marginTop: 4 }}>· {note}</div>
                  ))}
                </div>
                <AnimatePresence>
                  {task.is_completed && (
                    <motion.span initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      style={{ fontSize: 10, color: "#4ade80", background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>
                      Done
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ══ VALIDATION TAB ══ */}
      {activeTab === "validation" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {validationPending ? (
            <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 8, padding: "32px", textAlign: "center" }}>
              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ fontSize: 12, color: "#444" }}>BuildMind AI is analyzing your startup...</motion.div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Validation score bar */}
              <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#555" }}>Validation signal strength</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: validationTotal >= 6 ? "#4ade80" : "#fbbf24" }}>{validationTotal} / 9 signals</div>
                </div>
                <div style={{ height: 3, background: "#111", borderRadius: 9999, overflow: "hidden" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(validationTotal / 9) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                    style={{ height: "100%", background: validationTotal >= 6 ? "#4ade80" : "#fbbf24", borderRadius: 9999 }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[
                  { label: "Strengths", items: project?.validation_strengths ?? [], color: "#4ade80", icon: "✓" },
                  { label: "Weaknesses", items: project?.validation_weaknesses ?? [], color: "#f87171", icon: "×" },
                  { label: "Suggestions", items: project?.validation_suggestions ?? [], color: "#a78bfa", icon: "→" },
                ].map((section) => (
                  <div key={section.label} style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid #111", background: "#080808", fontSize: 10, color: section.color, textTransform: "uppercase", letterSpacing: "0.09em", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{section.label}</span>
                      <span style={{ fontSize: 11, color: "#333" }}>{section.items.length}</span>
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      {section.items.length === 0
                        ? <div style={{ fontSize: 12, color: "#2a2a2a" }}>None identified yet.</div>
                        : section.items.map((item, i) => (
                          <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                            style={{ display: "flex", gap: 7, fontSize: 12, color: "#888", lineHeight: 1.55, marginBottom: 8 }}>
                            <span style={{ color: section.color, flexShrink: 0, opacity: 0.6, marginTop: 1 }}>{section.icon}</span>
                            {item}
                          </motion.div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Project overview */}
              <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #111", background: "#080808", fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                  Project overview
                </div>
                <div style={{ padding: "16px" }}>
                  {[
                    { label: "Description", value: project?.description },
                    { label: "Target users", value: project?.target_users },
                    { label: "Problem", value: project?.problem },
                  ].map((row, i, arr) => (
                    <div key={row.label} style={{ display: "flex", gap: 20, padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #0d0d0d" : "none" }}>
                      <div style={{ fontSize: 11, color: "#444", width: 110, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 1 }}>{row.label}</div>
                      <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>{row.value || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upgrade to AI analysis nudge */}
              <div style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, padding: "16px 18px", display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#c7d2fe", marginBottom: 4 }}>Want a deeper analysis?</div>
                  <div style={{ fontSize: 12, color: "#444", lineHeight: 1.55 }}>Break My Startup runs an honest AI failure analysis — it finds every reason this could fail before you build further.</div>
                </div>
                <button onClick={() => router.push("/break-my-startup")}
                  style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", fontSize: 12, padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                  Break it →
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ══ ROADMAP TAB ══ */}
      {activeTab === "roadmap" && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
              Proven actions for your stage: <span style={{ color: "#818cf8" }}>{stage}</span>
            </div>
            <div style={{ fontSize: 12, color: "#333" }}>These are the moves that have worked for founders at this exact point. Do them in order.</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {roadmapItems.map((item, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                style={{ background: "#0d0d0d", border: i === 0 ? "1px solid rgba(99,102,241,0.3)" : "1px solid #1c1c1c", borderRadius: 10, padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: i === 0 ? "rgba(99,102,241,0.15)" : "#080808", border: i === 0 ? "1px solid rgba(99,102,241,0.4)" : "1px solid #222", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: i === 0 ? "#818cf8" : "#333", flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? "#f1f5f9" : "#888", marginBottom: 6, lineHeight: 1.4 }}>{item.step}</div>
                  <div style={{ fontSize: 12, color: "#444", lineHeight: 1.6, marginBottom: 8 }}>{item.detail}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "#333" }}>⏱ {item.time}</span>
                    {i === 0 && (
                      <button onClick={() => router.push("/today")}
                        style={{ background: "#fff", color: "#000", fontWeight: 600, fontSize: 11, padding: "4px 12px", borderRadius: 5, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        Do this now →
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Full roadmap unlock */}
          <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 12, padding: "20px 22px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#c7d2fe", marginBottom: 6 }}>Want the full stage-by-stage roadmap?</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 16, lineHeight: 1.6 }}>
              Upgrade to see the complete proven playbook for all 6 stages — Idea through Revenue — with specific actions, timing, and BuildMini coaching at each step.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => router.push("/upgrade")}
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Unlock full roadmap — $10/mo
              </button>
              <button onClick={() => router.push("/ai-coach")}
                style={{ background: "transparent", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: 13, padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                Ask BuildMini
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Error banner ── */}
      {(updateMutation.error || deleteMutation.error) && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#f87171", padding: "10px 14px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 7 }}>
          {updateMutation.error instanceof Error ? updateMutation.error.message : deleteMutation.error instanceof Error ? deleteMutation.error.message : "An error occurred"}
        </div>
      )}
    </motion.div>
  );
}
