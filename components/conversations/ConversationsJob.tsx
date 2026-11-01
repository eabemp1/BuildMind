"use client";
import React from "react";
import Link from "next/link";
import { useActiveProjectId } from "@/lib/queries";
import { FOLLOW_UP_AFTER_DAYS, GOAL_DEFAULT, STATUS_LABEL, STATUS_ORDER, followUpDue, type PersonStatus, type Summary, type Insight } from "@/lib/conversations/track";
import { api, btn, card, input, label, muted } from "@/components/work/ui";

interface P { id: string; name: string; where_found: string | null; link: string | null; status: PersonStatus; contacted_at: string | null; message: string | null; notes: string | null; insights: Insight[] | null }
interface Data { setup?: boolean; people: P[]; summary: Summary; next: string }

export default function ConversationsJob() {
  const projectId = useActiveProjectId();
  const [d, setD] = React.useState<Data | null>(null);
  const [name, setName] = React.useState("");
  const [where, setWhere] = React.useState("");
  const [err, setErr] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const r = await api<Data>("/api/conversations");
    if (r.ok && r.data) setD(r.data); else setErr(r.error ?? "Could not load your list.");
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!name.trim()) return;
    setErr("");
    const r = await api("/api/conversations", { method: "POST", body: JSON.stringify({ name, whereFound: where, projectId }) });
    if (!r.ok) { setErr(r.error ?? "Could not add."); return; }
    setName(""); setWhere(""); void load();
  }
  async function setStatus(id: string, status: PersonStatus) {
    await api("/api/conversations", { method: "PATCH", body: JSON.stringify({ id, status }) }); void load();
  }
  async function remove(id: string) {
    if (!window.confirm("Remove this person from your list?")) return;
    await api(`/api/conversations?id=${id}`, { method: "DELETE" }); void load();
  }

  const s = d?.summary;
  const now = new Date();
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 64px", display: "grid", gap: 16 }}>
      <Link href="/work" style={{ ...muted, textDecoration: "none" }}>← Work</Link>
      <header style={{ display: "grid", gap: 6 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--bm-text)", margin: 0 }}>Get {GOAL_DEFAULT} customer conversations</h1>
        <p style={{ ...muted, fontSize: 14 }}>You add the people. BuildMind helps you write to them and learn from each talk. You send every message yourself.</p>
      </header>

      {d?.setup && <p role="note" style={{ ...muted, color: "var(--bm-amber)" }}>The tracker is not set up yet, so people you add will not be saved. Run the latest database migration first.</p>}

      {s && (
        <div style={{ ...card, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "var(--bm-text2)" }}>
            <span><strong style={{ fontSize: 20, color: "var(--bm-text)" }}>{s.talked}</strong> / {s.goal} talked</span>
            <span>{s.contacted} contacted</span>
            <span>{s.replied} replied{s.replyRate !== null ? ` (${s.replyRate}%)` : ""}</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--bm-text)" }}><strong>Next:</strong> {d?.next}</p>
        </div>
      )}

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <label style={label} htmlFor="cp-name">Add someone you could talk to</label>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <input id="cp-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Name or handle" style={input} />
          <input value={where} maxLength={160} onChange={(e) => setWhere(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="Where you found them (optional)" aria-label="Where you found them" style={input} />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => void add()} disabled={!name.trim()} style={{ ...btn(true), opacity: name.trim() ? 1 : 0.55 }}>Add</button>
          <span style={muted}>Need places to look? <Link href="/work" style={{ color: "inherit" }}>Work → Find 10 founders to talk to</Link> lists real communities and threads.</span>
        </div>
        {err && <p role="alert" style={{ ...muted, color: "var(--bm-red)" }}>{err}</p>}
      </div>

      {d && d.people.length === 0 && <p style={muted}>No one yet. Start with three people.</p>}
      {d?.people.map((p) => <PersonCard key={p.id} p={p} due={followUpDue({ id: p.id, name: p.name, status: p.status, contacted_at: p.contacted_at }, now)} open={open === p.id}
        onToggle={() => setOpen(open === p.id ? null : p.id)} onStatus={(st) => void setStatus(p.id, st)} onRemove={() => void remove(p.id)} onChanged={load} projectId={projectId} />)}
    </div>
  );
}

function PersonCard({ p, due, open, onToggle, onStatus, onRemove, onChanged, projectId }: {
  p: P; due: boolean; open: boolean; onToggle: () => void; onStatus: (s: PersonStatus) => void; onRemove: () => void; onChanged: () => void; projectId: string | null;
}) {
  const [msg, setMsg] = React.useState(p.message ?? "");
  const [notes, setNotes] = React.useState(p.notes ?? "");
  const [busy, setBusy] = React.useState("");
  const [note, setNote] = React.useState("");
  const [upgrade, setUpgrade] = React.useState(false);
  const [learnNote, setLearnNote] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => { setMsg(p.message ?? ""); setNotes(p.notes ?? ""); }, [p.message, p.notes]);

  async function draft(kind: "first" | "followup") {
    setBusy("draft"); setNote("");
    const r = await api<{ text: string; check: string | null }>("/api/conversations/message", { method: "POST", body: JSON.stringify({ id: p.id, kind, projectId }) });
    setBusy("");
    if (!r.ok || !r.data) { setNote(r.error ?? "Could not write this."); return; }
    setMsg(r.data.text); setNote(r.data.check ?? "");
  }
  async function saveMsg() { await api("/api/conversations", { method: "PATCH", body: JSON.stringify({ id: p.id, message: msg }) }); }
  async function copy() { try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setNote("Could not copy. Select the text and copy it by hand."); } }
  async function learn() {
    setBusy("learn"); setLearnNote("");
    const r = await api("/api/conversations/insights", { method: "POST", body: JSON.stringify({ id: p.id, notes }) });
    setBusy("");
    if (!r.ok) { setLearnNote(r.error ?? "Could not read the notes."); setUpgrade(Boolean(r.upgrade)); onChanged(); return; }
    setUpgrade(false);
    onChanged();
  }

  const days = p.contacted_at ? Math.floor((Date.now() - Date.parse(p.contacted_at)) / 86_400_000) : null;
  return (
    <div style={{ ...card, display: "grid", gap: 10, borderColor: due ? "var(--bm-amber)" : undefined }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "var(--bm-text)", overflowWrap: "anywhere" }}>{p.name}</span>
          <span style={muted}>{p.where_found ? `${p.where_found} · ` : ""}{days !== null ? `contacted ${days <= 0 ? "today" : `${days}d ago`}` : "not contacted"}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: due ? "var(--bm-amber)" : "var(--bm-text2)", flexShrink: 0 }}>{due ? `Follow up (${FOLLOW_UP_AFTER_DAYS}+ days)` : STATUS_LABEL[p.status]}</span>
      </button>
      {open && (
        <div style={{ display: "grid", gap: 12, borderTop: "1px solid var(--bm-border)", paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUS_ORDER.map((st) => <button key={st} type="button" onClick={() => onStatus(st)} style={btn(false, p.status === st)}>{STATUS_LABEL[st]}</button>)}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={label} htmlFor={`m-${p.id}`}>Message</label>
            <textarea id={`m-${p.id}`} rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} onBlur={() => void saveMsg()} placeholder="Write your own, or let BuildMind draft one" style={{ ...input, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" disabled={!!busy} onClick={() => void draft(p.status === "to_contact" ? "first" : "followup")} style={{ ...btn(), opacity: busy ? 0.55 : 1 }}>{busy === "draft" ? "Writing…" : p.status === "to_contact" ? "Draft first message" : "Draft follow-up"}</button>
              <button type="button" disabled={!msg.trim()} onClick={() => void copy()} style={btn(true)}>{copied ? "Copied" : "Copy"}</button>
              {p.status === "to_contact" && <button type="button" onClick={() => onStatus("sent")} style={btn()}>I sent it</button>}
            </div>
            {note && <p role="note" style={{ ...muted, color: "var(--bm-amber)" }}>{note}</p>}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={label} htmlFor={`n-${p.id}`}>What did they say? (rough notes are fine)</label>
            <textarea id={`n-${p.id}`} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Write after the conversation, in their words where you can" style={{ ...input, resize: "vertical" }} />
            <div><button type="button" disabled={!!busy || notes.trim().length < 30} onClick={() => void learn()} style={{ ...btn(), opacity: busy || notes.trim().length < 30 ? 0.55 : 1 }}>{busy === "learn" ? "Reading…" : "Pull out what matters"}</button></div>
            {learnNote && <p role="note" style={{ ...muted, color: "var(--bm-amber)" }}>{learnNote}</p>}
            {upgrade && <div><Link href="/upgrade" style={{ ...btn(true), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>See Builder</Link></div>}
            {p.insights && p.insights.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 14, color: "var(--bm-text2)" }}>
                {p.insights.map((i, k) => <li key={k}>{i.point} <span style={{ color: "var(--bm-text3)" }}>— “{i.quote}”</span></li>)}
              </ul>
            )}
            {p.insights && p.insights.length === 0 && p.notes && <p style={muted}>Nothing clear could be pulled out of those notes. Add what they actually said.</p>}
          </div>
          <div><button type="button" onClick={onRemove} style={btn()}>Remove</button></div>
        </div>
      )}
    </div>
  );
}
