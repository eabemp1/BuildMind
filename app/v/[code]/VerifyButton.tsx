"use client";

import { useState } from "react";

export function VerifyButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function go() {
    setState("busy");
    try {
      const r = await fetch("/api/signal-links/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) setState("done"); else { setState("error"); setMsg(j.error ?? "Could not record that."); }
    } catch { setState("error"); setMsg("Could not reach the server."); }
  }
  if (state === "done") return <p role="status" style={{ fontSize: 15 }}>Confirmed. Thank you.</p>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button type="button" onClick={go} disabled={state === "busy"} style={{ minHeight: 46, borderRadius: 10, border: "none", background: "var(--bm-accent, #d9a441)", color: "#151109", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        {state === "busy" ? "Confirming..." : "Yes, that is true"}
      </button>
      {state === "error" && <p role="alert" style={{ fontSize: 13, color: "var(--bm-text2, #b4b4b8)", margin: 0 }}>{msg}</p>}
    </div>
  );
}
