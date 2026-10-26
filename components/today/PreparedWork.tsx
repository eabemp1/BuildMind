"use client";

import PublishPage from "@/components/today/PublishPage";
import { capabilityLine } from "@/lib/capability";
import { ResultNote } from "@/components/today/ResultNote";
import React from "react";
import { PREP_META, prepKindFor, type PrepKind, type Prepared } from "@/lib/prep/kinds";
import type { Diagnosis } from "@/lib/distribution/diagnose";
import { analyseText, observe, type Platform } from "@/lib/distribution/textSignals";
import ConnectCard, { type KeyApp } from "@/components/integrations/ConnectCard";
import type { ReplyAssist } from "@/lib/prep/reply";
import type { NotesRead } from "@/lib/prep/notes";

/**
 * Today's task, already started. BuildMind detects what kind of work the task
 * is and prepares the first draft: messages, a post, landing copy, an SEO
 * brief, an investor update, a competitor brief, an interview kit or a video
 * script. The panel changes with the task. The founder reviews, edits and does
 * the final human act. Edits and results are recorded so the next draft is
 * better. Nothing is sent or posted by BuildMind.
 */

interface Prep {
  /** Null when the work could not be saved (database not set up). It is still shown. */
  id: string | null;
  kind: PrepKind;
  prepared: Prepared;
  chosenVariant: string | null;
  finalText: string | null;
  status: "prepared" | "edited" | "used" | "sent";
  outcome: string | null;
  corrections: number;
  learned: string[];
  performance: { used: number; responded: number; waiting: number } | null;
}

interface Props {
  task: string;
  missionKind?: string | null;
  firstStep?: string;
  projectId?: string | null;
  /** The idea being tested when it is not a saved project (Break My Startup). */
  idea?: string;
  /** Puts a variant into the editable message box further down the page. */
  onUseDraft?: (text: string) => void;
}

const box: React.CSSProperties = { background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-xl)", padding: "var(--space-4)", marginBottom: "var(--space-4)", display: "grid", gap: "var(--space-3)" };
const muted: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--bm-text3)", lineHeight: "var(--leading-normal)", margin: 0 };
const btn = (primary = false, active = false): React.CSSProperties => ({
  fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "6px 12px",
  border: `1px solid ${primary || active ? "var(--bm-text)" : "var(--bm-border2)"}`,
  background: primary ? "var(--bm-text)" : active ? "var(--bm-bg3)" : "transparent",
  color: primary ? "var(--bm-bg)" : "var(--bm-text2)",
});

const FOLLOW_UP: Partial<Record<string, { choice: "1d" | "3d"; when: string; measure: string }>> = {
  outreach: { choice: "3d", when: "3 days", measure: "Did they reply? Who answered, and what did they say?" },
  post: { choice: "1d", when: "tomorrow", measure: "How many views, replies or signups did the post get?" },
  launch_plan: { choice: "1d", when: "tomorrow", measure: "What did the launch get: comments, visits, signups?" },
  landing: { choice: "3d", when: "3 days", measure: "How many visits and signups did the page get?" },
};

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok !== false ? { ok: true, data: j as T } : { ok: false, error: (j as { error?: string }).error ?? "Something went wrong." };
  } catch { return { ok: false, error: "Could not reach BuildMind." }; }
}

export default function PreparedWork({ task, missionKind, firstStep, projectId, onUseDraft, idea }: Props) {
  const kind = React.useMemo(() => prepKindFor(task, missionKind), [task, missionKind]);
  const [prep, setPrep] = React.useState<Prep | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [unsaved, setUnsaved] = React.useState(false);
  const [saveDetail, setSaveDetail] = React.useState("");
  const [active, setActive] = React.useState("v1");
  const [texts, setTexts] = React.useState<Record<string, string>>({});
  const [origin, setOrigin] = React.useState<Record<string, string>>({});
  const [extra, setExtra] = React.useState<Array<{ id: string; label: string; text: string; why?: string }>>([]);
  const [diag, setDiag] = React.useState<Diagnosis | null>(null);
  const [busy, setBusy] = React.useState<"" | "fix" | "redo">("");
  const [note, setNote] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const lastTask = React.useRef("");
  const [connectApp, setConnectApp] = React.useState<KeyApp | null>(null);
  const [theirReply, setTheirReply] = React.useState("");
  const [assist, setAssist] = React.useState<ReplyAssist | null>(null);
  const [assistMode, setAssistMode] = React.useState<"" | "reply" | "followup">("");
  const [assistBusy, setAssistBusy] = React.useState(false);
  const [assistText, setAssistText] = React.useState("");
  const [videoUrl, setVideoUrl] = React.useState("");
  const [videoBusy, setVideoBusy] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [notesRead, setNotesRead] = React.useState<NotesRead | null>(null);
  const [notesBusy, setNotesBusy] = React.useState(false);

  const load = React.useCallback(async (regenerate = false) => {
    if (!kind) return;
    setLoading(true); setNote(""); setLoadError("");
    const r = await post<{ prep: Prep | null; reason?: string }>("/api/ai/prep", { task, missionKind: missionKind ?? null, projectId: projectId ?? null, firstStep, regenerate, ...(idea ? { idea } : {}) });
    setLoading(false);
    if (!r.ok) { setLoadError(r.error ?? "Could not prepare this task."); if (regenerate) setNote(r.error ?? ""); return; }
    const p = r.data?.prep ?? null;
    setUnsaved(r.data?.reason === "setup");
    setSaveDetail((r.data as { detail?: string } | null)?.detail ?? "");
    if (!p) { setLoadError("Nothing could be prepared for this task."); return; }
    setPrep(p); setDiag(null); setExtra([]);
    if (p) {
      const t: Record<string, string> = {}; const o: Record<string, string> = {};
      for (const v of p.prepared.variants) { t[v.id] = v.text; o[v.id] = v.text; }
      if (p.finalText && p.chosenVariant) t[p.chosenVariant] = p.finalText;
      setTexts(t); setOrigin(o); setActive(p.chosenVariant ?? p.prepared.variants[0]?.id ?? "v1");
    }
  }, [kind, task, missionKind, projectId, firstStep]);

  React.useEffect(() => {
    if (!kind || !task || lastTask.current === `${task}|${missionKind}`) return;
    lastTask.current = `${task}|${missionKind}`;
    setPrep(null);
    void load(false);
  }, [kind, task, missionKind, load]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !kind) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("integration") === "search_console" && q.get("status") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
      void load(true);
    }
  }, [kind, load]);

  if (!kind) return null;
  const meta = PREP_META[kind];

  if (loading && !prep) {
    return (
      <div style={box} aria-live="polite">
        <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>Preparing your {meta.label.toLowerCase()}…</div>
        <div style={{ height: 52, borderRadius: 8, background: "var(--bm-bg3)" }} />
      </div>
    );
  }
  if (!prep) {
    // Never disappear silently: say what happened and offer a retry.
    return loadError ? (
      <div style={box} role="status">
        <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>Prepared for you</div>
        <p style={{ ...muted, color: "var(--bm-text2)" }}>{loadError}</p>
        <div><button type="button" style={btn()} onClick={() => void load(false)}>Try again</button></div>
      </div>
    ) : null;
  }

  const variants = [...prep.prepared.variants, ...extra];
  const current = variants.find((v) => v.id === active) ?? variants[0];
  const text = current ? (texts[current.id] ?? current.text) : "";
  const done = prep.status === "sent";
  const record = (event: "edited" | "used" | "sent" | "outcome", more: Record<string, unknown> = {}) =>
    !prep.id ? Promise.resolve({ ok: false } as { ok: boolean }) : post("/api/ai/prep/record", { id: prep.id, event, variantId: current?.id.startsWith("v") && prep.prepared.variants.some((v) => v.id === current.id) ? current.id : undefined, originalText: current ? origin[current.id] : undefined, finalText: text, ...more });

  const bump = (s: Prep["status"]) => setPrep((p) => (p ? { ...p, status: (["prepared", "edited", "used", "sent"].indexOf(s) > ["prepared", "edited", "used", "sent"].indexOf(p.status) ? s : p.status) } : p));

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard may be blocked */ }
    bump("used"); void record("used");
  }
  // Marking work as sent also schedules the follow-up, so "did it work?" comes back on its own. Shown on Today when due.
  const [followUp, setFollowUp] = React.useState("");
  async function markDone() {
    bump("sent"); await record("sent");
    const plan = kind ? FOLLOW_UP[kind] : undefined;
    if (!plan || !projectId) return;
    const r = await post("/api/today/loops", { task_text: task.slice(0, 480), measure: plan.measure, choice: plan.choice, projectId });
    if (r.ok) setFollowUp(`Follow-up set for ${plan.when}. It will show at the top of Today when it's due.`);
  }
  async function setOutcome(id: string) { setPrep((p) => (p ? { ...p, outcome: id } : p)); await record("outcome", { outcome: id, finalText: undefined, originalText: undefined }); }
  async function fix() {
    setBusy("fix"); setNote("");
    const r = await post<{ diagnosis: Diagnosis }>("/api/ai/prep/correct", prep!.id ? { id: prep!.id, text } : { text, kind: prep!.kind, platform: prep!.prepared.platform ?? "other" });
    setBusy("");
    if (!r.ok || !r.data) return setNote(r.error ?? "Could not review this draft.");
    setDiag(r.data.diagnosis);
  }
  function addRevision(i: number) {
    const rev = diag?.revisions[i]; if (!rev) return;
    const id = `r${extra.length + 1}`;
    setExtra((e) => [...e, { id, label: rev.approach[0].toUpperCase() + rev.approach.slice(1), text: rev.text, why: rev.why }]);
    setTexts((t) => ({ ...t, [id]: rev.text })); setOrigin((o) => ({ ...o, [id]: rev.text })); setActive(id);
  }

  async function askReply(mode: "reply" | "followup") {
    setAssistBusy(true); setNote("");
    const r = await post<{ assist: ReplyAssist; outcome: string | null }>("/api/ai/prep/reply", { ...(prep!.id ? { id: prep!.id } : { mine: text, platform: prep!.prepared.platform ?? "other" }), mode, theirReply: mode === "reply" ? theirReply : undefined });
    setAssistBusy(false);
    if (!r.ok || !r.data) return setNote(r.error ?? "Could not draft that just now.");
    setAssist(r.data.assist); setAssistText(r.data.assist.reply); setAssistMode(mode);
    if (r.data.outcome) setPrep((p) => (p ? { ...p, outcome: r.data!.outcome } : p));
  }
  async function saveVideo() {
    if (!prep!.id) return setNote(saveDetail ? `Not saved: ${saveDetail}. Run supabase/migrations/20261020000000_prepared_work.sql.` : "This needs the prepared_work table. Run supabase/migrations/20261020000000_prepared_work.sql.");
    setVideoBusy(true); setNote("");
    const r = await post<{ recorded: NonNullable<Prep["prepared"]["recorded"]> }>("/api/ai/prep/link", { id: prep!.id, url: videoUrl });
    setVideoBusy(false);
    if (!r.ok || !r.data) return setNote(r.error ?? "Could not save that link.");
    setPrep((p) => (p ? { ...p, status: "sent", prepared: { ...p.prepared, recorded: r.data!.recorded } } : p)); setVideoUrl("");
  }
  async function readNotes() {
    if (!prep!.id) return setNote(saveDetail ? `Not saved: ${saveDetail}. Run supabase/migrations/20261020000000_prepared_work.sql.` : "This needs the prepared_work table. Run supabase/migrations/20261020000000_prepared_work.sql.");
    setNotesBusy(true); setNote("");
    const r = await post<{ read: NotesRead }>("/api/ai/prep/notes", { id: prep!.id, notes });
    setNotesBusy(false);
    if (!r.ok || !r.data) return setNote(r.error ?? "Could not read those notes.");
    setNotesRead(r.data.read);
  }
  const platform = (["linkedin", "x", "reddit", "hn"].includes(prep.prepared.platform ?? "") ? prep.prepared.platform : "other") as Platform;
  const checks = (kind === "outreach" || kind === "post") && text.trim()
    ? [
        ...(kind === "outreach" && text.trim().split(/\s+/).length > 90 ? [{ key: "len", label: "Long for a first message", detail: `${text.trim().split(/\s+/).length} words. Short first messages get more replies.` }] : []),
        ...observe(analyseText(text, platform), platform).filter((o) => o.status === "watch" && !(kind === "outreach" && (o.key === "specificity" || o.key === "opening-length"))).map((o) => ({ key: o.key, label: o.label, detail: o.detail })),
      ].slice(0, 3)
    : [];

  const sections = prep.prepared.sections;
  const canFix = (kind === "outreach" || kind === "post") && Boolean(text.trim());

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>Prepared for you</div>
          <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--bm-text)" }}>{meta.headline}</div>
        </div>
        <button type="button" onClick={async () => { setBusy("redo"); await load(true); setBusy(""); }} disabled={busy !== ""} style={{ ...btn(), border: "none", color: "var(--bm-text3)" }}>{busy === "redo" ? "Redoing…" : "Redo"}</button>
      </div>
      {prep.prepared.summary && <p style={muted}>{prep.prepared.summary}</p>}
      {kind && <p style={muted}>{capabilityLine(kind)}</p>}

      {prep.prepared.facts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
          {prep.prepared.facts.map((f) => (
            <div key={f.label} style={{ border: "1px solid var(--bm-border)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: "var(--bm-text3)" }}>{f.label}</div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--bm-text)" }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}

      {variants.length > 0 && current && (
        <div style={{ display: "grid", gap: 8 }}>
          {variants.length > 1 && (
            <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {variants.map((v) => <button key={v.id} role="tab" aria-selected={v.id === current.id} type="button" onClick={() => setActive(v.id)} style={btn(false, v.id === current.id)}>{v.label}</button>)}
            </div>
          )}
          <textarea
            value={text} aria-label={`${current.label} draft`}
            onChange={(e) => setTexts((t) => ({ ...t, [current.id]: e.target.value }))}
            onBlur={() => { if (text.trim() && text !== origin[current.id]) { bump("edited"); void record("edited"); } }}
            rows={Math.min(14, Math.max(4, Math.ceil(text.length / 70) + text.split("\n").length))}
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: "var(--mood-radius, 10px)", padding: "10px 12px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)", lineHeight: "var(--leading-relaxed)" }}
          />
          {current.why && <p style={muted}>{current.why}</p>}
          {(kind === "outreach" || kind === "post") && text.trim() && (
            <div style={{ display: "grid", gap: 2 }} aria-live="polite">
              {checks.length === 0
                ? <p style={muted}>Checks: nothing to flag in this draft.</p>
                : checks.map((c) => <p key={c.key} style={muted}><strong style={{ color: "var(--bm-text2)", fontWeight: 600 }}>{c.label}.</strong> {c.detail}</p>)}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={copy} style={btn()}>{copied ? "Copied" : "Copy"}</button>
            {onUseDraft && kind === "outreach" && <button type="button" onClick={() => { onUseDraft(text); bump("used"); void record("used"); }} style={btn()}>Use in the box below</button>}
            {canFix && <button type="button" onClick={fix} disabled={busy !== ""} style={btn()}>{busy === "fix" ? "Reviewing…" : "Fix it"}</button>}
            {meta.doneVerb && !done && <button type="button" onClick={markDone} style={btn(true)}>{meta.doneVerb}</button>}
            {done && <span style={{ ...muted, color: "var(--bm-text2)" }}>Recorded.{followUp ? ` ${followUp}` : ""}</span>}
          </div>
          {kind === "landing" && text.trim() && <PublishPage draft={text} task={task} projectId={projectId} />}
        </div>
      )}

      {!meta.doneVerb && !idea && <ResultNote task={task} projectId={projectId} />}

      {done && meta.outcomes && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>How did it go? BuildMind learns from this.</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {meta.outcomes.map((o) => <button key={o.id} type="button" onClick={() => setOutcome(o.id)} style={btn(false, prep.outcome === o.id)}>{o.label}</button>)}
          </div>
        </div>
      )}

      {done && kind === "outreach" && (
        <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--bm-border)", paddingTop: "var(--space-3)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>Did they answer?</div>
          <textarea value={theirReply} onChange={(e) => setTheirReply(e.target.value)} rows={3} placeholder="Paste what they wrote and BuildMind drafts your reply" aria-label="Their reply"
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: "var(--mood-radius, 10px)", padding: "8px 10px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn(true)} disabled={assistBusy || theirReply.trim().length < 5} onClick={() => askReply("reply")}>{assistBusy && assistMode !== "followup" ? "Reading…" : "Draft my reply"}</button>
            <button type="button" style={btn()} disabled={assistBusy} onClick={() => askReply("followup")}>No answer yet: draft a follow-up</button>
          </div>
          {assist && (
            <div style={{ display: "grid", gap: 6 }}>
              {assistMode === "reply" && assist.summary && <p style={{ ...muted, color: "var(--bm-text2)" }}>{assist.read !== "unclear" ? `${assist.read[0].toUpperCase()}${assist.read.slice(1)}. ` : ""}{assist.summary}</p>}
              {assist.quote && <p style={{ ...muted, borderLeft: "2px solid var(--bm-border2)", paddingLeft: 8 }}>&ldquo;{assist.quote}&rdquo;</p>}
              {assist.reply && (
                <>
                  <textarea value={assistText} onChange={(e) => setAssistText(e.target.value)} rows={4} aria-label="Draft reply"
                    style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: "var(--mood-radius, 10px)", padding: "10px 12px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)", lineHeight: "var(--leading-relaxed)" }} />
                  <div><button type="button" style={btn()} onClick={() => { void navigator.clipboard?.writeText(assistText).catch(() => {}); }}>Copy</button></div>
                </>
              )}
              {assist.nextStep && <p style={muted}>Next: {assist.nextStep}</p>}
            </div>
          )}
        </div>
      )}

      {kind === "video_script" && (
        <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--bm-border)", paddingTop: "var(--space-3)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>Recorded it?</div>
          {prep.prepared.recorded ? (
            <p style={{ ...muted, color: "var(--bm-text2)" }}>Linked: <a href={prep.prepared.recorded.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "var(--bm-text2)" }}>{prep.prepared.recorded.title} ↗</a>{prep.prepared.recorded.verified ? "" : " (could not be checked, it may be private)"}. Later posts and launch plans will know a demo exists.</p>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Paste your Loom or YouTube link" aria-label="Video link" autoComplete="off"
                style={{ flex: "1 1 220px", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 10px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)" }} />
              <button type="button" style={btn(true)} disabled={videoBusy || videoUrl.trim().length < 10} onClick={saveVideo}>{videoBusy ? "Checking…" : "Save link"}</button>
            </div>
          )}
        </div>
      )}

      {kind === "validation_kit" && (
        <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--bm-border)", paddingTop: "var(--space-3)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>After the interview</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Paste your notes. BuildMind pulls out themes with their exact words and separates what they did from what they said they would do." aria-label="Interview notes"
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: "var(--mood-radius, 10px)", padding: "8px 10px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)" }} />
          <div><button type="button" style={btn(true)} disabled={notesBusy || notes.trim().length < 40} onClick={readNotes}>{notesBusy ? "Reading…" : "Read my notes"}</button></div>
          {notesRead && (
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ ...muted, color: "var(--bm-text2)" }}>{notesRead.behaviourCount} of {notesRead.themes.length} quotes describe something they actually did{notesRead.opinionCount ? `; ${notesRead.opinionCount} are opinions or things they would do` : ""}.</p>
              {notesRead.themes.map((t) => (
                <div key={t.quote} style={{ fontSize: "var(--text-sm)", color: "var(--bm-text2)", lineHeight: "var(--leading-normal)" }}>
                  {t.theme} <span style={{ ...muted, display: "inline" }}>({t.behaviour ? "did" : "said"})</span>
                  <div style={{ ...muted, borderLeft: "2px solid var(--bm-border2)", paddingLeft: 8, marginTop: 3 }}>&ldquo;{t.quote}&rdquo;</div>
                </div>
              ))}
              {notesRead.surprise && <p style={muted}>Possibly unexpected: {notesRead.surprise}</p>}
              {notesRead.nextQuestion && <p style={muted}>Ask next: {notesRead.nextQuestion}</p>}
            </div>
          )}
        </div>
      )}

      {diag && (
        <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--bm-border)", paddingTop: "var(--space-3)" }}>
          {diag.insight && <p style={{ ...muted, color: "var(--bm-text2)" }}>{diag.insight}</p>}
          {[...diag.weakening.slice(0, 3)].map((p, i) => (
            <div key={i} style={{ fontSize: "var(--text-sm)", color: "var(--bm-text2)", lineHeight: "var(--leading-normal)" }}>
              {p.point}{p.quote && <div style={{ ...muted, borderLeft: "2px solid var(--bm-border2)", paddingLeft: 8, marginTop: 3 }}>&ldquo;{p.quote}&rdquo;</div>}
            </div>
          ))}
          {diag.revisions.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {diag.revisions.map((r, i) => <button key={r.approach} type="button" onClick={() => addRevision(i)} style={btn()}>Try the {r.approach} version</button>)}
            </div>
          )}
          {!diag.ai && <p style={muted}>{diag.note}</p>}
        </div>
      )}
      {note && <p style={{ ...muted, color: "var(--bm-text2)" }}>{note}</p>}
      {unsaved && <p style={muted}>Not saved{saveDetail ? ` (${saveDetail})` : ""}. Drafting, fixing and replies still work, but results are not recorded until supabase/migrations/20261020000000_prepared_work.sql is run.</p>}

      {sections.map((s) => (
        <div key={s.heading} style={{ display: "grid", gap: 4, borderTop: "1px solid var(--bm-border)", paddingTop: "var(--space-3)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" }}>{s.heading}</div>
          {s.body && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--bm-text)", lineHeight: "var(--leading-relaxed)", whiteSpace: "pre-wrap" }}>{s.body}</p>}
          {s.bullets && <ul style={{ margin: 0, paddingLeft: 18, listStyleType: "disc" }}>{s.bullets.map((b, i) => <li key={i} style={{ fontSize: "var(--text-sm)", color: "var(--bm-text2)", lineHeight: "var(--leading-normal)", marginBottom: 3 }}>{b}</li>)}</ul>}
          {s.links && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{s.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" style={{ fontSize: "var(--text-xs)", color: "var(--bm-text2)" }}>{l.title} ↗</a>)}</div>}
        </div>
      ))}

      {prep.prepared.needs.map((n) => (
        <div key={n.label} style={{ border: "1px solid var(--bm-border)", borderRadius: 8, padding: "8px 10px", display: "grid", gap: 6 }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text2)" }}>{n.label}</div>
          <p style={muted}>{n.why}</p>
          {n.connect === "search_console" && <div><a href="/api/integrations/search-console/connect?return=/today" style={{ ...btn(), textDecoration: "none", display: "inline-block" }}>Connect Search Console</a></div>}
          {n.connect && n.connect !== "search_console" && connectApp !== n.connect && <div><button type="button" style={btn()} onClick={() => setConnectApp(n.connect as KeyApp)}>Connect {n.connect === "stripe" ? "Stripe" : "GitHub"}</button></div>}
          {n.connect && n.connect !== "search_console" && connectApp === n.connect && <ConnectCard app={n.connect} onCancel={() => setConnectApp(null)} onConnected={async () => { setConnectApp(null); setBusy("redo"); await load(true); setBusy(""); }} />}
        </div>
      ))}

      {(prep.learned.length > 0 || (prep.performance && prep.performance.used > 0)) && (
        <p style={muted}>
          {prep.performance && prep.performance.used > 0 && `You have used ${prep.performance.used} of these drafts${prep.performance.responded ? `, ${prep.performance.responded} got a response` : ""}. `}
          {prep.learned.length > 0 && `Learned from your own edits and results: ${prep.learned.join(" ")}`}
        </p>
      )}
    </div>
  );
}
