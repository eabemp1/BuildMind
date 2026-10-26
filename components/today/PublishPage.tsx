"use client";

import React from "react";
import { pageFromDraft } from "@/lib/publishPage";
import { inferSources, SOURCE_LABELS, type LinkSource } from "@/lib/linkNudge";

const CHOICES: LinkSource[] = ["tiktok", "x", "linkedin", "instagram", "youtube", "reddit", "whatsapp", "other"];

const muted: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--bm-text3)", lineHeight: "var(--leading-normal)", margin: 0 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 10px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)" };
const btn = (primary = false, on = false): React.CSSProperties => ({
  fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "6px 12px",
  border: `1px solid ${primary || on ? "var(--bm-text)" : "var(--bm-border2)"}`,
  background: primary ? "var(--bm-text)" : on ? "var(--bm-bg3)" : "transparent",
  color: primary ? "var(--bm-bg)" : "var(--bm-text2)",
});

interface Made { source: LinkSource | null; url: string }

/**
 * Turns a drafted landing copy into a live page that counts signups, with one link per channel so you can see which
 * channel brought people. The page and the counting already exist (BuildMind's hosted interest page); this removes
 * the step where the founder had to find them and retype the copy.
 */
export default function PublishPage({ draft, task, projectId }: { draft: string; task: string; projectId?: string | null }) {
  const suggested = React.useMemo(() => pageFromDraft(draft), [draft]);
  const [open, setOpen] = React.useState(false);
  const [headline, setHeadline] = React.useState("");
  const [pitch, setPitch] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  const [channels, setChannels] = React.useState<LinkSource[]>(() => inferSources(task));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [made, setMade] = React.useState<Made[]>([]);

  React.useEffect(() => {
    if (edited || !suggested) return;
    setHeadline(suggested.headline); setPitch(suggested.pitch);
  }, [suggested, edited]);

  async function create() {
    setBusy(true); setMsg(""); setMade([]);
    const targets: Array<LinkSource | undefined> = channels.length ? channels : [undefined];
    const out: Made[] = [];
    for (const source of targets) {
      try {
        const r = await fetch("/api/signal-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "interest", headline, pitch: pitch || undefined, source, projectId: projectId ?? undefined, label: source ? `${SOURCE_LABELS[source]} page` : undefined }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { setMsg(j.error ?? "Could not make the page."); break; }
        out.push({ source: source ?? null, url: `${window.location.origin}${j.path}` });
      } catch { setMsg("Could not reach BuildMind. Try again."); break; }
    }
    setMade(out);
    if (out.length && !msg) setMsg(out.length > 1 ? `Made ${out.length} pages, one per channel.` : "Made your page.");
    setBusy(false);
  }

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setMsg("Copied."); } catch { setMsg(url); }
  }

  if (!suggested) return null;
  return (
    <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--bm-border)", paddingTop: 10 }}>
      {!open ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={btn(true)} onClick={() => setOpen(true)}>Make this a live page</button>
          <span style={muted}>Gives you a link people can sign up on. BuildMind counts the visits and signups for you.</span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ ...muted, fontWeight: 700 }} htmlFor="pp-head">Headline on the page</label>
          <input id="pp-head" style={field} value={headline} maxLength={120} onChange={(e) => { setHeadline(e.target.value); setEdited(true); }} />
          <label style={{ ...muted, fontWeight: 700 }} htmlFor="pp-pitch">One line under it (optional)</label>
          <input id="pp-pitch" style={field} value={pitch} maxLength={300} onChange={(e) => { setPitch(e.target.value); setEdited(true); }} />
          <div style={{ ...muted, fontWeight: 700 }}>Where will you share it? One link per channel shows which one works.</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CHOICES.map((c) => {
              const on = channels.includes(c);
              return <button key={c} type="button" aria-pressed={on} style={btn(false, on)} onClick={() => setChannels(on ? channels.filter((x) => x !== c) : [...channels, c])}>{SOURCE_LABELS[c]}</button>;
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn(true)} disabled={busy || headline.trim().length < 5} onClick={create}>{busy ? "Making it..." : channels.length > 1 ? `Make ${channels.length} pages` : "Make the page"}</button>
            <button type="button" style={btn()} onClick={() => setOpen(false)}>Close</button>
          </div>
          {made.map((m) => (
            <div key={m.url} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "var(--text-sm)", color: "var(--bm-text2)" }}>
              <strong style={{ color: "var(--bm-text)" }}>{m.source ? SOURCE_LABELS[m.source] : "Link"}</strong>
              <span style={{ wordBreak: "break-all" }}>{m.url}</span>
              <button type="button" style={btn()} onClick={() => copy(m.url)}>Copy</button>
            </div>
          ))}
          {msg && <p style={muted} role="status">{msg}</p>}
          <p style={muted}>Visits and signups show under "Your links" lower on this page. Your own visits are not counted.</p>
        </div>
      )}
    </div>
  );
}
