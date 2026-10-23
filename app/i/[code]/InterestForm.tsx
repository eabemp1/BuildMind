"use client";

import { useState } from "react";

export function InterestForm({ code }: { code: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const website = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
      const res = await fetch("/api/signal-links/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, email, website }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) { setState("done"); setMsg(j.alreadyJoined ? "You are already on the list." : "Almost done. Check your email and press the confirm button."); }
      else { setState("error"); setMsg(j.error ?? "Something went wrong. Try again."); }
    } catch { setState("error"); setMsg("Could not reach the server. Try again."); }
  }

  if (state === "done") return <p role="status" style={{ fontSize: 15 }}>{msg}</p>;
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      {/* Hidden from people; bots tend to fill it. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      <input
        type="email" required inputMode="email" autoComplete="email" placeholder="you@example.com" aria-label="Your email"
        value={email} onChange={(e) => setEmail(e.target.value)}
        style={{ minHeight: 46, padding: "0 14px", borderRadius: 10, border: "1px solid var(--bm-border, #2a2a2e)", background: "var(--bm-bg2, #17171a)", color: "inherit", fontSize: 16 }}
      />
      <button type="submit" disabled={state === "sending"} style={{ minHeight: 46, borderRadius: 10, border: "none", background: "var(--bm-accent, #d9a441)", color: "#151109", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        {state === "sending" ? "Joining..." : "Join the early list"}
      </button>
      {state === "error" && <p role="alert" style={{ fontSize: 13, color: "var(--bm-text2, #b4b4b8)", margin: 0 }}>{msg}</p>}
    </form>
  );
}
