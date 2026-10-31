"use client";
import React, { useEffect, useState } from "react";
import { Share2, Link2, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BreakResult } from "./viewTypes";

type Stats = { opened: number; yes: number; partly: number; no: number; notes: Array<{ answer: string; note: string }> };

/** The link is remembered per result on this device, so reopening the page shows who has opened it. */
function memoKey(result: BreakResult, idea: string): string {
  const text = `${idea}|${result.summary}|${result.survival_probability ?? ""}`;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return `bm_break_share_${h}`;
}

function statsLine(s: Stats): string {
  if (s.opened === 0) return "Nobody has opened it yet";
  const answered = s.yes + s.partly + s.no;
  const parts = [`${s.opened} opened`];
  if (answered > 0) parts.push(`${s.yes} yes, ${s.partly} partly, ${s.no} no`);
  return parts.join(" · ");
}

/** Creates a public link to the full report (not the plan or style) and offers copy / image / native share. */
export function ShareBreak({ result, idea }: { result: BreakResult; idea: string }) {
  const [state, setState] = useState<{ url: string; imageUrl: string; token: string } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadStats(token: string) {
    try {
      const r = await fetch(`/api/break/share?token=${token}`, { cache: "no-store" });
      if (r.ok) setStats(await r.json());
      else if (r.status === 404) { try { localStorage.removeItem(memoKey(result, idea)); } catch { /* ignore */ } setState(null); }
    } catch { /* counts are optional */ }
  }

  useEffect(() => {
    let token: string | null = null;
    try { token = localStorage.getItem(memoKey(result, idea)); } catch { /* storage unavailable */ }
    if (!token) return;
    const base = window.location.origin;
    setState({ token, url: `${base}/break/share/${token}`, imageUrl: `${base}/api/card/break?token=${token}` });
    void loadStats(token);
  }, [result, idea]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/break/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result, idea }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not create link");
      setState({ url: j.url, imageUrl: j.imageUrl, token: j.token });
      setStats({ opened: 0, yes: 0, partly: 0, no: 0, notes: [] });
      try { localStorage.setItem(memoKey(result, idea), j.token); } catch { /* ignore */ }
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share) { try { await nav.share({ title: "Break My Startup", url: j.url }); } catch { /* user cancelled */ } }
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not create link"); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!state) return;
    try { await navigator.clipboard.writeText(state.url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }

  if (!state) {
    return (<>
      <Button variant="secondary" size="sm" onClick={create} loading={busy}><Share2 size={13} />Share full report</Button>
      {err && <span style={{ fontSize: 12, color: "var(--bm-red)" }}>{err}</span>}
    </>);
  }
  return (<>
    <Button variant="secondary" size="sm" onClick={copy}>{copied ? <><Check size={13} />Copied</> : <><Link2 size={13} />Copy link</>}</Button>
    <a href={`${state.imageUrl}&download=1`} style={{ textDecoration: "none" }}><Button variant="ghost" size="sm"><Download size={13} />Image</Button></a>
    {stats && (
      <button type="button" onClick={() => void loadStats(state.token)} title="Refresh" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontSize: 12, color: "var(--bm-text3)", fontFamily: "inherit" }}>
        {statsLine(stats)}
      </button>
    )}
  </>);
}
