"use client";

/**
 * components/projects/LevelUpPanel.tsx
 *
 * Makes levelling up concrete. Sits on the project page and shows, in plain
 * words, what stands between this project and its next stage:
 *   1. Milestones for the current stage
 *   2. Proof (evidence) the founder adds right here, one guided card per slot
 *   3. Reflections (comes from daily check-ins)
 * When the checks pass, the Level up button unlocks. Founders can still level
 * up without passing (their call), behind one clear confirmation.
 *
 * Uses existing endpoints: /api/project/level-up and /api/project/stage-evidence.
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type EvType = "metric" | "artifact" | "experiment" | "founder_judgment";
type Slot = { key: string; label: string; helpText: string; acceptedTypes: EvType[] };
type Requirement = { toStage: string; framing: string; slots: Slot[] };
type Row = {
  id: string; evidence_type: EvType;
  metric_name: string | null; metric_value: string | null; artifact_description: string | null;
  artifact_url: string | null; experiment_channel: string | null; experiment_outcome: string | null;
  judgment_text: string | null;
};
type Readiness = {
  tier: "not_ready" | "checklist_only" | "ready";
  nextStage: string | null;
  stageProgress: { completedMilestones: number; totalMilestones: number; isComplete: boolean };
  evidence: { filledSlots: number; totalSlots: number; meetsBar: boolean } | null;
  reflection: { count: number; avgConfidence: number | null; meetsBar: boolean };
  headline: string;
};

const TYPE_LABEL: Record<EvType, string> = {
  metric: "A number",
  artifact: "A link or file",
  experiment: "Something I tried",
  founder_judgment: "My own call",
};

const FIELDS: Record<EvType, { key: string; label: string; placeholder: string; multiline?: boolean; optional?: boolean }[]> = {
  metric: [
    { key: "metric_name", label: "What did you measure?", placeholder: "e.g. Waitlist signups" },
    { key: "metric_value", label: "The number", placeholder: "e.g. 42" },
    { key: "metric_date", label: "Date", placeholder: "e.g. 2026-10-03", optional: true },
  ],
  artifact: [
    { key: "artifact_description", label: "What is it?", placeholder: "e.g. Notes from 5 customer calls", multiline: true },
    { key: "artifact_url", label: "Link", placeholder: "https://…", optional: true },
  ],
  experiment: [
    { key: "experiment_channel", label: "What did you try, and where?", placeholder: "e.g. Posted in 3 founder groups" },
    { key: "experiment_hypothesis", label: "What did you expect?", placeholder: "e.g. 20 signups", optional: true },
    { key: "experiment_outcome", label: "What actually happened?", placeholder: "e.g. 7 signups, 2 replies asking about price", multiline: true },
  ],
  founder_judgment: [
    { key: "judgment_text", label: "In your own words", placeholder: "Why do you believe this is true?", multiline: true },
  ],
};

function rowSummary(r: Row): string {
  switch (r.evidence_type) {
    case "metric": return `${r.metric_name ?? ""}: ${r.metric_value ?? ""}`;
    case "artifact": return r.artifact_description ?? "";
    case "experiment": return `${r.experiment_channel ?? ""} → ${r.experiment_outcome ?? ""}`;
    default: return r.judgment_text ?? "";
  }
}

function Bar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={{ height: 6, borderRadius: 4, background: "var(--bm-bg4)", overflow: "hidden" }}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }}
        style={{ height: "100%", background: color, borderRadius: 4 }} />
    </div>
  );
}

export default function LevelUpPanel({
  projectId, currentStage, onLevelUp, busy,
}: {
  projectId: string;
  currentStage: string;
  onLevelUp: (nextStage: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [req, setReq] = useState<Requirement | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filled, setFilled] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [type, setType] = useState<EvType>("metric");
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);

  const load = useCallback(async () => {
    try {
      const lu = await fetch("/api/project/level-up", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      }).then(r => r.json()).catch(() => null);
      const r: Readiness | null = lu?.readiness ?? null;
      setReadiness(r);
      const next = r?.nextStage ?? lu?.next_stage ?? null;
      if (next) {
        const ev = await fetch(
          `/api/project/stage-evidence?projectId=${projectId}&fromStage=${encodeURIComponent(currentStage)}&toStage=${encodeURIComponent(next)}`,
        ).then(x => x.json()).catch(() => null);
        if (ev?.ok) {
          setReq(ev.requirement ?? null);
          setRows(ev.rows ?? []);
          setFilled(ev.completeness?.filledSlotKeys ?? []);
        }
      }
    } catch { /* panel is optional UI; fail quiet */ }
  }, [projectId, currentStage]);

  useEffect(() => { void load(); }, [load]);

  if (!readiness || !readiness.nextStage) return null;

  const next = readiness.nextStage;
  const mp = readiness.stageProgress;
  const ev = readiness.evidence;
  const evNeed = ev ? Math.ceil(ev.totalSlots / 2) : 0;
  const ready = readiness.tier === "ready";

  function startSlot(slot: Slot) {
    setOpenSlot(slot.key);
    setType(slot.acceptedTypes[0]);
    setForm({});
    setError(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/project/stage-evidence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, fromStage: currentStage, toStage: next, evidence_type: type, ...form }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error ?? "Couldn't save. Try again.");
      setOpenSlot(null); setForm({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    await fetch(`/api/project/stage-evidence?id=${id}&projectId=${projectId}`, { method: "DELETE" }).catch(() => null);
    await load();
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 10,
    border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", color: "var(--bm-text)",
    fontSize: 14, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ background: "var(--bm-bg2)", border: `1px solid ${ready ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, borderRadius: 16, padding: "16px 16px 14px", marginBottom: 20 }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "Syne, sans-serif", fontSize: 16, fontWeight: 800, color: "var(--bm-text)" }}>
            {ready ? `You're ready for ${next}` : `Level up to ${next}`}
          </div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 3, lineHeight: 1.45 }}>
            {ready ? "Everything checks out. Level up when you're ready." : "Three things to do. Tap to see them."}
          </div>
        </div>
        <span style={{ color: "var(--bm-text3)", fontSize: 18, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</span>
      </button>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--bm-text2)", marginBottom: 5 }}>
            <span>Finish {currentStage} milestones</span><span className="bm-data">{mp.completedMilestones}/{mp.totalMilestones}</span>
          </div>
          <Bar value={mp.completedMilestones} total={mp.totalMilestones} color="var(--bm-green)" />
        </div>
        {ev && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--bm-text2)", marginBottom: 5 }}>
              <span>Add proof (at least {evNeed} of {ev.totalSlots})</span><span className="bm-data">{ev.filledSlots}/{evNeed}</span>
            </div>
            <Bar value={Math.min(ev.filledSlots, evNeed)} total={evNeed} color="var(--bm-accent)" />
          </div>
        )}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--bm-text2)", marginBottom: 5 }}>
            <span>Check in on 3 days this week, feeling confident</span><span className="bm-data">{Math.min(readiness.reflection.count, 3)}/3</span>
          </div>
          <Bar value={Math.min(readiness.reflection.count, 3)} total={3} color="var(--bm-intel, #9B87F5)" />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && req && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.55, margin: "16px 0 10px" }}>{req.framing}</p>
            <div style={{ display: "grid", gap: 8 }}>
              {req.slots.map(slot => {
                const done = filled.includes(slot.key);
                const editing = openSlot === slot.key;
                const slotRows = rows.filter(r => slot.acceptedTypes.includes(r.evidence_type));
                return (
                  <div key={slot.key} style={{ border: `1px solid ${done ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, borderRadius: 12, padding: "12px 12px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span aria-hidden style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 1, display: "grid", placeItems: "center", fontSize: 12, background: done ? "var(--bm-accent)" : "transparent", color: "#0a0a0a", border: done ? "none" : "1.5px solid var(--bm-border)" }}>{done ? "✓" : ""}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>{slot.label}</div>
                        <div style={{ fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.5, marginTop: 2 }}>{slot.helpText}</div>
                        {done && slotRows.slice(0, 2).map(r => (
                          <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8, fontSize: 12.5, color: "var(--bm-text2)", background: "var(--bm-bg3)", borderRadius: 8, padding: "7px 9px" }}>
                            <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{rowSummary(r)}</span>
                            <button onClick={() => void remove(r.id)} aria-label="Remove this proof" style={{ all: "unset", cursor: "pointer", color: "var(--bm-text3)", fontSize: 12 }}>Remove</button>
                          </div>
                        ))}
                        {!editing && (
                          <button onClick={() => startSlot(slot)}
                            style={{ marginTop: 9, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-accent)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            {done ? "Add more" : "Add proof"}
                          </button>
                        )}
                        {editing && (
                          <div style={{ marginTop: 10, display: "grid", gap: 9 }}>
                            {slot.acceptedTypes.length > 1 && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {slot.acceptedTypes.map(t => (
                                  <button key={t} onClick={() => { setType(t); setForm({}); }}
                                    style={{ padding: "6px 11px", borderRadius: 16, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${type === t ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, background: type === t ? "var(--bm-accent-dim)" : "transparent", color: type === t ? "var(--bm-accent)" : "var(--bm-text2)" }}>
                                    {TYPE_LABEL[t]}
                                  </button>
                                ))}
                              </div>
                            )}
                            {FIELDS[type].map(f => (
                              <label key={f.key} style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--bm-text3)" }}>
                                <span>{f.label}{f.optional ? " (optional)" : ""}</span>
                                {f.multiline ? (
                                  <textarea rows={3} value={form[f.key] ?? ""} placeholder={f.placeholder} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                                ) : (
                                  <input value={form[f.key] ?? ""} placeholder={f.placeholder} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} style={inputStyle} />
                                )}
                              </label>
                            ))}
                            {error && <div style={{ fontSize: 12, color: "var(--bm-red)" }}>{error}</div>}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => void save()} disabled={saving}
                                style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--bm-accent)", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: "inherit" }}>
                                {saving ? "Saving…" : "Save proof"}
                              </button>
                              <button onClick={() => setOpenSlot(null)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        <button disabled={!ready || busy} onClick={() => void onLevelUp(next)}
          style={{ padding: "12px 16px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: ready && !busy ? "pointer" : "not-allowed", background: ready ? "var(--bm-accent)" : "var(--bm-bg4)", color: ready ? "#0a0a0a" : "var(--bm-text3)" }}>
          {busy ? "Levelling up…" : `Level up to ${next}`}
        </button>
        {!ready && (
          <>
            <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>{readiness.headline}</div>
            {!confirmSkip ? (
              <button onClick={() => setConfirmSkip(true)} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--bm-text3)", textDecoration: "underline" }}>
                Level up without finishing these
              </button>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.5 }}>
                It's your call. Earlier milestones will be marked done.{" "}
                <button onClick={() => void onLevelUp(next)} style={{ all: "unset", cursor: "pointer", color: "var(--bm-accent)", fontWeight: 700 }}>Level up anyway</button>{" · "}
                <button onClick={() => setConfirmSkip(false)} style={{ all: "unset", cursor: "pointer", color: "var(--bm-text3)" }}>Not yet</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
