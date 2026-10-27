"use client";
import { useCallback, useEffect, useState } from "react";
import RadarItemCard from "@/components/radar/RadarItemCard";
import { KIND_LABEL, type RadarKind } from "@/lib/radar/types";
import type { RadarView } from "@/lib/radar/store";
import { readWhere } from "@/lib/radar/place";

const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "transparent", border: "1px solid var(--bm-border2)", borderRadius: 8, color: "var(--bm-text)", fontSize: 14, fontFamily: "inherit", padding: "10px 12px", outline: "none" };
const btn: React.CSSProperties = { minHeight: 44, padding: "0 16px", borderRadius: 8, border: "1px solid var(--bm-border3)", background: "var(--bm-accent)", color: "var(--bm-text-inv)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" };

export default function RadarPage() {
  const [items, setItems] = useState<RadarView[]>([]);
  const [setup, setSetup] = useState(false);
  const [link, setLink] = useState("");
  const [text, setText] = useState("");
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [finding, setFinding] = useState(false);
  const [auto, setAuto] = useState<{ enabled: boolean; lastRunAt: string | null; lastAdded: number; paid: boolean } | null>(null);
  const [feed, setFeed] = useState<{ url: string; webcal: string } | null>(null);
  const [feedNote, setFeedNote] = useState("");
  const [ask, setAsk] = useState<{ id: string; options: RadarKind[]; why: string } | null>(null);

  useEffect(() => { setWhere(readWhere()); }, []);
  useEffect(() => {
    fetch("/api/radar/settings").then((r) => r.json()).then((b) => { if (b?.ok) setAuto({ enabled: b.auto !== false, lastRunAt: b.lastRunAt ?? null, lastAdded: b.lastAdded ?? 0, paid: b.paid === true }); }).catch(() => undefined);
  }, []);
  async function setAutoSearch(enabled: boolean) {
    setAuto((a) => ({ enabled, lastRunAt: a?.lastRunAt ?? null, lastAdded: a?.lastAdded ?? 0, paid: a?.paid ?? false }));
    try { await fetch("/api/radar/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto: enabled, where: where.trim() }) }); } catch { /* shown state may be stale until reload */ }
  }
  const load = useCallback(() => {
    const q = new URLSearchParams(where.trim() ? { where: where.trim() } : {});
    fetch(`/api/radar?${q}`).then((r) => r.json()).then((b) => { setItems(b.items ?? []); setSetup(b.reason === "setup"); }).catch(() => setItems([]));
  }, [where]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (busy) return;
    setBusy(true); setNote(""); setAsk(null);
    try {
      const body: Record<string, string> = {};
      if (link.trim()) body.url = /^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`;
      if (text.trim()) body.text = text.trim();
      const r = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.ok) { setNote(b?.error ?? "Could not add that."); return; }
      setLink(""); setText("");
      if (b.ask_kind && b.item) setAsk({ id: b.item.id, options: b.ask_kind.alternatives, why: b.ask_kind.why });
      else if (b.dropped?.length) setNote(`Added. Left out because the text did not support it: ${b.dropped.map((d: string) => d.split(":")[0]).join(", ")}. Add them by hand if you know them.`);
      load();
    } finally { setBusy(false); }
  }
  async function discover() {
    if (finding) return;
    setFinding(true); setNote("");
    try {
      const r = await fetch("/api/radar/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ where: where.trim() }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.ok) { setNote(b?.error ?? "Search failed. Try again."); return; }
      const st = b.stats ?? {};
      setNote(b.added.length
        ? `Found ${b.added.length} that fit you. Each one has a date taken from its page. Verify on the page before you rely on it.`
        : `Nothing new that fits right now. Looked at ${st.found ?? 0} pages; left out ${(st.undated ?? 0)} with no clear date, ${(st.passed ?? 0)} already passed, ${(st.lowFit ?? 0)} that did not fit you.`);
      load();
    } catch { setNote("Search failed. Try again."); } finally { setFinding(false); }
  }
  async function getFeed() {
    setFeedNote("");
    const r = await fetch("/api/radar/feed", { method: "POST" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok || !b.ok) { setFeedNote(b?.error ?? "Could not create the calendar link."); return; }
    setFeed({ url: b.url, webcal: b.webcal });
  }
  async function confirmKind(kind: RadarKind) {
    if (!ask) return;
    await fetch("/api/radar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ask.id, kind }) });
    setAsk(null); load();
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 8px 48px", display: "grid", gap: 14 }}>
      <div data-tour="radar-header">
        <h1 style={{ fontSize: "var(--text-xl)", margin: 0, color: "var(--bm-text)" }}>Radar</h1>
        <p style={{ margin: "4px 0 0", fontSize: "var(--text-base)", color: "var(--bm-text2)" }}>Paste a hackathon, grant, event, meeting or person. BuildMind works out what it is, scores it against your startup, and puts the ones worth your time on Today.</p>
      </div>
      {setup && <p role="status" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--bm-red)" }}>Radar needs the latest database migration (20261021000000_radar.sql).</p>}
      <div style={{ display: "grid", gap: 8, border: "1px solid var(--bm-border2)", borderRadius: 10, padding: 12 }}>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link to the event, call, application or profile" inputMode="url" autoCapitalize="none" style={field} aria-label="Link" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Or paste the details (dates, place, who can apply). LinkedIn blocks reading, so paste a person's bio here." style={{ ...field, resize: "vertical" }} aria-label="Details" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={discover} disabled={finding} style={{ ...btn, background: "transparent", color: "var(--bm-text)" }}>{finding ? "Searching…" : "Find opportunities for me"}</button>
          <button type="button" onClick={add} disabled={busy || (!link.trim() && text.trim().length < 6)} style={{ ...btn, opacity: busy || (!link.trim() && text.trim().length < 6) ? 0.5 : 1 }}>{busy ? "Reading…" : "Add to Radar"}</button>
          <input value={where} onChange={(e) => { setWhere(e.target.value); try { localStorage.setItem("bm_radar_where", e.target.value); } catch { /* ignore */ } }} placeholder="Where are you? (e.g. Accra)" style={{ ...field, flex: "1 1 180px", width: "auto" }} aria-label="Where are you" />
        </div>
        {auto && (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--text-sm)", color: "var(--bm-text2)", lineHeight: 1.5 }}>
            <input type="checkbox" checked={auto.paid && auto.enabled} disabled={!auto.paid} onChange={(e) => setAutoSearch(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              Search for me automatically, twice a week. New finds appear here marked "new" and you get a notification.
              {!auto.paid ? " This is part of the paid plan." : ""}
              {auto.lastRunAt ? ` Last searched ${new Date(auto.lastRunAt).toLocaleDateString()}${auto.lastAdded ? `, found ${auto.lastAdded}` : ", nothing new that fit"}.` : ""}
            </span>
          </label>
        )}
        {note && <p role="status" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--bm-text2)" }}>{note}</p>}
        {ask && (
          <div role="group" aria-label="Confirm what this is" style={{ display: "grid", gap: 6 }}>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--bm-text)" }}>{ask.why} What is it?</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[...new Set(ask.options)].map((k) => <button key={k} type="button" onClick={() => confirmKind(k)} style={{ ...btn, background: "transparent", color: "var(--bm-text)", minHeight: 36 }}>{KIND_LABEL[k]}</button>)}</div>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: 6, border: "1px solid var(--bm-border2)", borderRadius: 10, padding: 12 }}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--bm-text2)" }}>Put Radar in your calendar. Subscribe once and every date here appears in Google, Apple or Outlook calendar and stays up to date.</p>
        {feed ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <a href={feed.webcal} style={{ ...btn, background: "transparent", color: "var(--bm-text)", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Subscribe</a>
            <button type="button" style={{ ...btn, background: "transparent", color: "var(--bm-text)" }} onClick={() => { try { void navigator.clipboard.writeText(feed.url); setFeedNote("Link copied. In Google Calendar choose Other calendars, then From URL."); } catch { setFeedNote(feed.url); } }}>Copy link</button>
          </div>
        ) : <div><button type="button" style={{ ...btn, background: "transparent", color: "var(--bm-text)" }} onClick={getFeed}>Create my calendar link</button></div>}
        {feedNote && <p role="status" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--bm-text3)" }}>{feedNote}</p>}
      </div>
      {items.length === 0 && !setup ? <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--bm-text3)" }}>Nothing on your Radar yet. Paste a link above, or let it search for you. Once something is here, Radar re-checks dates and fit every time you open Today.</p> : (
        <div style={{ display: "grid", gap: 8 }}>{items.map((i) => <RadarItemCard key={i.id} item={i} onChange={load} />)}</div>
      )}
    </div>
  );
}
