"use client";

/**
 * /admin/distribution — Distribution Intelligence Studio (private, admin only).
 * Writing Lab · Conversations · Experiments, with an action-first overview.
 * Nothing here publishes or sends anything. Missing data is shown as missing.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { adminCss, C } from "@/app/admin/components/ui";
import { buildOverview, type Conversation, type Draft } from "@/lib/distribution/overview";
import type { Experiment } from "@/lib/distribution/experiments";
import { api } from "./shared";
import { OverviewView } from "./views/Overview";
import { WritingLab } from "./views/WritingLab";
import { Conversations } from "./views/Conversations";
import { Experiments } from "./views/Experiments";

const VIEWS = [["overview", "Overview"], ["writing", "Writing Lab"], ["conversations", "Conversations"], ["experiments", "Experiments"]] as const;
type View = (typeof VIEWS)[number][0];

interface All { drafts: Draft[]; conversations: Conversation[]; experiments: Experiment[] }

export default function DistributionPage() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<All | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<All>("all");
    if (!r.ok) return setErr(r.error ?? "Could not load");
    setErr(""); setData({ drafts: r.drafts, conversations: r.conversations, experiments: r.experiments });
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const h = window.location.hash.slice(1) as View; if (VIEWS.some(([v]) => v === h)) setView(h); }, []);
  const go = (v: string) => { const x = (VIEWS.some(([k]) => k === v) ? v : "overview") as View; setView(x); try { window.location.hash = x; } catch {} };

  const overview = useMemo(() => (data ? buildOverview(data) : null), [data]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.t, fontFamily: "Geist, system-ui, sans-serif" }}>
      <header style={{ borderBottom: `1px solid ${C.b}`, background: C.bg2 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 16px 0" }}>
          <Link href="/admin/promoters" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.t3, textDecoration: "none" }}><ArrowLeft size={12} /> Promoters</Link>
          <h1 style={{ margin: "6px 0 2px", fontSize: 18, fontWeight: 700 }}>Distribution Intelligence</h1>
          <div style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>Private workspace · BuildMind Promoter. Drafts and recommends. Never posts or sends for you.</div>
          <nav style={{ display: "flex", gap: 2, overflowX: "auto" }} aria-label="Distribution views">
            {VIEWS.map(([v, l]) => (
              <button key={v} onClick={() => go(v)} aria-current={view === v ? "page" : undefined} style={{ padding: "9px 14px", border: 0, background: "none", fontFamily: "inherit", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", color: view === v ? C.t : C.t3, fontWeight: view === v ? 600 : 400, borderBottom: `2px solid ${view === v ? C.a : "transparent"}` }}>{l}</button>
            ))}
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 16px 80px" }}>
        {err && <div style={{ padding: "10px 12px", border: `1px solid ${C.red}`, borderRadius: C.rMd, color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
        {!data && !err && <div style={{ fontSize: 13, color: C.t3 }}>Loading…</div>}
        {data && overview && (
          <>
            {view === "overview" && <OverviewView o={overview} go={go} />}
            {view === "writing" && <WritingLab drafts={data.drafts as never} reload={load} onLogged={load} />}
            {view === "conversations" && <Conversations items={data.conversations} reload={load} />}
            {view === "experiments" && <Experiments items={data.experiments} reload={load} />}
          </>
        )}
      </main>
      <style>{adminCss}</style>
    </div>
  );
}
