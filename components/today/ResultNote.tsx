"use client";

import { useState } from "react";

/** A compact way to leave a result note alongside today's prepared task. */
export function ResultNote({ task, projectId }: { task: string; projectId?: string | null }) {
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    const value = note.trim();
    if (!value || state === "saving") return;
    setState("saving");
    try {
      const response = await fetch("/api/evening-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: value, task, projectId: projectId ?? null }),
      });
      if (!response.ok) throw new Error("Could not save result note");
      setNote("");
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--bm-border)", paddingTop: "var(--space-3)" }}>
      <label htmlFor="prepared-result-note" style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>
        Have a result to note?
      </label>
      <textarea
        id="prepared-result-note"
        value={note}
        onChange={(event) => { setNote(event.target.value); setState("idle"); }}
        maxLength={1000}
        rows={2}
        placeholder="What happened when you tried this?"
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 10px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" disabled={!note.trim() || state === "saving"} onClick={() => void save()} style={{ border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "6px 10px", background: "transparent", color: "var(--bm-text2)", fontSize: "var(--text-xs)", fontWeight: 600, cursor: "pointer", opacity: !note.trim() || state === "saving" ? 0.55 : 1 }}>
          {state === "saving" ? "Saving…" : "Save result note"}
        </button>
        {state === "saved" && <span role="status" style={{ fontSize: "var(--text-xs)", color: "var(--bm-text3)" }}>Saved.</span>}
        {state === "error" && <span role="status" style={{ fontSize: "var(--text-xs)", color: "var(--bm-red)" }}>Could not save. Try again.</span>}
      </div>
    </div>
  );
}

