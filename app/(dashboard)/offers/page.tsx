"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/card";
import { CTA_LABEL, publishProblems, type CtaKind, type OfferContent } from "@/lib/offers/page";

interface Page { id: string; slug: string; status: "draft" | "published"; content: OfferContent; views: number; clicks: number }
interface Quote { personId: string; index: number; name: string; quote: string; point: string }

const field: React.CSSProperties = { width: "100%", minHeight: 44, borderRadius: 8, border: "1px solid var(--bm-border)", background: "var(--bm-bg)", color: "var(--bm-text)", padding: "8px 10px", fontSize: 14 };
const btn: React.CSSProperties = { minHeight: 44, borderRadius: 8, border: "1px solid var(--bm-border)", background: "var(--bm-bg)", color: "var(--bm-text)", padding: "0 14px", fontSize: 14, cursor: "pointer" };
const call = (url: string, method: string, body?: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));

export default function OffersPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [o, c] = await Promise.all([call("/api/offers", "GET"), call("/api/conversations", "GET")]);
    setPages(o.pages ?? []); setSetup(Boolean(o.setup));
    const people = (c.people ?? []) as Array<{ id: string; name: string; insights: Array<{ point: string; quote: string; approved?: boolean }> | null }>;
    setQuotes(people.flatMap((p) => (p.insights ?? []).flatMap((i, index) => (i.approved ? [{ personId: p.id, index, name: p.name, quote: i.quote, point: i.point }] : []))));
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function draft(q: Quote) {
    setBusy(`${q.personId}:${q.index}`); setErr("");
    const r = await call("/api/offers", "POST", { personId: q.personId, index: q.index });
    setBusy("");
    if (!r.ok) setErr(r.error ?? "Could not draft."); else await load();
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <PageHeader title="Offer pages" subtitle="One page built from something a customer really said. You edit it, you publish it, you share the link." />
      {setup && <Card><p style={{ margin: 0, fontSize: 14 }}>Offer pages are not set up yet. The database change that creates them has not been applied.</p></Card>}
      {err && <p role="alert" style={{ margin: 0, color: "var(--bm-amber)", fontSize: 14 }}>{err}</p>}

      <Card>
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Quotes you approved</h2>
        {quotes.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--bm-text2)" }}>None yet. Add notes after a conversation, pull out what matters, and press “Use this quote” on one. <Link href="/customers">Go to your conversations</Link></p>
        ) : quotes.map((q) => (
          <div key={`${q.personId}:${q.index}`} style={{ display: "grid", gap: 6, padding: "8px 0", borderTop: "1px solid var(--bm-border)" }}>
            <span style={{ fontSize: 14 }}>“{q.quote}”</span>
            <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>From your conversation with {q.name}. Their name is not shown on the page.</span>
            <div><button type="button" style={btn} disabled={!!busy} onClick={() => void draft(q)}>{busy === `${q.personId}:${q.index}` ? "Drafting…" : "Draft an offer page"}</button></div>
          </div>
        ))}
      </Card>

      {pages.map((p) => <Editor key={p.id + p.content.headline.length} page={p} onChanged={load} />)}
    </div>
  );
}

function Editor({ page, onChanged }: { page: Page; onChanged: () => Promise<void> }) {
  const [c, setC] = useState<OfferContent>(page.content);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const problems = publishProblems(c);
  const link = typeof window !== "undefined" ? `${window.location.origin}/o/${page.slug}` : `/o/${page.slug}`;
  const set = <K extends keyof OfferContent>(k: K, v: OfferContent[K]) => setC((x) => ({ ...x, [k]: v }));

  async function save(action?: "publish" | "unpublish") {
    setBusy(true); setMsg("");
    const r = await call(`/api/offers/${page.id}`, "PATCH", { content: c, action });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? "Could not save."); return; }
    setMsg(action === "publish" ? "Published. Anyone with the link can open it." : action === "unpublish" ? "Taken down. The link no longer works." : "Saved.");
    await onChanged();
  }
  async function remove() { if (confirm("Delete this page? The link stops working.")) { await call(`/api/offers/${page.id}`, "DELETE"); await onChanged(); } }
  async function copy() { try { await navigator.clipboard.writeText(link); setMsg("Link copied."); } catch { setMsg("Could not copy. Select the link and copy it by hand."); } }

  return (
    <Card>
      <div style={{ display: "grid", gap: 10 }}>
        <strong style={{ fontSize: 15 }}>{page.status === "published" ? "Published" : "Draft, not visible to anyone yet"}</strong>
        <label style={{ fontSize: 13 }}>Headline<input style={field} value={c.headline} onChange={(e) => set("headline", e.target.value)} maxLength={90} /></label>
        <label style={{ fontSize: 13 }}>One line under it<input style={field} value={c.subhead} onChange={(e) => set("subhead", e.target.value)} maxLength={160} /></label>
        <label style={{ fontSize: 13 }}>What you are offering<textarea style={{ ...field, minHeight: 90 }} value={c.offer} onChange={(e) => set("offer", e.target.value)} maxLength={400} /></label>
        <label style={{ fontSize: 13 }}>Who it is for<input style={field} value={c.who_for} onChange={(e) => set("who_for", e.target.value)} maxLength={120} /></label>
        <p style={{ margin: 0, fontSize: 13, color: "var(--bm-text2)" }}>The customer’s words, shown as written and without their name: “{c.quote}”</p>
        <label style={{ fontSize: 13 }}>Button
          <select style={field} value={c.cta_kind} onChange={(e) => set("cta_kind", e.target.value as CtaKind)}>
            {(Object.keys(CTA_LABEL) as CtaKind[]).map((k) => <option key={k} value={k}>{CTA_LABEL[k]}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>Where the button sends people (your email or an https link)<input style={field} value={c.contact} onChange={(e) => set("contact", e.target.value)} placeholder="you@example.com" /></label>
        {problems.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--bm-amber)" }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={btn} disabled={busy} onClick={() => void save()}>Save</button>
          {page.status === "draft"
            ? <button type="button" style={btn} disabled={busy || problems.length > 0} onClick={() => void save("publish")}>Publish</button>
            : <button type="button" style={btn} disabled={busy} onClick={() => void save("unpublish")}>Take down</button>}
          {page.status === "published" && <button type="button" style={btn} onClick={() => void copy()}>Copy link</button>}
          <button type="button" style={btn} disabled={busy} onClick={() => void remove()}>Delete</button>
        </div>
        {page.status === "published" && <p style={{ margin: 0, fontSize: 13, color: "var(--bm-text2)" }}>{link}<br />Opened {page.views} times, button pressed {page.clicks} times. Counts include your own visits and any automated ones. A press is not a sale: record real replies in your conversations.</p>}
        {msg && <p role="status" style={{ margin: 0, fontSize: 13 }}>{msg}</p>}
      </div>
    </Card>
  );
}
