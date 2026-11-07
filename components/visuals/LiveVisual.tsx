"use client";

import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { VisualBoard } from "@/components/visuals/VisualBoard";
import { OpenBesideButton } from "@/components/layout/OpenBesideButton";
import MarketCompetitors from "@/components/visuals/MarketCompetitors";
import type { CoachActionResult } from "@/lib/coachActions/types";

/**
 * A page-level drawn visual (progress or execution intelligence) for the
 * active project. Fetches the same VisualSpec the AI Coach draws, shows
 * download links, and can hand the conversation to the side pane.
 */
export function LiveVisual({ kind, projectId, title, askPrompt }: {
  kind: "progress" | "execution" | "stress" | "pmf" | "market" | "investor"; projectId: string | null | undefined; title?: string; askPrompt?: string;
}) {
  const [res, setRes] = useState<CoachActionResult | null>(null);
  const [err, setErr] = useState<{ msg: string; status?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [nonce, setNonce] = useState(0);

  async function scanNow() {
    if (!projectId || scanning) return;
    setScanning(true); setScanMsg("");
    try {
      const r = await fetch("/api/market-watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setScanMsg(j.error || "The scan did not finish.");
      else setNonce((n) => n + 1);
    } catch { setScanMsg("The scan did not finish."); }
    setScanning(false);
  }

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setLoading(true); setErr(null);
    fetch(`/api/visuals?kind=${kind}&projectId=${encodeURIComponent(projectId)}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (ok && j.result) setRes(j.result as CoachActionResult);
        else setErr({ msg: j.error || "Couldn't draw this right now.", status: j.status });
      })
      .catch(() => alive && setErr({ msg: "Couldn't draw this right now." }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [kind, projectId, nonce]);

  const prompt = askPrompt ?? (kind === "execution" ? "Draw my execution intelligence" : kind === "stress" ? "Stress-test my milestones" : kind === "pmf" ? "Show my PMF evidence" : kind === "market" ? "What changed in my market?" : kind === "investor" ? "Draw my investor snapshot" : "Chart my progress");
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--bm-text)" }}>{title ?? (kind === "execution" ? "Execution intelligence, drawn" : kind === "stress" ? "Milestone stress test" : kind === "pmf" ? "Product-market fit evidence" : kind === "market" ? "Market Watch" : kind === "investor" ? "Investor snapshot" : "Progress, drawn")}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {res?.downloads?.filter((d) => d.href.startsWith("/api/") && !/format=json/.test(d.href)).map((d) => (
            <a key={d.href} href={d.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--bm-text3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "5px 10px", textDecoration: "none" }}>
              <Download size={13} />{d.label}
            </a>
          ))}
          {kind === "market" && !err && (
            <button type="button" onClick={scanNow} disabled={scanning} style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "5px 10px", background: "transparent", cursor: scanning ? "default" : "pointer" }}>{scanning ? "Scanning…" : "Scan now"}</button>
          )}
          <OpenBesideButton label="Discuss beside" request={{ kind: "coach", title: "Coach", prompt }} />
        </div>
      </div>
      {loading && <div style={{ fontSize: 13, color: "var(--bm-text3)", padding: "20px 0" }}>Drawing from your record…</div>}
      {err && !loading && (
        <div style={{ fontSize: 13, color: "var(--bm-text3)", border: "1px dashed var(--bm-border)", borderRadius: 10, padding: 14 }}>
          {err.status === 403 ? kind === "market" ? "Market Watch is part of the Builder plan." : "The execution intelligence picture is part of the Builder plan." : err.msg}
        </div>
      )}
      {scanMsg && <div style={{ fontSize: 13, color: "var(--bm-text3)", marginBottom: 8 }}>{scanMsg}</div>}
      {kind === "market" && projectId && !(err?.status === 403) ? <MarketCompetitors projectId={projectId} /> : null}
      {res?.visual && <VisualBoard spec={res.visual} showHeader={false} />}
    </section>
  );
}
