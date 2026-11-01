"use client";
import React from "react";
import type { WorkSpec } from "@/lib/work/registry";
import type { WorkResult } from "@/lib/work/shape";
import { REFINE_PRESETS } from "@/lib/work/shape";
import { api, btn, card, input, muted } from "./ui";

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

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={btn()}>← All work</button>
        <button type="button" onClick={onEditBrief} style={btn()}>Change the brief</button>
        <button type="button" onClick={onRegenerate} disabled={regenerating} style={{ ...btn(), opacity: regenerating ? 0.55 : 1 }}>{regenerating ? "Preparing again…" : "Prepare again"}</button>
      </div>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 4px" }}>{payload.title}</h2>
        {payload.summary && <p style={muted}>{payload.summary}</p>}
      </div>

      {payload.needs.length > 0 && (
        <div role="note" style={{ ...card, borderColor: "var(--bm-amber)", display: "grid", gap: 6 }}>
          {payload.needs.map((n) => (<p key={n.label} style={{ ...muted, color: "var(--bm-text2)" }}><strong>{n.label}.</strong> {n.why}</p>))}
        </div>
      )}

      {payload.variants.length > 0 && (
        <div style={{ ...card, display: "grid", gap: 12 }}>
          {payload.variants.length > 1 && (
            <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {payload.variants.map((v) => (<button key={v.id} role="tab" aria-selected={active === v.id} type="button" onClick={() => setActive(v.id)} style={btn(false, active === v.id)}>{v.label}</button>))}
            </div>
          )}
          {current?.why && <p style={muted}>{current.why}</p>}
          <textarea aria-label="Draft" value={texts[active] ?? ""} onChange={(e) => edit(active, e.target.value)} rows={Math.min(18, Math.max(6, (texts[active] ?? "").split("\n").length + 2))} style={{ ...input, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={() => void copy("v", texts[active] ?? "")} style={btn(true)}>{copied === "v" ? "Copied" : "Copy"}</button>
            <button type="button" onClick={() => download(texts[active] ?? "")} style={btn()}>Download</button>
            {undo[active] && <button type="button" onClick={() => { edit(active, undo[active]); setUndo({ ...undo, [active]: "" }); }} style={btn()}>Undo last change</button>}
            <span style={muted}>{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved to your library" : "Not saved (the library is not set up yet)"}</span>
          </div>
          <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--bm-border)", paddingTop: 12 }}>
            <p style={{ ...muted, fontWeight: 600 }}>Change it</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {REFINE_PRESETS.map((p) => (<button key={p} type="button" disabled={refining} onClick={() => void refine(p)} style={{ ...btn(), opacity: refining ? 0.55 : 1 }}>{p}</button>))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={instruction} maxLength={200} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && instruction.trim()) void refine(instruction); }} placeholder="Or say it: e.g. mention the free trial" aria-label="Your instruction" style={input} />
              <button type="button" disabled={refining || !instruction.trim()} onClick={() => void refine(instruction)} style={{ ...btn(), opacity: refining || !instruction.trim() ? 0.55 : 1 }}>{refining ? "Working…" : "Apply"}</button>
            </div>
          </div>
        </div>
      )}

      {payload.sections.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {payload.sections.map((s, i) => (
            <section key={`${s.heading}-${i}`} style={{ ...card, display: "grid", gap: 6 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", margin: 0 }}>{s.heading}</h3>
              {s.body && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--bm-text2)", whiteSpace: "pre-wrap" }}>{s.body}</p>}
              {s.bullets && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6, color: "var(--bm-text2)" }}>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
              <div><button type="button" onClick={() => void copy(`s${i}`, [s.heading, s.body ?? "", ...(s.bullets ?? []).map((b) => `- ${b}`)].filter(Boolean).join("\n"))} style={btn()}>{copied === `s${i}` ? "Copied" : "Copy this part"}</button></div>
            </section>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void copy("all", wholeDoc)} style={btn(true)}>{copied === "all" ? "Copied" : "Copy everything"}</button>
            <button type="button" onClick={() => download(wholeDoc)} style={btn()}>Download</button>
          </div>
        </div>
      )}

      {msg && <p role="alert" style={{ ...muted, color: "var(--bm-red)" }}>{msg}</p>}

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <p style={{ ...muted, color: "var(--bm-text2)" }}><strong>Your part:</strong> {spec.you}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void mark(status === "used" ? "draft" : "used")} style={btn(false, status === "used")}>{status === "used" ? "Marked as used" : "Mark as used"}</button>
          {canSend && <button type="button" onClick={() => void mark(status === "sent" ? "draft" : "sent")} style={btn(false, status === "sent")}>{status === "sent" ? "Marked as sent" : "Mark as sent"}</button>}
          <button type="button" onClick={() => void remove()} style={btn()}>Delete</button>
        </div>
        {status !== "draft" && (
          <div>
            <label htmlFor="work-note" style={{ ...muted, fontWeight: 600, display: "block", marginBottom: 4 }}>What happened? (one line, optional)</label>
            <input id="work-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} onBlur={() => void saveNote()} placeholder="e.g. 2 of 5 replied" style={input} />
          </div>
        )}
      </div>
    </div>
  );
}
