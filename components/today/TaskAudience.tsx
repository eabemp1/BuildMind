"use client";
import React from "react";
import { useUpdateProjectMutation } from "@/lib/queries";

/** Shows who today's task is for, and lets the founder fix it before doing the work. A saved fix replaces the project's target customer and asks for a new task. */
export default function TaskAudience({ projectId, projectName, targetUsers, onChanged }: {
  projectId: string; projectName: string; targetUsers: string; onChanged: () => void;
}) {
  const update = useUpdateProjectMutation();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(targetUsers);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { setValue(targetUsers); }, [targetUsers]);

  async function save() {
    const v = value.trim().slice(0, 300);
    if (v.length < 3) { setErr("Say who your customers are, in a few words."); return; }
    setErr("");
    try {
      await update.mutateAsync({ projectId, updates: { target_users: v } });
      setEditing(false); onChanged();
    } catch { setErr("Could not save. Try again."); }
  }

  return (
    <div style={{ marginBottom: 10, border: "1px solid var(--bm-border2)", borderRadius: 12, padding: "10px 14px", background: "var(--bm-bg2)" }}>
      {!editing ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.45, overflowWrap: "anywhere" }}>
            <strong style={{ color: "var(--bm-text)" }}>This task is for:</strong> {targetUsers.trim() || `the customers of ${projectName} (not set yet)`}
          </p>
          <button type="button" onClick={() => setEditing(true)} style={{ minHeight: 36, padding: "0 12px", borderRadius: 9, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            {targetUsers.trim() ? "Not right? Change" : "Set who it is for"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="task-audience" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--bm-text2)" }}>Who are your customers?</label>
          <input id="task-audience" value={value} maxLength={300} onChange={(e) => setValue(e.target.value)} placeholder="Independent bike repair shop owners" style={{ width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 9, padding: "10px 12px", color: "var(--bm-text)", fontSize: 14 }} />
          <p style={{ margin: 0, fontSize: 12, color: "var(--bm-text3)" }}>This updates your project's customer and gives you a new task for them.</p>
          {err && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--bm-red)" }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={update.isPending} onClick={() => void save()} style={{ minHeight: 40, padding: "0 16px", borderRadius: 9, border: "1px solid var(--bm-text)", background: "var(--bm-text)", color: "var(--bm-bg)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{update.isPending ? "Saving…" : "Save and update task"}</button>
            <button type="button" onClick={() => { setEditing(false); setValue(targetUsers); setErr(""); }} style={{ minHeight: 40, padding: "0 14px", borderRadius: 9, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
