"use client";

import { useCallback, useEffect, useState } from "react";
import { CORRECTABLE, type Fact } from "@/lib/projectFacts";

const SOURCE: Record<Fact["source"], string> = { founder: "you said", project: "your project", reflection: "your reflection", settings: "your settings", unknown: "not known" };

/** What BuildMind is working from, with a way to fix any line. Used by Coach, Today and the Work tools. */
export function FactsCard({ projectId }: { projectId?: string }) {
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/project-facts${projectId ? `?projectId=${projectId}` : ""}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setFacts(r?.ok ? (r.facts as Fact[]) : []);
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function save(key: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/project-facts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: draft, projectId }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { setError(j?.error ?? "Could not save that."); return; }
      setFacts(j.facts as Fact[]); setEditing(null); setDraft("");
    } catch { setError("Could not reach the server."); } finally { setBusy(false); }
  }

  if (!facts || facts.length === 0) return null;
  return (
    <section aria-labelledby="facts-h" className="rounded-[16px] border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-4">
      <h3 id="facts-h" className="text-[13px] font-semibold text-[var(--bm-text)]">What I am working from</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--bm-text3)]">Coach, Today and the Work tools all read this. Fix a line and they all change.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {facts.map((f) => {
          const canFix = f.key in CORRECTABLE;
          return (
            <li key={f.key} className="text-[13px] leading-snug">
              <span className="text-[var(--bm-text3)]">{f.label}: </span>
              <span className="text-[var(--bm-text)]">{f.value ?? "not known"}</span>
              <span className="text-[11px] text-[var(--bm-text3)]"> ({SOURCE[f.source]})</span>
              {canFix && editing !== f.key && (
                <button type="button" className="ml-2 min-h-[24px] text-[12px] underline" onClick={() => { setEditing(f.key); setDraft(f.source === "founder" ? f.value ?? "" : ""); setError(""); }}>{f.value ? "Fix" : "Add"}</button>
              )}
              {editing === f.key && (
                <div className="mt-1 flex flex-wrap gap-2">
                  <input aria-label={f.label} value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} className="min-h-[40px] min-w-0 flex-1 rounded-[8px] border border-[var(--bm-border)] bg-[var(--bm-bg)] px-2 text-[13px] text-[var(--bm-text)]" />
                  <button type="button" disabled={busy || !draft.trim()} onClick={() => void save(f.key)} className="min-h-[40px] rounded-[8px] px-3 text-[13px] font-semibold" style={{ background: "var(--bm-accent)", color: "#15130a" }}>{busy ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-[40px] px-2 text-[13px] underline">Cancel</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-[12px] text-[var(--bm-red)]">{error}</p>}
    </section>
  );
}
