"use client";
import React, { useEffect, useState } from "react";

type Answer = "yes" | "partly" | "no";
const OPTIONS: Array<{ key: Answer; label: string }> = [{ key: "yes", label: "Yes" }, { key: "partly", label: "Partly" }, { key: "no", label: "No" }];

/** On a shared report: counts one open per visitor, then asks one question with three taps. */
export function ShareFeedback({ token }: { token: string }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await fetch("/api/break/share/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }) });
      return r.ok;
    } catch { return false; }
  }

  // Runs in the browser only, so link previews and crawlers are not counted as people.
  useEffect(() => { void post({ kind: "open" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(a: Answer) {
    setAnswer(a); setFailed(false);
    if (!(await post({ kind: "answer", answer: a }))) setFailed(true);
  }
  async function sendNote() {
    if (!answer || !note.trim()) return;
    if (await post({ kind: "answer", answer, note })) setSent(true); else setFailed(true);
  }

  const box: React.CSSProperties = { margin: "28px 0 8px", padding: "18px 18px 16px", borderRadius: 12, background: "#131316", border: "1px solid #2a2a30" };
  const btn = (on: boolean): React.CSSProperties => ({ minHeight: 44, padding: "0 22px", borderRadius: 10, border: `1px solid ${on ? "#E8C547" : "#3a3a42"}`, background: on ? "#E8C547" : "transparent", color: on ? "#09090A" : "#F2EFE6", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });

  return (
    <section style={box} aria-label="Feedback">
      <p style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Is this accurate?</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {OPTIONS.map((o) => <button key={o.key} type="button" style={btn(answer === o.key)} onClick={() => void pick(o.key)}>{o.label}</button>)}
      </div>
      {answer && !sent && (
        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", fontSize: 14, color: "#B9B5A5", marginBottom: 8 }}>
            {answer === "yes" ? "Thanks. Anything it missed? (optional)" : "What is off? One line is enough. (optional)"}
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} rows={2}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #3a3a42", background: "#09090A", color: "#F2EFE6", fontSize: 15, fontFamily: "inherit", resize: "vertical" }} />
          <button type="button" onClick={() => void sendNote()} disabled={!note.trim()} style={{ ...btn(false), marginTop: 10, opacity: note.trim() ? 1 : 0.5 }}>Send</button>
        </div>
      )}
      {sent && <p style={{ margin: "12px 0 0", fontSize: 14, color: "#5CC592" }}>Sent. Thank you.</p>}
      {failed && <p style={{ margin: "12px 0 0", fontSize: 13, color: "#E8706A" }}>Could not save that. Try again.</p>}
    </section>
  );
}
