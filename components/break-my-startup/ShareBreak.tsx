"use client";
import React, { useState } from "react";
import { Share2, Link2, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BreakResult } from "./viewTypes";

/** Creates a public link (sanitised summary only) and offers copy / image / native share. */
export function ShareBreak({ result, idea }: { result: BreakResult; idea: string }) {
  const [state, setState] = useState<{ url: string; imageUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/break/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result, idea }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not create link");
      setState({ url: j.url, imageUrl: j.imageUrl });
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
      <Button variant="secondary" size="sm" onClick={create} loading={busy}><Share2 size={13} />Share result</Button>
      {err && <span style={{ fontSize: 12, color: "var(--bm-red)" }}>{err}</span>}
    </>);
  }
  return (<>
    <Button variant="secondary" size="sm" onClick={copy}>{copied ? <><Check size={13} />Copied</> : <><Link2 size={13} />Copy link</>}</Button>
    <a href={`${state.imageUrl}&download=1`} style={{ textDecoration: "none" }}><Button variant="ghost" size="sm"><Download size={13} />Image</Button></a>
  </>);
}
