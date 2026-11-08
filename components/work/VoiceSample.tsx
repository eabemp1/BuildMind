"use client";
import React from "react";
import { btn, input, muted } from "./ui";

async function call(method: "GET" | "POST", body?: unknown): Promise<{ ok: boolean; sample?: string; error?: string }> {
  try {
    const r = await fetch("/api/work/voice", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return (await r.json()) as { ok: boolean; sample?: string; error?: string };
  } catch { return { ok: false, error: "No connection. Please try again." }; }
}

/** One small box on the Work home: paste a couple of your own messages and every draft matches how you write. */
export default function VoiceSample() {
  const [saved, setSaved] = React.useState("");
  const [text, setText] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => { void call("GET").then((r) => { if (r.ok && r.sample) { setSaved(r.sample); setText(r.sample); } }); }, []);

  async function save(next: string) {
    setBusy(true); setMsg("");
    const r = await call("POST", { sample: next });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? "Could not save this."); return; }
    setSaved(r.sample ?? ""); setText(r.sample ?? ""); setMsg(r.sample ? "Saved. New drafts will sound more like you." : "Removed.");
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" className="wk-btn" onClick={() => setOpen(!open)} aria-expanded={open} style={btn()}>
        {saved ? "Your writing sample" : "Make drafts sound like you"}
      </button>
      {open && (
        <div className="wk-fade" style={{ display: "grid", gap: 8, marginTop: 10, maxWidth: 640 }}>
          <p style={muted}>Paste one or two real messages you wrote to a customer or friend. BuildMind only copies the tone, never the facts. You can remove it any time.</p>
          <textarea rows={5} maxLength={1200} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your writing sample" style={input} placeholder="Hi Kofi, thanks for replying so fast. I'd love to hear how you handle this today..." />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="wk-btn" disabled={busy || text.trim().length < 40} onClick={() => void save(text)} style={{ ...btn(true), opacity: busy || text.trim().length < 40 ? 0.55 : 1 }}>{busy ? "Saving…" : "Save"}</button>
            {saved ? <button type="button" className="wk-btn" disabled={busy} onClick={() => void save("")} style={btn()}>Remove</button> : null}
            {msg ? <span role="status" style={muted}>{msg}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
