"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type BuildMindMilestone, type BuildMindTask, updateMilestoneForCurrentUser, updateTaskStatus } from "@/lib/buildmind";
import { useDeleteProjectMutation, useProjectDetailQuery } from "@/lib/queries";
import { setActiveProjectId } from "@/lib/api";
import { recordTaskCompletion, checkUpgradeTrigger, getTasksDone } from "@/lib/upgrade";

type Tab = "milestones" | "tasks" | "validation";

const inputStyle = {
  background: "#0a0a0a", border: "1px solid #222", borderRadius: 5,
  padding: "7px 10px", fontSize: 12, color: "#d4d4d4", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box" as const,
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneDrafts, setMilestoneDrafts] = useState<Record<string, { title: string; stage: string }>>({});
  const [activeTab, setActiveTab] = useState<Tab>("milestones");
  const qc = useQueryClient();
  const { data, isLoading, error } = useProjectDetailQuery(projectId);
  const deleteMutation = useDeleteProjectMutation();

  const project = data?.project ?? null;
  const milestones = data?.milestones ?? [];
  const tasks = data?.tasks ?? [];
  const validationTotal = (project?.validation_strengths?.length ?? 0) + (project?.validation_weaknesses?.length ?? 0) + (project?.validation_suggestions?.length ?? 0);
  const validationPending = isLoading || (project && validationTotal === 0);

  const progress = useMemo(() => {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((t) => t.is_completed).length / tasks.length) * 100);
  }, [tasks]);

  const completedCount = useMemo(() => tasks.filter((t) => t.is_completed).length, [tasks]);

  const updateMutation = useMutation({
    mutationFn: (payload: { taskId: string; isCompleted: boolean; notes?: string }) =>
      updateTaskStatus(payload.taskId, payload.isCompleted, payload.notes),
    onSuccess: (_data, variables) => {
      qc.setQueryData<{ project: unknown; milestones: BuildMindMilestone[]; tasks: BuildMindTask[] } | undefined>(
        ["project", projectId],
        (current) => {
          if (!current) return current;
          return { ...current, tasks: current.tasks.map((task) => task.id === variables.taskId ? { ...task, is_completed: variables.isCompleted, notes: variables.notes ?? task.notes } : task) };
        },
      );
      if (variables.isCompleted) {
        recordTaskCompletion();
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
          return { ...current, milestones: current.milestones.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)) };
        },
      );
      setEditingMilestoneId(null);
    },
  });

  const toggleTask = (task: BuildMindTask) => {
    updateMutation.mutate({ taskId: task.id, isCompleted: !task.is_completed, notes: notesDraft[task.id] ?? task.notes ?? "" });
  };

  const tasksByMilestone = useMemo(() => {
    const grouped = new Map<string, BuildMindTask[]>();
    for (const task of tasks) {
      const current = grouped.get(task.milestone_id) ?? [];
      current.push(task);
      grouped.set(task.milestone_id, current);
    }
    return grouped;
  }, [tasks]);

  const isMilestoneComplete = (milestone: BuildMindMilestone) => {
    if (milestone.is_completed) return true;
    const status = (milestone.status ?? "").toLowerCase();
    if (status === "completed" || status === "done") return true;
    const mt = tasksByMilestone.get(milestone.id) ?? [];
    return mt.length > 0 && mt.every((t) => t.is_completed);
  };

  const splitNotes = (value: string | null | undefined) =>
    (value ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  const appendNote = (current: string | null | undefined, next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return current ?? "";
    const existing = (current ?? "").trim();
    return existing ? `${existing}\n${trimmed}` : trimmed;
  };

  useEffect(() => {
    const numericId = Number(projectId);
    if (Number.isFinite(numericId)) setActiveProjectId(numericId);
  }, [projectId]);

  if (isLoading) return <div style={{ fontSize: 12, color: "#666", padding: "40px 0", textAlign: "center", fontFamily: "system-ui,sans-serif" }}>Loading...</div>;
  if (error) return <div style={{ fontSize: 12, color: "#f87171", fontFamily: "system-ui,sans-serif" }}>{error instanceof Error ? error.message : "Failed to load"}</div>;

  const completedMilestones = milestones.filter(isMilestoneComplete).length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5" }}>

      {/* Breadcrumb + header */}
      <div style={{ marginBottom: 20, paddingBottom: 18, borderBottom: "1px solid #1c1c1c" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <button onClick={() => router.push("/projects")}
            style={{ background: "none", border: "none", color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
            Projects
          </button>
          <span style={{ color: "#333", fontSize: 12 }}>/</span>
          <span style={{ fontSize: 12, color: "#888" }}>{project?.title ?? "Project"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>{project?.title ?? "Project"}</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{project?.startup_stage ?? "Idea"} · {completedCount}/{tasks.length} tasks · {completedMilestones}/{milestones.length} milestones</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => router.push("/ai-coach")}
              style={{ background: "transparent", border: "1px solid #222", color: "#888", fontSize: 12, padding: "6px 12px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit" }}>
              Ask BuildMini
            </button>
            <button onClick={() => { if (!project) return; if (!window.confirm(`Delete "${project.title}"?`)) return; deleteMutation.mutate(project.id, { onSuccess: () => router.push("/projects") }); }}
              style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#555", fontSize: 12, padding: "6px 12px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#f87171"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#555"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c"; }}>
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
        {[
          { label: "Progress", value: `${progress}%`, color: progress >= 60 ? "#4ade80" : progress >= 30 ? "#fbbf24" : "#e5e5e5" },
          { label: "Tasks done", value: `${completedCount}/${tasks.length}`, color: "#e5e5e5" },
          { label: "Milestones", value: `${completedMilestones}/${milestones.length}`, color: "#e5e5e5" },
          { label: "Stage", value: project?.startup_stage ?? "Idea", color: "#999" },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "16px 18px", background: "#080808", borderRight: i < 3 ? "1px solid #1c1c1c" : "none" }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 7 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: s.color, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: "#1c1c1c", borderRadius: 9999, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: progress >= 60 ? "#4ade80" : "#444", borderRadius: 9999, transition: "width 0.6s ease" }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1c1c1c", marginBottom: 18 }}>
        {(["milestones", "tasks", "validation"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ background: "none", border: "none", borderBottom: activeTab === t ? "1px solid #fff" : "1px solid transparent", color: activeTab === t ? "#fff" : "#666", fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", marginBottom: -1, textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
      </div>

      {/* MILESTONES */}
      {activeTab === "milestones" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {milestones.length === 0 && <div style={{ fontSize: 12, color: "#555", padding: "20px 0" }}>No milestones yet.</div>}
          {milestones.map((milestone) => {
            const mt = tasksByMilestone.get(milestone.id) ?? [];
            const mp = mt.length ? Math.round((mt.filter((t) => t.is_completed).length / mt.length) * 100) : 0;
            const mc = isMilestoneComplete(milestone);
            const isEditing = editingMilestoneId === milestone.id;
            const draft = milestoneDrafts[milestone.id] ?? { title: milestone.title, stage: milestone.stage };
            return (
              <div key={milestone.id} style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "11px 16px", background: "#080808", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: mt.length ? "1px solid #111" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: mc ? "none" : "1px solid #333", background: mc ? "#fff" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: "#000" }}>
                      {mc ? "✓" : ""}
                    </div>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={draft.stage} onChange={(e) => setMilestoneDrafts((prev) => ({ ...prev, [milestone.id]: { ...draft, stage: e.target.value } }))} placeholder="Stage" style={{ ...inputStyle, width: 100 }} />
                        <input value={draft.title} onChange={(e) => setMilestoneDrafts((prev) => ({ ...prev, [milestone.id]: { ...draft, title: e.target.value } }))} placeholder="Title" style={{ ...inputStyle, width: 200 }} />
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{milestone.stage}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: mc ? "#555" : "#d4d4d4" }}>{milestone.title}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 11, color: "#666" }}>{mp}%</div>
                    {isEditing ? (
                      <>
                        <button onClick={() => updateMilestoneMutation.mutate({ id: milestone.id, title: draft.title, stage: draft.stage })} style={{ background: "#fff", color: "#000", fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                        <button onClick={() => setEditingMilestoneId(null)} style={{ background: "transparent", border: "1px solid #222", color: "#888", fontSize: 11, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => { setEditingMilestoneId(milestone.id); setMilestoneDrafts((prev) => ({ ...prev, [milestone.id]: { title: milestone.title, stage: milestone.stage } })); }}
                        style={{ background: "transparent", border: "none", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                    )}
                  </div>
                </div>
                {mt.map((task, ti) => (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: ti < mt.length - 1 ? "1px solid #111" : "none", background: task.is_completed ? "rgba(74,222,128,0.02)" : "transparent" }}>
                    <input type="checkbox" checked={task.is_completed} onChange={() => toggleTask(task)} style={{ width: 14, height: 14, flexShrink: 0, cursor: "pointer", accentColor: "#fff" }} />
                    <div style={{ flex: 1, fontSize: 13, color: task.is_completed ? "#444" : "#aaa", textDecoration: task.is_completed ? "line-through" : "none" }}>{task.title}</div>
                    {task.is_completed && <div style={{ fontSize: 10, color: "#4ade80" }}>Done</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* TASKS */}
      {activeTab === "tasks" && (
        <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
          {tasks.length === 0 && <div style={{ padding: "32px", fontSize: 13, color: "#555", textAlign: "center" }}>No tasks yet.</div>}
          {tasks.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["", "Task", "Note", "Status"].map((h) => (
                    <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 10, color: "#555", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #1c1c1c", background: "#080808" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, i) => (
                  <tr key={task.id} style={{ borderBottom: i < tasks.length - 1 ? "1px solid #111" : "none", background: task.is_completed ? "rgba(74,222,128,0.02)" : "transparent" }}>
                    <td style={{ padding: "11px 16px", width: 40 }}>
                      <input type="checkbox" checked={task.is_completed} onChange={() => toggleTask(task)} style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#fff" }} />
                    </td>
                    <td style={{ padding: "11px 16px", fontSize: 13, color: task.is_completed ? "#444" : "#aaa", textDecoration: task.is_completed ? "line-through" : "none" }}>{task.title}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={notesDraft[task.id] ?? ""} onChange={(e) => setNotesDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                          placeholder="Add note..." style={{ ...inputStyle, width: 180 }} />
                        <button onClick={() => { const next = notesDraft[task.id] ?? ""; updateMutation.mutate({ taskId: task.id, isCompleted: task.is_completed, notes: appendNote(task.notes, next) }); setNotesDraft((prev) => ({ ...prev, [task.id]: "" })); }}
                          style={{ background: "transparent", border: "1px solid #222", color: "#888", fontSize: 11, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                          Save
                        </button>
                      </div>
                      {splitNotes(task.notes).map((note, ni) => (
                        <div key={ni} style={{ fontSize: 11, color: "#555", marginTop: 4 }}>· {note}</div>
                      ))}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{ fontSize: 11, color: task.is_completed ? "#4ade80" : "#888", background: task.is_completed ? "rgba(74,222,128,0.06)" : "#111", border: `1px solid ${task.is_completed ? "rgba(74,222,128,0.2)" : "#1c1c1c"}`, borderRadius: 4, padding: "2px 8px" }}>
                        {task.is_completed ? "Done" : "Todo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* VALIDATION */}
      {activeTab === "validation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {validationPending ? (
            <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, padding: "32px", textAlign: "center", background: "#080808" }}>
              <div style={{ fontSize: 12, color: "#666" }}>BuildMind AI is analyzing your startup...</div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[
                  { label: "Strengths", items: project?.validation_strengths ?? [], color: "#4ade80" },
                  { label: "Weaknesses", items: project?.validation_weaknesses ?? [], color: "#f87171" },
                  { label: "Suggestions", items: project?.validation_suggestions ?? [], color: "#a78bfa" },
                ].map((section) => (
                  <div key={section.label} style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ padding: "10px 15px", borderBottom: "1px solid #1c1c1c", background: "#080808", fontSize: 11, color: section.color, textTransform: "uppercase", letterSpacing: "0.09em" }}>
                      {section.label}
                    </div>
                    <div style={{ padding: "14px 15px" }}>
                      {section.items.length === 0
                        ? <div style={{ fontSize: 12, color: "#444" }}>None identified yet.</div>
                        : section.items.map((item, i) => (
                          <div key={i} style={{ display: "flex", gap: 7, fontSize: 12, color: "#999", lineHeight: 1.55, marginBottom: 8 }}>
                            <span style={{ color: "#333", flexShrink: 0 }}>·</span>{item}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid #1c1c1c", background: "#080808", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                  Project overview
                </div>
                <div style={{ padding: "16px" }}>
                  {[
                    { label: "Description", value: project?.description },
                    { label: "Target users", value: project?.target_users },
                    { label: "Problem", value: project?.problem },
                  ].map((row, i, arr) => (
                    <div key={row.label} style={{ display: "flex", gap: 20, padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #111" : "none" }}>
                      <div style={{ fontSize: 11, color: "#555", width: 110, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 1 }}>{row.label}</div>
                      <div style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}>{row.value || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {(updateMutation.error || deleteMutation.error) && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#f87171" }}>
          {updateMutation.error instanceof Error ? updateMutation.error.message : deleteMutation.error instanceof Error ? deleteMutation.error.message : "An error occurred"}
        </div>
      )}
    </div>
  );
}
