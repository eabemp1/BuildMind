"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { computeStartupScore } from "@/lib/buildmind";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";
import { useCreateProjectMutation, useDeleteProjectMutation, useProjectSummariesQuery } from "@/lib/queries";
import { projectCreateSchema } from "@/lib/validation";

const inputStyle = {
  background: "#080808", border: "1px solid #1c1c1c", borderRadius: 7,
  padding: "10px 13px", fontSize: 13, color: "#d4d4d4", outline: "none",
  fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
  transition: "border-color 0.15s",
};

// FIX: stage colors now cover all real stages
const STAGE_COLORS: Record<string, string> = {
  Idea: "#555",
  Validation: "#818cf8",
  Prototype: "#fbbf24",
  MVP: "#4ade80",
  Launch: "#22d3ee",
  Growth: "#a78bfa",
  Revenue: "#4ade80",
};

const STAGE_OPTIONS = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"] as const;
type StartupStage = typeof STAGE_OPTIONS[number];

function normalizeStage(input: string): StartupStage {
  const value = String(input || "").trim().toLowerCase();
  if (value.includes("valid")) return "Validation";
  if (value.includes("mvp") || value.includes("proto")) return "MVP";
  if (value.includes("launch")) return "Launch";
  if (value.includes("growth")) return "Growth";
  if (value.includes("revenue")) return "Revenue";
  return "Idea";
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: summaries = [], isLoading, error: summariesError } = useProjectSummariesQuery();
  const createMutation = useCreateProjectMutation();
  const deleteMutation = useDeleteProjectMutation();
  const [modalOpen, setModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [startupStage, setStartupStage] = useState<StartupStage>("Idea");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!summaries.length) return;
    const active = getActiveProjectId();
    if (!active) {
      const firstId = summaries[0]?.id;
      if (firstId) setActiveProjectId(firstId);
    }
  }, [summaries]);

  const onCreate = async () => {
    try {
      setError("");
      const values = projectCreateSchema.parse({ projectName, ideaDescription, targetUsers });
      const created = await createMutation.mutateAsync({
        project_name: values.projectName,
        idea_description: values.ideaDescription,
        target_users: values.targetUsers,
        problem: values.ideaDescription,
        startup_stage: startupStage,
      });
      setModalOpen(false);
      setProjectName(""); setIdeaDescription(""); setTargetUsers(""); setStartupStage("Idea");
      router.push(`/projects/${created.id}`);
    } catch (err) {
      if (err instanceof z.ZodError) { setError(err.issues[0]?.message ?? "Fill all fields."); return; }
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1c1c1c" }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Projects</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{summaries.length} project{summaries.length !== 1 ? "s" : ""}</div>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={() => setModalOpen(true)}
          style={{ background: "#fff", color: "#000", fontWeight: 600, fontSize: 13, padding: "8px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          + New project
        </motion.button>
      </div>

      {isLoading && (
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
          style={{ fontSize: 12, color: "#333", textAlign: "center", padding: "40px 0" }}>Loading...</motion.div>
      )}

      {summariesError && (
        <div style={{ fontSize: 12, color: "#f87171" }}>{summariesError instanceof Error ? summariesError.message : "Failed to load"}</div>
      )}

      {!isLoading && summaries.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, padding: "52px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 14 }}>🚀</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 8 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 22, lineHeight: 1.6 }}>
            Create your first startup project. BuildMind generates milestones and a roadmap automatically.
          </div>
          <button onClick={() => setModalOpen(true)}
            style={{ background: "#fff", color: "#000", fontWeight: 500, fontSize: 13, padding: "9px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            New project
          </button>
        </motion.div>
      )}

      {summaries.length > 0 && (
        <div style={{ background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Project", "Stage", "Progress", "Score", "Last activity", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 10, color: "#333", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #111", background: "#080808" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaries.map((s, i) => {
                // FIX: stage comes from summaries which now uses inferStageFromMilestones
                const stage = s.startup_stage ?? "Idea";
                const score = computeStartupScore(s);
                const progress = s.progress ?? 0;
                const sc = score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#555";
                const stageColor = STAGE_COLORS[stage] ?? "#555";
                const lastActivity = s.lastActivity
                  ? new Date(s.lastActivity).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  : "—";

                return (
                  <motion.tr key={s.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{ cursor: "pointer", borderBottom: i < summaries.length - 1 ? "1px solid #111" : "none" }}
                    onClick={() => { setActiveProjectId(s.id); router.push(`/projects/${s.id}`); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#111"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontSize: 13, color: "#d4d4d4", fontWeight: 500 }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: "#444", marginTop: 2, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.description}</div>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ fontSize: 11, color: stageColor, background: "rgba(255,255,255,0.03)", border: `1px solid ${stageColor}30`, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>
                        {stage}
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", minWidth: 120 }}>
                      <div style={{ height: 2, background: "#111", borderRadius: 9999, overflow: "hidden", marginBottom: 4, width: 80 }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 + i * 0.05 }}
                          style={{ height: "100%", background: progress >= 60 ? "#4ade80" : "#6366f1", borderRadius: 9999 }} />
                      </div>
                      <div style={{ fontSize: 11, color: "#444" }}>{progress}%</div>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: 13, color: sc, fontVariantNumeric: "tabular-nums" }}>{score}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, color: "#444" }}>{lastActivity}</td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${s.title}"?`)) deleteMutation.mutate(s.id);
                      }}
                        style={{ background: "none", border: "none", color: "#2a2a2a", fontSize: 18, cursor: "pointer", padding: "2px 6px", borderRadius: 4, lineHeight: 1, fontFamily: "inherit", transition: "color 0.15s" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#2a2a2a"; }}>
                        ×
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.88)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
            <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: 12, padding: "26px 28px", width: "100%", maxWidth: 460, fontFamily: "inherit", color: "#e5e5e5" }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#fff", marginBottom: 4, letterSpacing: "-0.01em" }}>New project</div>
              <div style={{ fontSize: 12, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                BuildMind generates a stage-aware roadmap and milestone plan automatically.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Project name" style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333"; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1c1c1c"; }} />
                <textarea value={ideaDescription} onChange={(e) => setIdeaDescription(e.target.value)}
                  placeholder="What are you building? Be specific." rows={3}
                  style={{ ...inputStyle, resize: "none" }}
                  onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "#333"; }}
                  onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "#1c1c1c"; }} />
                <input value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)}
                  placeholder="Who is this for?" style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333"; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1c1c1c"; }} />
                <div>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Current stage</div>
                  <select value={startupStage} onChange={(e) => setStartupStage(normalizeStage(e.target.value))}
                    style={{ ...inputStyle, background: "#0a0a0a" }}>
                    {STAGE_OPTIONS.map((s) => (
                      <option key={s} value={s} style={{ background: "#0a0a0a", color: "#d4d4d4" }}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setModalOpen(false)}
                  style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#555", fontSize: 13, padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <motion.button whileTap={{ scale: 0.97 }}
                  onClick={() => void onCreate()} disabled={createMutation.isPending}
                  style={{ background: createMutation.isPending ? "#1a1a1a" : "#fff", color: createMutation.isPending ? "#444" : "#000", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 7, border: "none", cursor: createMutation.isPending ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {createMutation.isPending ? "Generating roadmap..." : "Create project →"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
