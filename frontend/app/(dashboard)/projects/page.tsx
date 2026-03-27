"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { computeStartupScore } from "@/lib/buildmind";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";
import { useCreateProjectMutation, useDeleteProjectMutation, useProjectSummariesQuery } from "@/lib/queries";
import { projectCreateSchema } from "@/lib/validation";

function stageFromStrengthCount(n: number): string {
  if (n >= 3) return "Validation";
  if (n > 0) return "Discovery";
  return "Idea";
}

const inputStyle = {
  background: "#0a0a0a", border: "1px solid #222", borderRadius: 6,
  padding: "9px 12px", fontSize: 13, color: "#d4d4d4", outline: "none",
  fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
};

export default function ProjectsPage() {
  const router = useRouter();
  const { data: summaries = [], isLoading, error: summariesError } = useProjectSummariesQuery();
  const createMutation = useCreateProjectMutation();
  const deleteMutation = useDeleteProjectMutation();
  const [modalOpen, setModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!summaries.length) return;
    const active = getActiveProjectId();
    if (!active) {
      const firstId = Number(summaries[0]?.id);
      if (Number.isFinite(firstId)) setActiveProjectId(firstId);
    }
  }, [summaries]);

  const onCreate = async () => {
    try {
      setError("");
      const values = projectCreateSchema.parse({ projectName, ideaDescription, targetUsers });
      const created = await createMutation.mutateAsync({
        project_name: values.projectName, idea_description: values.ideaDescription,
        target_users: values.targetUsers, problem: values.ideaDescription,
      });
      setModalOpen(false); setProjectName(""); setIdeaDescription(""); setTargetUsers("");
      router.push(`/projects/${created.id}`);
    } catch (err) {
      if (err instanceof z.ZodError) { setError(err.issues[0]?.message ?? "Fill all fields."); return; }
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid #1c1c1c" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Projects</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{summaries.length} project{summaries.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={() => setModalOpen(true)}
          style={{ background: "#fff", color: "#000", fontWeight: 500, fontSize: 13, padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          New project
        </button>
      </div>

      {isLoading && <div style={{ fontSize: 12, color: "#666", padding: "40px 0", textAlign: "center" }}>Loading...</div>}
      {summariesError && <div style={{ fontSize: 12, color: "#f87171" }}>{summariesError instanceof Error ? summariesError.message : "Failed to load"}</div>}

      {!isLoading && summaries.length === 0 && (
        <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, padding: "52px 32px", textAlign: "center", background: "#080808" }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 8 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 22, lineHeight: 1.6 }}>Create your first startup project. BuildMind generates the roadmap automatically.</div>
          <button onClick={() => setModalOpen(true)}
            style={{ background: "#fff", color: "#000", fontWeight: 500, fontSize: 13, padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            New project
          </button>
        </div>
      )}

      {summaries.length > 0 && (
        <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Project", "Stage", "Progress", "Score", "Last activity", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 10, color: "#555", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #1c1c1c", background: "#080808" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaries.map((s, i) => {
                const stage = s.startup_stage ?? stageFromStrengthCount(s.validation_strengths.length);
                const score = computeStartupScore(s);
                const progress = s.progress ?? 0;
                const sc = score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#888";
                const lastActivity = s.lastActivity ? new Date(s.lastActivity).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
                return (
                  <tr key={s.id}
                    style={{ cursor: "pointer", borderBottom: i < summaries.length - 1 ? "1px solid #111" : "none" }}
                    onClick={() => router.push(`/projects/${s.id}`)}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#0d0d0d"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontSize: 13, color: "#d4d4d4", fontWeight: 500 }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 2, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.description}</div>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ fontSize: 11, color: "#999", background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "2px 8px" }}>{stage}</span>
                    </td>
                    <td style={{ padding: "14px 18px", minWidth: 120 }}>
                      <div style={{ height: 2, background: "#1c1c1c", borderRadius: 9999, overflow: "hidden", marginBottom: 4, width: 80 }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: "#555", borderRadius: 9999 }} />
                      </div>
                      <div style={{ fontSize: 11, color: "#666" }}>{progress}%</div>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: 13, color: sc, fontVariantNumeric: "tabular-nums" }}>{score}</td>
                    <td style={{ padding: "14px 18px", fontSize: 12, color: "#666" }}>{lastActivity}</td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${s.title}"?`)) deleteMutation.mutate(s.id); }}
                        style={{ background: "none", border: "none", color: "#333", fontSize: 16, cursor: "pointer", padding: "2px 6px", borderRadius: 4, lineHeight: 1, fontFamily: "inherit" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#333"; }}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.85)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 10, padding: "24px 26px", width: "100%", maxWidth: 440, fontFamily: "inherit", color: "#e5e5e5" }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#fff", marginBottom: 4, letterSpacing: "-0.01em" }}>New project</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 20, lineHeight: 1.6 }}>BuildMind generates validation and a milestone roadmap automatically.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" style={inputStyle} />
                <textarea value={ideaDescription} onChange={(e) => setIdeaDescription(e.target.value)} placeholder="Idea description — what are you building?" rows={3}
                  style={{ ...inputStyle, resize: "none" }} />
                <input value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} placeholder="Target users — who is this for?" style={inputStyle} />
              </div>
              {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setModalOpen(false)}
                  style={{ background: "transparent", border: "1px solid #222", color: "#888", fontSize: 13, padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={() => void onCreate()} disabled={createMutation.isPending}
                  style={{ background: createMutation.isPending ? "#333" : "#fff", color: createMutation.isPending ? "#777" : "#000", fontSize: 13, fontWeight: 500, padding: "7px 14px", borderRadius: 6, border: "none", cursor: createMutation.isPending ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {createMutation.isPending ? "Generating..." : "Create project"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
