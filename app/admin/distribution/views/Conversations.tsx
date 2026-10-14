"use client";
import React, { useState } from "react";
import { C, Panel } from "@/app/admin/components/ui";
import { CONV_STATUSES, type Conversation, type ConvStatus } from "@/lib/distribution/overview";
import { api, Btn, Chip, Copy, Empty, Field, fmtDate, input } from "../shared";

const LABEL: Record<ConvStatus, string> = { queued: "Queued", replied: "Replied", followed_up: "Followed up", interested: "Interested", interview: "Interview", trial: "Trial", paid: "Paid", closed: "Closed" };

function Row({ c, reload }: { c: Conversation; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(c.suggested_reply ?? "");
  const [follow, setFollow] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [notes, setNotes] = useState(c.notes ?? "");
  const [next, setNext] = useState(c.next_action ?? "");

  const patch = async (data: Record<string, unknown>) => { await api(`conversations?id=${c.id}`, "PATCH", data); reload(); };

  async function draft() {
    setBusy(true); setMsg("");
    const r = await api<{ reply: string; followUps: string[]; why: string }>("reply", "POST", { conversationId: c.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? "Failed");
    if (!r.reply) return setMsg(r.why);
    setReply(r.reply); setFollow(r.followUps); setMsg(r.why); reload();
  }

  return (
    <div style={{ borderTop: `1px solid ${C.b}`, padding: "10px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
            <Chip color={C.t2}>{c.platform}</Chip>
            {c.segment && <span style={{ fontSize: 11, color: C.t3 }}>{c.segment}</span>}
            <span style={{ fontSize: 11, color: C.t4 }}>last contact {fmtDate(c.last_contacted_at)}</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: open ? 20 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.excerpt || c.url || "No excerpt saved"}</div>
          {c.url && <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: C.a, wordBreak: "break-all" }}>{c.url}</a>}
        </div>
        <select value={c.status} onChange={(e) => patch({ status: e.target.value })} style={{ ...input, width: "auto", fontSize: 12 }}>
          {CONV_STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
        <Btn small onClick={() => setOpen(!open)}>{open ? "Less" : "More"}</Btn>
      </div>

      {open && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {c.relevance && <div style={{ fontSize: 12, color: C.t3 }}><b style={{ color: C.t2 }}>Why relevant:</b> {c.relevance}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn small onClick={draft} disabled={busy || !c.excerpt?.trim()}>{busy ? "Drafting…" : "Draft a reply"}</Btn>
            <Btn small onClick={() => patch({ last_contacted_at: new Date().toISOString(), ...(c.status === "queued" ? { status: "replied" } : {}) })}>I contacted them today</Btn>
            <Btn small kind="danger" onClick={async () => { if (confirm("Delete this conversation?")) { await api(`conversations?id=${c.id}`, "DELETE"); reload(); } }}>Delete</Btn>
          </div>
          {!c.excerpt?.trim() && <div style={{ fontSize: 11.5, color: C.t4 }}>Paste the post excerpt to get a reply grounded in what was actually said.</div>}
          {msg && <div style={{ fontSize: 11.5, color: C.t3 }}>{msg}</div>}
          {reply && (
            <div style={{ border: `1px solid ${C.b}`, borderRadius: C.rMd, padding: 10, background: C.bg3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 11, color: C.t3 }}>Draft for you to review and post yourself</span><Copy text={reply} /></div>
              <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{reply}</div>
              {follow.length > 0 && <div style={{ fontSize: 12, color: C.t3, marginTop: 8 }}>Other follow-up questions: {follow.join(" · ")}</div>}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <Field label="Next action"><input value={next} onChange={(e) => setNext(e.target.value)} onBlur={() => next !== (c.next_action ?? "") && patch({ next_action: next })} style={input} /></Field>
            <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (c.notes ?? "") && patch({ notes })} style={input} /></Field>
          </div>
        </div>
      )}
    </div>
  );
}

export function Conversations({ items, reload }: { items: Conversation[]; reload: () => void }) {
  const [f, setF] = useState({ platform: "reddit", url: "", excerpt: "", segment: "", relevance: "" });
  const [filter, setFilter] = useState<"all" | ConvStatus>("all");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function add() {
    setErr("");
    if (!f.url.trim() && !f.excerpt.trim()) return setErr("Add a link or an excerpt.");
    const r = await api("conversations", "POST", { platform: f.platform, url: f.url || null, excerpt: f.excerpt || null, segment: f.segment || null, relevance: f.relevance || null });
    if (!r.ok) return setErr(r.error ?? "Could not save");
    setF({ ...f, url: "", excerpt: "", relevance: "" }); reload();
  }

  const counts = CONV_STATUSES.map((s) => [s, items.filter((c) => c.status === s).length] as const);
  const shown = filter === "all" ? items : items.filter((c) => c.status === filter);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title="Add a public conversation" right={<span style={{ fontSize: 11, color: C.t3 }}>Curated by you. Nothing is scraped or sent.</span>}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            <Field label="Platform"><select value={f.platform} onChange={set("platform")} style={input}>{["reddit", "linkedin", "x", "hn", "indiehackers", "email", "other"].map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Public URL"><input value={f.url} onChange={set("url")} placeholder="https://…" style={input} /></Field>
            <Field label="Audience segment"><input value={f.segment} onChange={set("segment")} placeholder="e.g. indie hackers" style={input} /></Field>
          </div>
          <Field label="Relevant excerpt or your notes"><textarea value={f.excerpt} onChange={set("excerpt")} rows={3} style={{ ...input, resize: "vertical" }} /></Field>
          <Field label="Why is it relevant?"><input value={f.relevance} onChange={set("relevance")} style={input} /></Field>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Btn kind="primary" onClick={add}>Save to queue</Btn>{err && <span style={{ fontSize: 12, color: C.red }}>{err}</span>}</div>
        </div>
      </Panel>

      <Panel title="Pipeline">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          <button onClick={() => setFilter("all")} style={pill(filter === "all")}>All {items.length}</button>
          {counts.map(([s, n]) => <button key={s} onClick={() => setFilter(s)} style={pill(filter === s)}>{LABEL[s]} {n}</button>)}
        </div>
        {shown.length === 0 && <Empty>{items.length ? "Nothing in this stage." : "No conversations yet. Save the first public discussion where founders talk about execution, then reply to it."}</Empty>}
        {shown.map((c) => <Row key={c.id} c={c} reload={reload} />)}
      </Panel>
    </div>
  );
}

const pill = (on: boolean): React.CSSProperties => ({ padding: "3px 9px", borderRadius: 99, fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", color: on ? C.t : C.t3, background: on ? C.bg3 : "transparent", border: `1px solid ${on ? C.a : C.b}` });
