"use client";

/**
 * "Competitors to watch" — the company websites Market Watch reads. The founder adds their own so the scan never
 * depends on the stress test having found any. Only a company's own homepage is accepted.
 */
import { useEffect, useState } from "react";

type Row = { id: string; name: string; url: string };
const muted = { fontSize: 12, color: "var(--bm-text3)" } as const;

export default function MarketCompetitors({ projectId, onChange }: { projectId: string; onChange?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [max, setMax] = useState(5);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/market-watch/competitors?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => { if (live && j?.success) { setRows(j.competitors ?? []); setMax(j.max ?? 5); } })
      .catch(() => {});
    return () => { live = false; };
  }, [projectId]);

  async function call(init: RequestInit, qs = "") {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/market-watch/competitors${qs}`, init);
      const j = await r.json().catch(() => ({}));
      if (j.success) { setRows(j.competitors ?? []); return true; }
      setMsg(j.error || "Could not save that."); return false;
    } catch { setMsg("Could not save that."); return false; } finally { setBusy(false); }
  }
  async function add() {
    if (!url.trim() || busy) return;
    const ok = await call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, url }) });
    if (ok) { setUrl(""); onChange?.(); }
  }
  async function remove(id: string) {
    const ok = await call({ method: "DELETE" }, `?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(id)}`);
    if (ok) onChange?.();
  }

  return (
    <div style={{ border: "1px solid var(--bm-border)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 4 }}>Competitors to watch</div>
      <p style={{ ...muted, margin: "0 0 10px", lineHeight: 1.5 }}>Paste a competitor&apos;s own website, not an article about them. Market Watch reads their homepage each week.</p>
      {rows.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "grid", gap: 6 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontSize: 13, color: "var(--bm-text)" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name} <span style={muted}>{r.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span></span>
              <button type="button" disabled={busy} onClick={() => remove(r.id)} aria-label={`Remove ${r.name}`} style={{ ...muted, background: "none", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {rows.length < max ? (
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label htmlFor="mw-competitor-url" className="sr-only">Competitor website</label>
          <input id="mw-competitor-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="competitor.com" inputMode="url" autoComplete="off" maxLength={200}
            style={{ flex: "1 1 200px", minWidth: 0, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text)", fontFamily: "inherit" }} />
          <button type="submit" disabled={busy || !url.trim()} style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 14px", background: "transparent", cursor: busy ? "default" : "pointer" }}>Add</button>
        </form>
      ) : <p style={{ ...muted, margin: 0 }}>You are watching {max} competitors, the most you can add.</p>}
      {msg ? <p role="alert" style={{ ...muted, margin: "8px 0 0" }}>{msg}</p> : null}
    </div>
  );
}
