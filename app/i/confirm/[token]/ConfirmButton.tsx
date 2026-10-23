"use client";

import { useState } from "react";

export function ConfirmButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function go() {
    setState("busy");
    try {
      const r = await fetch("/api/signal-links/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json().catch(() => ({}));
      setState(r.ok && j.ok ? "done" : "error");
    } catch { setState("error"); }
  }
  if (state === "done") return <p role="status" style={{ fontSize: 15 }}>You are confirmed. Thank you.</p>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button type="button" onClick={go} disabled={state === "busy"} style={{ minHeight: 46, borderRadius: 10, border: "none", background: "var(--bm-accent, #d9a441)", color: "#151109", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        {state === "busy" ? "Confirming..." : "Confirm my email"}
      </button>
      {state === "error" && <p role="alert" style={{ fontSize: 13, color: "var(--bm-text2, #b4b4b8)", margin: 0 }}>This link is not valid. Join again from the page to get a new one.</p>}
    </div>
  );
}
