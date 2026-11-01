"use client";
import React from "react";
import type { WorkSpec } from "@/lib/work/registry";
import type { WorkResult } from "@/lib/work/shape";
import { REFINE_PRESETS } from "@/lib/work/shape";
import { api, btn, input, muted } from "./ui";

export interface WorkItem {
  id: string | null; kind: string; title: string; inputs: Record<string, string>;
  payload: WorkResult; edits: Record<string, string>; status: "draft" | "used" | "sent"; note: string | null;
}

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "work"; }

export default function ResultView({ item, spec, regenerating, onRegenerate, onEditBrief, onBack, onDeleted }: {
  item: WorkItem; spec: WorkSpec; regenerating: boolean;
  onRegenerate: () => void; onEditBrief: () => void; onBack: () => void; onDeleted: () => void;
}) {
  const { payload } = item;
  const [active, setActive] = React.useState(payload.variants[0]?.id ?? "");
  const [texts, setTexts] = React.useState<Record<string, string>>(() => {
    const t: Record<string, string> = {};
    for (const v of payload.variants) t[v.id] = item.edits?.[v.id] ?? v.text;
    return t;
  });
  const [undo, setUndo] = React.useState<Record<string, string>>({});
  const [saved, setSaved] = React.useState<"" | "saving" | "saved" | "unsaved">(item.id ? "saved" : "unsaved");
  const [status, setStatus] = React.useState(item.status);
  const [note, setNote] = React.useState(item.note ?? "");
  const [copied, setCopied] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [refining, setRefining] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // A regenerated item brings new text.
  React.useEffect(() => {
    const t: Record<string, string> = {};
    for (const v of payload.variants) t[v.id] = item.edits?.[v.id] ?? v.text;
    setTexts(t); setActive(payload.variants[0]?.id ?? ""); setStatus(item.status); setNote(item.note ?? ""); setUndo({}); setMsg("");
  }, [item.id, payload]); // eslint-disable-line react-hooks/exhaustive-deps

  function persist(next: Record<string, string>) {
    if (!item.id) return;
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await api("/api/work/items", { method: "PATCH", body: JSON.stringify({ id: item.id, edits: next }) });
      setSaved(r.ok ? "saved" : "unsaved");
    }, 800);
  }
  function edit(id: string, text: string) { const next = { ...texts, [id]: text }; setTexts(next); persist(next); }

  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1600); } catch { setMsg("Could not copy. Select the text and copy it by hand."); }
  }
  function download(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${slug(payload.title)}.txt`; a.click(); URL.revokeObjectURL(url);
  }
  const wholeDoc = [payload.title, "", ...payload.sections.flatMap((s) => [s.heading, s.body ?? "", ...(s.bullets ?? []).map((b) => `- ${b}`), ""])].join("\n").trim();

  async function refine(how: string) {
    const text = texts[active];
    if (!text || refining) return;
    setRefining(true); setMsg("");
    const r = await api<{ text: string }>("/api/work/refine", { method: "POST", body: JSON.stringify({ text, instruction: how }) });
    setRefining(false);
    if (!r.ok || !r.data) { setMsg(r.error ?? "Could not rewrite this."); return; }
    setUndo({ ...undo, [active]: text });
    edit(active, r.data.text); setInstruction("");
  }
  async function mark(next: "draft" | "used" | "sent") {
    setStatus(next);
    if (item.id) await api("/api/work/items", { method: "PATCH", body: JSON.stringify({ id: item.id, status: next }) });
  }
  async function saveNote() { if (item.id) await api("/api/work/items", { method: "PATCH", body: JSON.stringify({ id: item.id, note }) }); }
  async function remove() {
    if (!item.id) return onDeleted();
    if (!window.confirm("Delete this from your library?")) return;
    await api(`/api/work/items?id=${item.id}`, { method: "DELETE" }); onDeleted();
  }

  const current = payload.variants.find((v) => v.id === active);
  const canSend = spec.group === "reach" || spec.group === "raise";
  const small = (on = false): React.CSSProperties => ({ ...btn(false, on), minHeight: 32, padding: "0 12px", fontSize: 12.5 });

  return (
    <div className="wk-fade" style={{ display: "grid", gap: 18, maxWidth: 720 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <button type="button" className="wk-btn" onClick={onBack} style={small()}>Back</button>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="wk-btn" onClick={onEditBrief} style={small()}>Edit brief</button>
          <button type="button" className="wk-btn" onClick={onRegenerate} disabled={regenerating} style={{ ...small(), opacity: regenerating ? 0.55 : 1 }}>{regenerating ? "Preparing…" : "Redo"}</button>
        </div>
      </div>
      <div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 4px" }}>{payload.title}</h2>
        {payload.summary && <p style={{ ...muted, fontSize: 14 }}>{payload.summary}</p>}
      </div>

      {payload.needs.length > 0 && (
        <div role="note" style={{ border: "1px solid var(--bm-border2)", background: "var(--bm-bg2)", borderRadius: 12, padding: "10px 14px", display: "grid", gap: 4 }}>
          <p style={{ ...muted, fontWeight: 700, color: "var(--bm-text)" }}>Fill in before you use it</p>
          {payload.needs.map((n) => (<p key={n.label} style={{ ...muted, color: "var(--bm-text2)" }}><strong>{n.label}:</strong> {n.why}</p>))}
        </div>
      )}

      {payload.variants.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {payload.variants.length > 1 && (
            <div role="tablist" className="wk-tabs" style={{ width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}>
              {payload.variants.map((v) => (<button key={v.id} role="tab" aria-selected={active === v.id} type="button" className="wk-tab" onClick={() => setActive(v.id)}>{v.label}</button>))}
            </div>
          )}
          {current?.why && <p style={muted}>{current.why}</p>}
          <textarea aria-label="Draft" value={texts[active] ?? ""} onChange={(e) => edit(active, e.target.value)} rows={Math.min(18, Math.max(6, (texts[active] ?? "").split("\n").length + 2))} style={{ ...input, resize: "vertical", fontSize: 15, lineHeight: 1.65, padding: "14px 16px", borderRadius: 12 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="wk-btn" onClick={() => void copy("v", texts[active] ?? "")} style={{ ...btn(true), minHeight: 40, padding: "0 20px" }}>{copied === "v" ? "Copied" : "Copy"}</button>
            <button type="button" className="wk-btn" onClick={() => download(texts[active] ?? "")} style={small()}>Download</button>
            {undo[active] && <button type="button" className="wk-btn" onClick={() => { edit(active, undo[active]); setUndo({ ...undo, [active]: "" }); }} style={small()}>Undo</button>}
            <span style={{ ...muted, marginLeft: "auto" }}>{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : "Not saved"}</span>
          </div>
          <details style={{ borderTop: "1px solid var(--bm-border2)", paddingTop: 10 }}>
            <summary style={{ ...muted, fontWeight: 600, color: "var(--bm-text2)", cursor: "pointer" }}>Change the wording</summary>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {REFINE_PRESETS.map((p) => (<button key={p} type="button" className="wk-btn" disabled={refining} onClick={() => void refine(p)} style={{ ...small(), opacity: refining ? 0.55 : 1 }}>{p}</button>))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={instruction} maxLength={200} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && instruction.trim()) void refine(instruction); }} placeholder="Or say it: mention the free trial" aria-label="Your instruction" style={input} />
                <button type="button" className="wk-btn" disabled={refining || !instruction.trim()} onClick={() => void refine(instruction)} style={{ ...small(), opacity: refining || !instruction.trim() ? 0.55 : 1 }}>{refining ? "Working…" : "Apply"}</button>
              </div>
            </div>
          </details>
        </div>
      )}

      {payload.sections.length > 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="wk-btn" onClick={() => void copy("all", wholeDoc)} style={{ ...btn(true), minHeight: 40, padding: "0 20px" }}>{copied === "all" ? "Copied" : "Copy all"}</button>
            <button type="button" className="wk-btn" onClick={() => download(wholeDoc)} style={small()}>Download</button>
          </div>
          <div className="wk-list" style={{ background: "var(--bm-bg2)" }}>
            {payload.sections.map((s, i) => (
              <section key={`${s.heading}-${i}`} style={{ padding: "14px 16px", borderTop: i ? "1px solid var(--bm-border2)" : 0, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 14.5, fontWeight: 700, color: "var(--bm-text)", margin: 0 }}>{s.heading}</h3>
                  <button type="button" className="wk-btn" onClick={() => void copy(`s${i}`, [s.heading, s.body ?? "", ...(s.bullets ?? []).map((b) => `- ${b}`)].filter(Boolean).join("\n"))} style={{ ...small(), border: 0, minHeight: 28, color: "var(--bm-text3)", flexShrink: 0 }}>{copied === `s${i}` ? "Copied" : "Copy"}</button>
                </div>
                {s.body && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "var(--bm-text2)", whiteSpace: "pre-wrap" }}>{s.body}</p>}
                {s.bullets && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.65, color: "var(--bm-text2)" }}>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
              </section>
            ))}
          </div>
        </div>
      )}

      {msg && <p role="alert" style={{ ...muted, color: "var(--bm-red)" }}>{msg}</p>}

      <div style={{ borderTop: "1px solid var(--bm-border2)", paddingTop: 14, display: "grid", gap: 10 }}>
        <p style={{ ...muted, color: "var(--bm-text2)" }}>You: {spec.you}</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="wk-btn" onClick={() => void mark(status === "used" ? "draft" : "used")} style={small(status === "used")}>{status === "used" ? "Used" : "Mark used"}</button>
          {canSend && <button type="button" className="wk-btn" onClick={() => void mark(status === "sent" ? "draft" : "sent")} style={small(status === "sent")}>{status === "sent" ? "Sent" : "Mark sent"}</button>}
          <button type="button" className="wk-btn" onClick={() => void remove()} style={{ ...small(), marginLeft: "auto" }}>Delete</button>
        </div>
        {status !== "draft" && (
          <div>
            <label htmlFor="work-note" style={{ ...muted, fontWeight: 600, display: "block", marginBottom: 4 }}>What happened?</label>
            <input id="work-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} onBlur={() => void saveNote()} placeholder="e.g. 2 of 5 replied" style={input} />
          </div>
        )}
      </div>
    </div>
  );
}
