"use client";

import { useCallback, useState } from "react";

interface LinkRow { code: string; kind: "link" | "interest" | "confirm"; claim_kind?: string | null; pending?: number; confirmed?: boolean; label: string | null; target_url: string | null; headline: string | null; path: string; visits: number; signups: number }

const box: React.CSSProperties = { background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: "8px 10px", color: "var(--bm-text)", fontSize: 13, width: "100%" };
const btn: React.CSSProperties = { minHeight: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" };

/**
 * "Track real responses": a tracked link or a hosted signup page. BuildMind counts the visitors and
 * signups itself, so the result does not depend on what anyone types into Reflect.
 */
export default function TrackedLinks({ projectId }: { projectId?: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [mode, setMode] = useState<"link" | "interest" | "confirm">("link");
  const [url, setUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [pitch, setPitch] = useState("");
  const [claim, setClaim] = useState<"reply" | "conversation" | "call">("reply");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [emails, setEmails] = useState<{ code: string; list: Array<{ email: string; created_at: string }> } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/signal-links", { cache: "no-store" });
      const j = await r.json();
      setLinks(Array.isArray(j.links) ? j.links : []);
    } catch { setLinks([]); }
  }, []);

  async function create() {
    setBusy(true); setMsg(null);
    try {
      const body = mode === "link" ? { kind: "link", targetUrl: url, projectId } : mode === "confirm" ? { kind: "confirm", claim, projectId } : { kind: "interest", headline, pitch: pitch || undefined, projectId };
      const r = await fetch("/api/signal-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setMsg(j.error ?? "Could not create it."); }
      else {
        const full = `${window.location.origin}${j.path}`;
        try { await navigator.clipboard.writeText(full); setMsg("Created and copied. Put it in your message or post."); } catch { setMsg(`Created: ${full}`); }
        setUrl(""); setHeadline(""); setPitch("");
        await load();
      }
    } catch { setMsg("Could not reach the server."); }
    setBusy(false);
  }

  async function copy(path: string) {
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setMsg("Copied."); } catch { setMsg(`${window.location.origin}${path}`); }
  }

  async function showEmails(code: string) {
    try {
      const r = await fetch(`/api/signal-links/signups?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const j = await r.json();
      setEmails({ code, list: Array.isArray(j.signups) ? j.signups : [] });
    } catch { setEmails({ code, list: [] }); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); void load(); }} style={{ ...btn, marginTop: 10 }}>
        Track real responses
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)" }}>Track real responses</div>
        <button type="button" onClick={() => setOpen(false)} style={{ ...btn, minHeight: 28, padding: "0 8px", border: "none" }}>Close</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5, margin: "6px 0 10px" }}>
        BuildMind counts visitors and signups itself, so your accuracy rests on what really happened, not on what is typed. Your own visits and bots are ignored.
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }} role="tablist">
        {(["link", "interest", "confirm"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} style={{ ...btn, borderColor: mode === m ? "var(--bm-accent)" : "var(--bm-border2)", color: mode === m ? "var(--bm-accent)" : "var(--bm-text2)" }}>
            {m === "link" ? "Tracked link" : m === "interest" ? "Signup page" : "Ask to confirm"}
          </button>
        ))}
      </div>
      {mode === "link" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-page.com (where people should land)" aria-label="Page to send people to" inputMode="url" style={box} />
        </div>
      ) : mode === "confirm" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5, margin: 0 }}>Someone replied or talked with you? Send them this link. When they tap confirm on their own phone, it counts. Make one link per person.</p>
          <select value={claim} onChange={(e) => setClaim(e.target.value as typeof claim)} aria-label="What to confirm" style={box}>
            <option value="reply">They replied to me</option>
            <option value="conversation">We had a conversation</option>
            <option value="call">We had a call</option>
          </select>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="What are you building? One line" aria-label="Headline" maxLength={120} style={box} />
          <input value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="Optional: who it is for and why" aria-label="Short description" maxLength={300} style={box} />
        </div>
      )}
      <button type="button" disabled={busy || (mode === "link" ? url.trim().length < 8 : mode === "interest" ? headline.trim().length < 5 : false)} onClick={create} style={{ ...btn, marginTop: 10, background: "var(--bm-accent)", color: "#151109", border: "none", fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Creating..." : "Create and copy link"}
      </button>
      {msg && <div role="status" style={{ marginTop: 8, fontSize: 12, color: "var(--bm-text2)", overflowWrap: "anywhere" }}>{msg}</div>}

      {links && links.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {links.map((l) => (
            <div key={l.code} style={{ border: "1px solid var(--bm-border)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 12.5, color: "var(--bm-text)", overflowWrap: "anywhere" }}>{l.label || l.headline || l.target_url || (l.kind === "confirm" ? `Confirm: ${l.claim_kind ?? "reply"}` : "")}</div>
              <div style={{ fontSize: 11.5, color: "var(--bm-text3)", margin: "2px 0 6px" }}>
                {l.kind === "link" ? `${l.visits} unique visitor${l.visits === 1 ? "" : "s"}` : l.kind === "confirm" ? (l.confirmed ? "Confirmed by them" : "Waiting for them to confirm") : `${l.signups} confirmed signup${l.signups === 1 ? "" : "s"}${l.pending ? ` · ${l.pending} waiting to confirm` : ""} · ${l.visits} visitor${l.visits === 1 ? "" : "s"}`}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" style={btn} onClick={() => copy(l.path)}>Copy link</button>
                {l.kind === "interest" && l.signups > 0 && <button type="button" style={btn} onClick={() => showEmails(l.code)}>See emails</button>}
              </div>
              {emails?.code === l.code && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 12, color: "var(--bm-text2)", overflowWrap: "anywhere" }}>
                  {emails.list.map((e) => <li key={e.email}>{e.email}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
