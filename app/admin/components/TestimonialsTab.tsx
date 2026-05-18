"use client";
// Auto-extracted from app/admin/page.tsx (Fix #2 — page decomposition)

import React, { useState, useEffect } from "react";
import { Copy, Check, Star, EyeOff } from "lucide-react";

const C = {
  bg2: "var(--bm-bg2)", bg3: "var(--bm-bg3)",
  b:   "var(--bm-border)", b2: "var(--bm-border2)",
  t:   "var(--bm-text)", t2: "var(--bm-text2)", t3: "var(--bm-text3)",
  a:   "var(--bm-accent)", ad: "var(--bm-accent-dim)", ab: "var(--bm-accent-bd)",
  amber: "var(--bm-amber)", red: "var(--bm-red)",
  rMd: "var(--r-md)", rLg: "var(--r-lg)",
};
interface Testimonial { id: string; user_id: string | null; display_name: string; content: string; approved: boolean; created_at: string; }
const fmtDT = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export { TestimonialsTab };

function TestimonialsTab() {
  const [all, setAll] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/admin/testimonials"); const d = await r.json(); setAll(d.testimonials ?? []); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(id: string, approved: boolean) {
    await fetch("/api/admin/testimonials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, approve: !approved }) });
    setAll(prev => prev.map(t => t.id === id ? { ...t, approved_at: approved ? null : new Date().toISOString() } : t));
  }

  function copy(t: Testimonial) {
    navigator.clipboard.writeText(`"${t.quote}" — ${t.display_name}, ${t.stage} stage`).catch(() => {});
    setCopiedId(t.id); setTimeout(() => setCopiedId(null), 2000);
  }

  const filtered = all.filter(t => filter === "all" ? true : filter === "pending" ? !t.approved_at : !!t.approved_at);
  const approved = all.filter(t => !!t.approved_at).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Stat label="Total" value={all.length} />
        <Stat label="Approved" value={approved} color={C.a} />
        <Stat label="Public consent" value={all.filter(t => t.is_public).length} color={C.teal} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, background: C.bg3, padding: 4, borderRadius: C.rMd, border: `1px solid ${C.b}` }}>
          {(["all", "pending", "approved"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "6px 14px", borderRadius: "7px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "none", background: filter === f ? C.bg2 : "transparent", color: filter === f ? C.t : C.t3, boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,0.3)" : "none", transition: "all 0.15s" }}>
              {f === "all" ? `All (${all.length})` : f === "pending" ? `Pending (${all.length - approved})` : `Approved (${approved})`}
            </button>
          ))}
        </div>
        <button onClick={load} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: "transparent", color: C.t3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <RefreshCw size={11} style={{ animation: loading ? "adm-spin 0.8s linear infinite" : "none" }} /> Refresh
        </button>
      </div>

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.t3, fontSize: 13 }}>No testimonials yet. They appear here after founders submit them in-product.</div>
      )}

      {filtered.map(t => (
        <Card key={t.id} style={{ padding: "20px 22px", borderColor: t.approved_at ? C.ab : C.b }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.bg4, border: `1px solid ${C.b2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: C.t2, flexShrink: 0 }}>
                {t.display_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t }}>{t.display_name}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: C.t3 }}>{t.stage}</span>
                  <span style={{ fontSize: 11, color: C.t4 }}>·</span>
                  <span style={{ fontSize: 11, color: C.amber }}>🔥 {t.streak}d</span>
                  <span style={{ fontSize: 11, color: C.t4 }}>·</span>
                  <span style={{ fontSize: 11, color: C.t3 }}>{SRC_LABELS[t.source] ?? t.source}</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ display: "inline-flex", gap: 2 }}>
                {[1,2,3,4,5].map(s => <Star key={s} size={11} fill={s <= t.rating ? C.amber : "none"} color={s <= t.rating ? C.amber : C.t4} strokeWidth={1.5} />)}
              </span>
              {t.is_public
                ? <Badge label="consented" color={C.teal} bg="rgba(74,184,176,0.1)" border="rgba(74,184,176,0.25)" />
                : <Badge label="private" color={C.t3} bg={C.bg4} border={C.b} />
              }
            </div>
          </div>

          <blockquote style={{ margin: "0 0 16px", padding: "14px 18px", background: C.bg3, borderRadius: C.rMd, border: `1px solid ${C.b}`, borderLeft: `3px solid ${C.ab}`, fontSize: 14, color: C.t2, lineHeight: 1.65, fontStyle: "italic" }}>
            &ldquo;{t.quote}&rdquo;
          </blockquote>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: C.t4, display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={11} />{new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {t.approved_at && <span style={{ color: C.a, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={11} /> approved</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => copy(t)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: C.rMd, border: `1px solid ${C.b}`, background: C.bg3, color: C.t3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {copiedId === t.id ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
              </button>
              {t.is_public && (
                <button onClick={() => toggle(t.id, !!t.approved_at)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: C.rMd, border: `1px solid ${t.approved_at ? "rgba(224,85,85,0.3)" : C.ab}`, background: t.approved_at ? "rgba(224,85,85,0.07)" : C.ad, color: t.approved_at ? C.red : C.a, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {t.approved_at ? <><EyeOff size={11} /> Revoke</> : <><Globe size={11} /> Approve</>}
                </button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: MY VENTURES
// ═══════════════════════════════════════════════════════════════════════════════
