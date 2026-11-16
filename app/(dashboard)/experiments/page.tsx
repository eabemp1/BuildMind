"use client";

import { useCallback, useEffect, useState } from "react";
import { getActiveProjectId } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { rollingPlan } from "@/lib/experimentPlan";
import {
  DECISIONS, DECISION_LABEL, STATE_LABEL, nextMove, receipts, tally,
  type Decision, type EventKind, type Experiment,
} from "@/lib/experiments";

const field: React.CSSProperties = { width: "100%", minHeight: 44, borderRadius: 8, border: "1px solid var(--bm-border)", background: "var(--bm-bg)", color: "var(--bm-text)", padding: "8px 10px", fontSize: 14 };
const KIND_CHOICES: Array<{ k: EventKind; label: string }> = [
  { k: "prepared", label: "Prepared, not sent" }, { k: "sent", label: "I sent it" }, { k: "replied", label: "They replied" },
  { k: "no_reply", label: "No reply yet" }, { k: "blocked", label: "Blocked" },
  { k: "would_pay", label: "They said they would pay" }, { k: "paid", label: "They paid" },
];

export default function ExperimentsPage() {
  const [list, setList] = useState<Experiment[] | null>(null);
  const [setup, setSetup] = useState(false);
  const [err, setErr] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>();
  const [goal, setGoal] = useState(""); const [hyp, setHyp] = useState(""); const [aud, setAud] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (pid?: string) => {
    const r = await fetch(`/api/experiments${pid ? `?projectId=${pid}` : ""}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setErr(r?.error ?? "Could not load experiments."); setList([]); return; }
    setSetup(Boolean(r.setup)); setList(r.experiments as Experiment[]);
  }, []);
  useEffect(() => { const pid = getActiveProjectId() ?? undefined; setProjectId(pid); void load(pid); }, [load]);

  async function create() {
    if (busy) return; setBusy(true); setErr("");
    try {
      const r = await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, hypothesis: hyp, audience: aud, projectId }) }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Could not start that."); if (r.setup) setSetup(true); return; }
      setGoal(""); setHyp(""); setAud(""); await load(projectId);
    } catch { setErr("Could not reach the server."); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title="Experiments" subtitle="One question you are testing with real people, and what actually happened. Only what you confirm is counted." />
      {err && <p role="alert" className="text-[13px] text-[var(--bm-red)]">{err}</p>}
      {setup && <Card className="p-4 text-[13px]">Experiments need one database step before they can save. Run <code>20261116000000_customer_experiments.sql</code> in Supabase, then reload.</Card>}

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-[15px] font-semibold">Start an experiment</h2>
        <label className="flex flex-col gap-1 text-[13px]">What do you want to find out?
          <input style={field} value={goal} maxLength={200} onChange={(e) => setGoal(e.target.value)} placeholder="Do independent repair shops care about missed bookings?" />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">What do you expect? (optional)
          <input style={field} value={hyp} maxLength={300} onChange={(e) => setHyp(e.target.value)} placeholder="Some owners will talk about it when asked." />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">Who will you ask? (optional)
          <input style={field} value={aud} maxLength={200} onChange={(e) => setAud(e.target.value)} placeholder="Five bike shops in Kumasi" />
        </label>
        <Button onClick={() => void create()} disabled={busy || goal.trim().length < 8} style={{ minHeight: 44 }}>{busy ? "Starting…" : "Start experiment"}</Button>
      </Card>

      {list === null && <p className="text-[13px] text-[var(--bm-text3)]">Loading…</p>}
      {list?.length === 0 && !setup && <p className="text-[13px] text-[var(--bm-text3)]">No experiments yet. Start one above.</p>}
      {list?.map((e) => <ExperimentCard key={e.id} exp={e} onChange={() => load(projectId)} />)}
    </div>
  );
}

function ExperimentCard({ exp, onChange }: { exp: Experiment; onChange: () => void }) {
  const evs = exp.events ?? [];
  const t = tally(evs); const move = nextMove(t); const rows = receipts(evs); const plan = rollingPlan(exp);
  const [who, setWho] = useState(""); const [kind, setKind] = useState<EventKind>("sent"); const [detail, setDetail] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function add() {
    if (busy) return; setBusy(true); setErr("");
    try {
      const r = await fetch("/api/experiments/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experimentId: exp.id, who, kind, detail }) }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Could not save that."); return; }
      setWho(""); setDetail(""); onChange();
    } catch { setErr("Could not reach the server."); } finally { setBusy(false); }
  }
  async function remove(id?: string) {
    if (!id) return;
    await fetch("/api/experiments/events", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    onChange();
  }
  async function decide(d: Decision) {
    const r = await fetch("/api/experiments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: exp.id, decision: d, decision_note: note }) }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) setErr(r?.error ?? "Could not save that."); else onChange();
  }
  async function archive() {
    await fetch("/api/experiments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: exp.id, status: "archived" }) }).catch(() => null);
    onChange();
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-[15px] font-semibold">{exp.goal}</h3>
        {exp.hypothesis && <p className="mt-1 text-[13px] text-[var(--bm-text2)]">Expecting: {exp.hypothesis}</p>}
        {exp.audience && <p className="text-[13px] text-[var(--bm-text2)]">Asking: {exp.audience}</p>}
      </div>

      <div className="rounded-[10px] border border-[var(--bm-border)] p-3">
        <p className="text-[13px] font-semibold">{move.headline}</p>
        <p className="mt-1 text-[12px] text-[var(--bm-text3)]">{move.why}</p>
        <p className="mt-2 text-[12px] text-[var(--bm-text3)]">{t.people} {t.people === 1 ? "person" : "people"} · {t.sent} sent · {t.replied} replied · {t.noReply} no reply · {t.blocked} blocked · {t.prepared} prepared</p>
      </div>

      <div className="rounded-[10px] border border-[var(--bm-border)] p-3">
        <p className="text-[13px] font-semibold">30-day direction</p>
        <p className="mt-1 text-[12px] text-[var(--bm-text3)]">{plan.summary}</p>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {plan.milestones.map((m) => (
            <li key={m.id} className="flex items-baseline gap-2 text-[13px]">
              <span aria-hidden="true">{m.done ? "✓" : "○"}</span>
              <span className={m.done ? "text-[var(--bm-text)]" : "text-[var(--bm-text2)]"}>{m.label}{m.done ? " (done)" : ""}</span>
            </li>
          ))}
        </ul>
        {plan.quiet && <p className="mt-2 text-[12px] text-[var(--bm-text3)]">{plan.quiet.note}</p>}
        {exp.status !== "decided" && (
          <>
            <p className="mt-3 text-[12px] font-semibold">Next</p>
            <ol className="m-0 mt-1 list-decimal pl-5 text-[13px] text-[var(--bm-text2)]">{plan.next.map((a) => <li key={a}>{a}</li>)}</ol>
          </>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((r) => (
            <li key={r.who} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className="font-medium">{r.who}</span>
              <span className="text-[var(--bm-text2)]">{STATE_LABEL[r.state]}</span>
              {r.detail && <span className="min-w-0 text-[var(--bm-text3)]" style={{ overflowWrap: "anywhere" }}>{r.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {exp.status !== "decided" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold">Record what happened</p>
          <input style={field} value={who} maxLength={80} onChange={(e) => setWho(e.target.value)} placeholder="Who (name or shop)" aria-label="Who" />
          <select style={field} value={kind} onChange={(e) => setKind(e.target.value as EventKind)} aria-label="What happened">
            {KIND_CHOICES.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
          </select>
          <input style={field} value={detail} maxLength={400} onChange={(e) => setDetail(e.target.value)} placeholder="What they said, if anything (optional)" aria-label="Detail" />
          <Button onClick={() => void add()} disabled={busy || !who.trim()} style={{ minHeight: 44 }}>{busy ? "Saving…" : "Save"}</Button>
          {evs.length > 0 && (
            <details className="text-[12px] text-[var(--bm-text3)]">
              <summary style={{ minHeight: 32, cursor: "pointer" }}>Entries ({evs.length}), remove a mistake</summary>
              <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                {[...evs].reverse().map((ev) => (
                  <li key={ev.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>{ev.who || "Note"}: {STATE_LABEL[ev.kind as keyof typeof STATE_LABEL] ?? ev.kind}</span>
                    <button type="button" onClick={() => void remove(ev.id)} style={{ minHeight: 32, textDecoration: "underline" }}>Remove</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {exp.status === "decided" && exp.decision ? (
        <p className="text-[13px]"><span className="font-semibold">Decision:</span> {DECISION_LABEL[exp.decision]}{exp.decision_note ? `, ${exp.decision_note}` : ""}</p>
      ) : (
        <details>
          <summary style={{ minHeight: 32, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Make a decision</summary>
          <div className="mt-2 flex flex-col gap-2">
            <input style={field} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" aria-label="Why" />
            <div className="flex flex-wrap gap-2">
              {DECISIONS.map((d) => <Button key={d} variant="secondary" onClick={() => void decide(d)} style={{ minHeight: 44 }}>{DECISION_LABEL[d]}</Button>)}
            </div>
          </div>
        </details>
      )}
      {err && <p role="alert" className="text-[12px] text-[var(--bm-red)]">{err}</p>}
      <button type="button" onClick={() => void archive()} className="self-start text-[12px] text-[var(--bm-text3)] underline" style={{ minHeight: 32 }}>Archive</button>
    </Card>
  );
}
