"use client";

import { useCallback, useState } from "react";
import { channelSummary, SOURCES, SOURCE_LABELS, type LinkSource } from "@/lib/linkNudge";

type Kind = "link" | "interest" | "confirm" | "inbound";

interface LinkRow {
  code: string; kind: Kind; source?: LinkSource | null; address?: string | null; replies?: number; claim_kind?: string | null;
  pending?: number; confirmed?: boolean; label: string | null; target_url: string | null; headline: string | null; path: string; visits: number; signups: number;
}

/** What each way of counting is for, in plain words. Order = most common first. */
const WAYS: Array<{ kind: Kind; title: string; when: string; counts: string }> = [
  { kind: "link", title: "A link that counts visitors", when: "You are posting or messaging people and want to know how many really opened it.", counts: "Each person who opens it, once." },
  { kind: "interest", title: "A page that collects interest", when: "You have no website yet. BuildMind makes a simple page where people leave their email.", counts: "People who confirmed their email." },
  { kind: "confirm", title: "Ask someone to confirm", when: "Someone replied or talked to you privately (WhatsApp, a DM, a call). Send them this link and they tap yes.", counts: "Each person who taps yes." },
  { kind: "inbound", title: "An email address for replies", when: "You are sending emails. Use this as the Reply-To, so replies are counted and forwarded to you.", counts: "Each different person who replies." },
];

const card: React.CSSProperties = { background: "var(--bm-bg2)", borderRadius: 14, padding: "clamp(18px, 4vw, 28px)" };
const box: React.CSSProperties = { background: "var(--bm-bg3)", border: "none", borderRadius: 10, padding: "12px 14px", color: "var(--bm-text)", fontSize: 15, width: "100%", minHeight: 46, fontFamily: "inherit" };
const btn: React.CSSProperties = { minHeight: 42, padding: "0 16px", borderRadius: 10, border: "none", background: "var(--bm-bg3)", color: "var(--bm-text2)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const label: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 600, color: "var(--bm-text)", marginBottom: 10 };
const hint: React.CSSProperties = { fontSize: 13.5, color: "var(--bm-text3)", lineHeight: 1.6, margin: "10px 0 0" };

function resultLine(l: LinkRow): string {
  if (l.kind === "link") return `${l.visits} ${l.visits === 1 ? "person has" : "people have"} opened it`;
  if (l.kind === "confirm") return l.confirmed ? "Confirmed by them" : "Waiting for them to tap yes";
  if (l.kind === "inbound") return `${l.replies ?? 0} ${l.replies === 1 ? "person has" : "people have"} replied`;
  return `${l.signups} confirmed signup${l.signups === 1 ? "" : "s"}${l.pending ? `, ${l.pending} waiting to confirm their email` : ""}`;
}
const KIND_NAME: Record<Kind, string> = { link: "Visitor link", interest: "Interest page", confirm: "Confirmation link", inbound: "Reply address" };

/**
 * "Show real results": the founder puts a BuildMind link in a post or message, and BuildMind counts what
 * really happens, so the outcome does not depend on what anyone types into Reflect.
 */
export default function TrackedLinks({ projectId, suggestedSource, nudge }: { projectId?: string; suggestedSource?: LinkSource | null; nudge?: boolean }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [mode, setMode] = useState<Kind>("link");
  const [sources, setSources] = useState<LinkSource[]>(suggestedSource ? [suggestedSource] : []);
  const [claim, setClaim] = useState<"reply" | "conversation" | "call">("reply");
  const [url, setUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [pitch, setPitch] = useState("");
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
      // One link per chosen channel, so each channel's result is counted separately.
      const chosen: Array<LinkSource | undefined> = mode === "confirm" || sources.length === 0 ? [sources[0]] : sources;
      let firstShare = "";
      let failed: string | null = null;
      for (const source of chosen) {
        const base = mode === "link" ? { kind: "link", targetUrl: url } : mode === "confirm" ? { kind: "confirm", claim } : mode === "inbound" ? { kind: "inbound" } : { kind: "interest", headline, pitch: pitch || undefined };
        const r = await fetch("/api/signal-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base, source, projectId }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { failed = j.error ?? "Could not create it."; break; }
        if (!firstShare) firstShare = j.address ?? `${window.location.origin}${j.path}`;
      }
      if (failed) setMsg(failed);
      else {
        try { await navigator.clipboard.writeText(firstShare); setMsg(chosen.length > 1 ? `Made ${chosen.length} links and copied the first one. Copy the others from "Your links" below.` : "Made and copied. Paste it into your message or post, then come back after people respond."); } catch { setMsg(`Made: ${firstShare}`); }
        setUrl(""); setHeadline(""); setPitch("");
        await load();
      }
    } catch { setMsg("Could not reach the server. Try again."); }
    setBusy(false);
  }

  async function copy(path: string, address?: string | null) {
    const text = address ?? `${window.location.origin}${path}`;
    try { await navigator.clipboard.writeText(text); setMsg("Copied."); } catch { setMsg(text); }
  }

  async function showEmails(code: string) {
    try {
      const r = await fetch(`/api/signal-links/signups?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const j = await r.json();
      setEmails({ code, list: Array.isArray(j.signups) ? j.signups : [] });
    } catch { setEmails({ code, list: [] }); }
  }

  const channels = channelSummary(links ?? []);
  const way = WAYS.find((w) => w.kind === mode)!;
  const canCreate = mode === "link" ? url.trim().length >= 8 : mode === "interest" ? headline.trim().length >= 5 : true;

  if (!open) {
    return (
      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>{nudge ? "This task is about reaching people. Count what really happens." : "Count real responses instead of typing them"}</div>
        <p style={{ ...hint, marginTop: 6, fontSize: 13.5 }}>
          Put a BuildMind link in your message or post. BuildMind counts who actually opens it, signs up or replies, and fills in the result for you. Real numbers make your accuracy score trustworthy.
        </p>
        <button type="button" onClick={() => { setOpen(true); if (suggestedSource && sources.length === 0) setSources([suggestedSource]); void load(); }} style={{ ...btn, marginTop: 12, background: "var(--bm-accent)", color: "#151109", border: "none", fontWeight: 700 }}>
          {nudge ? "Make a link for this task" : "Set up a link"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...card, marginTop: 18, display: "grid", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>Count real responses</div>
          <p style={{ ...hint, fontSize: 13.5 }}>Instead of typing what happened, let BuildMind count it. Here is how:</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} style={{ ...btn, minHeight: 36, padding: "0 10px", border: "none" }}>Close</button>
      </div>

      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.55 }}>
        <li><strong style={{ color: "var(--bm-text)" }}>Choose</strong> what you want to count.</li>
        <li><strong style={{ color: "var(--bm-text)" }}>Copy</strong> the link or address and put it in your message or post.</li>
        <li><strong style={{ color: "var(--bm-text)" }}>Come back</strong> later and write your reflection. BuildMind fills in the real numbers.</li>
      </ol>

      <section aria-label="Choose what to count">
        <div style={label}>1. What do you want to count?</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))" }} role="radiogroup">
          {WAYS.map((w) => {
            const on = mode === w.kind;
            return (
              <button key={w.kind} type="button" role="radio" aria-checked={on} onClick={() => setMode(w.kind)}
                style={{ textAlign: "left", padding: 18, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", border: "none", background: on ? "var(--bm-accent-dim)" : "var(--bm-bg3)", color: "var(--bm-text)", display: "grid", gap: 8, boxShadow: on ? "inset 3px 0 0 var(--bm-accent)" : "none" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{w.title}</span>
                <span style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>{w.when}</span>
                <span style={{ fontSize: 12.5, color: "var(--bm-text3)" }}>Counts: {w.counts}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Details" style={{ display: "grid", gap: 22 }}>
        <div style={label}>2. {way.title}</div>
        {mode === "link" && (
          <div>
            <label htmlFor="tl-url" style={label}>Where should people end up?</label>
            <input id="tl-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-page.com" inputMode="url" autoCapitalize="none" style={box} />
            <p style={hint}>Paste the page you want people to see. BuildMind gives you a short link that forwards there and counts each person once. Your own visits and automatic link previews are not counted.</p>
          </div>
        )}
        {mode === "interest" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label htmlFor="tl-head" style={label}>What are you building? One line</label>
              <input id="tl-head" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. A way for Ghanaian farmers to sell directly to restaurants" maxLength={120} style={box} />
            </div>
            <div>
              <label htmlFor="tl-pitch" style={label}>Who is it for, and why? (optional)</label>
              <input id="tl-pitch" value={pitch} onChange={(e) => setPitch(e.target.value)} maxLength={300} style={box} />
              <p style={hint}>People type their email, then get a message to confirm it. Only confirmed emails are counted, so made-up addresses do not inflate your number.</p>
            </div>
          </div>
        )}
        {mode === "confirm" && (
          <div>
            <label htmlFor="tl-claim" style={label}>What do you want them to confirm?</label>
            <select id="tl-claim" value={claim} onChange={(e) => setClaim(e.target.value as typeof claim)} style={box}>
              <option value="reply">They replied to me</option>
              <option value="conversation">We had a conversation</option>
              <option value="call">We had a call</option>
            </select>
            <p style={hint}>Make one link per person. You send it to them, they open it on their own phone and tap yes. You cannot confirm your own link.</p>
          </div>
        )}
        {mode === "inbound" && (
          <p style={{ ...hint, marginTop: 0, fontSize: 13.5 }}>
            BuildMind makes an email address just for your outreach. Put it in the Reply-To field of your emails. When someone replies, BuildMind counts them and forwards you a copy so you can answer. Your own emails and automatic replies are ignored.
          </p>
        )}

        <div>
          <div style={label}>{mode === "confirm" ? "Where did it happen? (optional)" : "Where will you share it?"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SOURCES.map((src) => {
              const on = sources.includes(src);
              return (
                <button key={src} type="button" aria-pressed={on} onClick={() => setSources(mode === "confirm" ? (on ? [] : [src]) : on ? sources.filter((x) => x !== src) : [...sources, src])}
                  style={{ ...btn, color: on ? "var(--bm-accent)" : "var(--bm-text2)", background: on ? "var(--bm-accent-dim)" : "var(--bm-bg3)", fontWeight: on ? 700 : 400 }}>
                  {SOURCE_LABELS[src]}
                </button>
              );
            })}
          </div>
          <p style={hint}>{mode === "confirm" ? "Helps you see which channel your replies come from." : "Pick every place you will post. You get one link for each, so you can see which place brings real people."}</p>
        </div>

        <div>
          <button type="button" disabled={busy || !canCreate} onClick={create}
            style={{ ...btn, background: "var(--bm-accent)", color: "#151109", border: "none", fontWeight: 700, opacity: busy || !canCreate ? 0.55 : 1 }}>
            {busy ? "Making it..." : mode === "inbound" ? "Make my reply address" : sources.length > 1 ? `Make ${sources.length} links and copy` : "Make it and copy"}
          </button>
          {msg && <p role="status" style={{ ...hint, color: "var(--bm-text2)", overflowWrap: "anywhere" }}>{msg}</p>}
        </div>
      </section>

      {channels.length > 1 && (
        <section aria-label="Results by channel">
          <div style={label}>Which channel is working</div>
          <div style={{ display: "grid", gap: 4 }}>
            {channels.map((c) => (
              <div key={c.source} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, color: "var(--bm-text2)", padding: "10px 14px", background: "var(--bm-bg3)", borderRadius: 10 }}>
                <span style={{ color: "var(--bm-text)", fontWeight: 600 }}>{c.source === "untagged" ? "No channel chosen" : SOURCE_LABELS[c.source]}</span>
                <span style={{ textAlign: "right" }}>
                  {c.visits} opened · {c.signups} signed up{c.confirmations ? ` · ${c.confirmations} confirmed` : ""}{c.replies ? ` · ${c.replies} replied` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Your links">
        <div style={label}>Your links</div>
        {!links && <p style={hint}>Loading...</p>}
        {links && links.length === 0 && <p style={hint}>Nothing yet. Make your first one above.</p>}
        {links && links.length > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {links.map((l) => (
              <div key={l.code} style={{ background: "var(--bm-bg3)", borderRadius: 12, padding: 18, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--bm-accent)" }}>{KIND_NAME[l.kind]}{l.source ? ` · ${SOURCE_LABELS[l.source]}` : ""}</span>
                </div>
                <div style={{ fontSize: 14, color: "var(--bm-text)", overflowWrap: "anywhere", lineHeight: 1.45 }}>
                  {l.label || l.headline || l.target_url || (l.kind === "confirm" ? `Confirm: ${l.claim_kind ?? "reply"}` : l.address ?? "Reply address (not switched on for this server yet)")}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--bm-text2)" }}>{resultLine(l)}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(l.kind !== "inbound" || l.address) && <button type="button" style={{ ...btn, background: "var(--bm-bg2)" }} onClick={() => copy(l.path, l.address)}>{l.kind === "inbound" ? "Copy address" : "Copy link"}</button>}
                  {l.kind === "interest" && l.signups > 0 && <button type="button" style={{ ...btn, background: "var(--bm-bg2)" }} onClick={() => showEmails(l.code)}>See the emails</button>}
                </div>
                {emails?.code === l.code && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--bm-text2)", overflowWrap: "anywhere", lineHeight: 1.6 }}>
                    {emails.list.map((e) => <li key={e.email}>{e.email}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
