"use client";
import React from "react";
import { getActiveProjectId } from "@/lib/api";

type Pin = { predictionId: string; testId: string; title: string };
const CHOICES = [["supported", "Held up"], ["refuted", "Proved wrong"], ["inconclusive", "Could not tell"]] as const;

/**
 * When today's task came from a Break My Startup test the founder pinned, ask whether the assumption held.
 * The answer is saved on that test, so the test stops steering Today and the next one can take its place.
 */
export default function ResolveTest({ projectId }: { projectId: string | null }) {
  const [pin, setPin] = React.useState<Pin | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const pid = projectId ?? getActiveProjectId();

  React.useEffect(() => {
    let live = true;
    setSaved(null);
    fetch(`/api/today/pinned${pid ? `?project=${pid}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setPin(j?.pin ?? null); })
      .catch(() => {});
    return () => { live = false; };
  }, [pid]);

  async function record(status: string, label: string) {
    if (!pin || busy) return;
    setBusy(true); setFailed(false);
    try {
      const r = await fetch("/api/break-predictions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ predictionId: pin.predictionId, testId: pin.testId, status }) });
      const j = await r.json().catch(() => null);
      // Today's task stays as it is; the next day's action skips a test that is no longer open.
      if (r.ok && j?.success) setSaved(label); else setFailed(true);
    } catch { setFailed(true); } finally { setBusy(false); }
  }

  if (!pin) return null;
  return (
    <div style={{ border: "1px solid var(--bm-border2)", borderRadius: 12, padding: "12px 14px", margin: "4px 0 14px", background: "var(--bm-bg2)" }}>
      <div style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 4 }}>From your Break My Startup test</div>
      <div style={{ fontSize: 13, color: "var(--bm-text)", lineHeight: 1.45, marginBottom: 8 }}>{pin.title}</div>
      {saved ? (
        <div style={{ fontSize: 12, color: "var(--bm-text2)" }}>Saved as “{saved}”. It will shape your next action.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--bm-text2)", marginBottom: 8 }}>Did this assumption hold? Skip it if you did not get to test it.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CHOICES.map(([k, l]) => (
              <button key={k} type="button" disabled={busy} onClick={() => record(k, l)}
                style={{ border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", borderRadius: 99, padding: "6px 14px", fontSize: 12, cursor: busy ? "wait" : "pointer", minHeight: 36 }}>{l}</button>
            ))}
          </div>
          {failed && <div style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 6 }}>Could not save that. Try again.</div>}
        </>
      )}
    </div>
  );
}
