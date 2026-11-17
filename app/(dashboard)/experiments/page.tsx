"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveProjectId } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { rollingPlan } from "@/lib/experimentPlan";
import {
  DECISIONS, DECISION_LABEL, STATE_LABEL, effectiveEvents, receipts, tally,
  type Decision, type EventKind, type Experiment, type MilestoneRef,
} from "@/lib/experiments";
import {
  EVIDENCE_KINDS, EVIDENCE_KIND_LABEL, EVIDENCE_STATUS_LABEL, LOOP_STAGES, LOOP_STAGE_LABEL, OFFER_GUIDE,
  isStale, knowledge, loopNext, type Evidence, type LoopStage, type Offer, type OfferFields,
} from "@/lib/experimentLoop";

type LoopExperiment = Experiment & { evidence?: Evidence[]; offers?: Offer[]; loop_stage?: LoopStage; project_stage?: string | null; milestones?: MilestoneRef[] };
/** A retry key: pressing Save twice, or a retried request, records the thing once. */
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);
const post = (url: string, body: unknown, method = "POST") => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));

const field: React.CSSProperties = { width: "100%", minHeight: 44, borderRadius: 8, border: "1px solid var(--bm-border)", background: "var(--bm-bg)", color: "var(--bm-text)", padding: "8px 10px", fontSize: 14 };
const KIND_CHOICES: Array<{ k: EventKind; label: string }> = [
  { k: "prepared", label: "Prepared, not sent" }, { k: "sent", label: "I sent it" }, { k: "replied", label: "They replied" },
  { k: "no_reply", label: "No reply yet" }, { k: "blocked", label: "Blocked" }, { k: "conversation", label: "We had a conversation" },
  { k: "declined", label: "They said no" }, { k: "pilot_agreed", label: "They agreed to a pilot (not paid)" },
  { k: "would_pay", label: "They said they would pay" }, { k: "paid", label: "They paid" }, { k: "delivered", label: "I delivered it" },
];
const FIELD_LABEL: Record<keyof OfferFields, string> = {
  problem: "The problem", solution: "What you are offering", availability: "What works and can be delivered today (and what does not)",
  scope: "What is included, and what is not", proof: "Your proof (only what really exists)", price_hypothesis: "Price to test (a guess, not a fact)",
};

export default function ExperimentsPage() {
  const [list, setList] = useState<LoopExperiment[] | null>(null);
  const [setup, setSetup] = useState(false);
  const [err, setErr] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>();
  const [goal, setGoal] = useState(""); const [hyp, setHyp] = useState(""); const [aud, setAud] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (pid?: string) => {
    const r = await fetch(`/api/experiments${pid ? `?projectId=${pid}` : ""}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setErr(r?.error ?? "Could not load experiments."); setList([]); return; }
    setSetup(Boolean(r.setup)); setList(r.experiments as LoopExperiment[]);
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
      {setup && <Card className="p-4 text-[13px]">Experiments need one database step before they can save. Run <code>20261116000000_customer_experiments.sql</code> in Supabase, then reload. For evidence, offers and corrections, also run <code>20261117000000_experiment_loop.sql</code>, and for milestone links <code>20261117010000_experiment_milestone.sql</code>.</Card>}

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

function ExperimentCard({ exp, onChange }: { exp: LoopExperiment; onChange: () => void }) {
  const evs = exp.events ?? [];
  const stage: LoopStage = exp.loop_stage ?? "idea";
  const evidence = exp.evidence ?? []; const offers = exp.offers ?? []; const offer = offers.length ? offers[offers.length - 1] : null;
  const t = tally(evs); const move = loopNext(stage, evidence, offer, evs, exp.milestone?.title); const rows = receipts(evs); const plan = rollingPlan(exp);
  const know = knowledge(stage, evidence, offer, evs); const guide = OFFER_GUIDE[stage];
  const counted = new Set(effectiveEvents(evs).map((e) => e.id));
  const replacedIds = new Set(evs.map((e) => e.corrects_id).filter(Boolean));
  const [who, setWho] = useState(""); const [kind, setKind] = useState<EventKind>("sent"); const [detail, setDetail] = useState("");
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  // One key per entry being written; it is replaced only after a save succeeds, so a retry cannot double-record.
  const eventKey = useRef(newKey());
  const [evKind, setEvKind] = useState<"conversation" | "enquiry" | "observation" | "assumption">("observation");
  const [evStatus, setEvStatus] = useState<"founder_report" | "observed">("founder_report");
  const [evNote, setEvNote] = useState(""); const [evSource, setEvSource] = useState(""); const [evDate, setEvDate] = useState("");
  const evidenceKey = useRef(newKey());
  const [offerDraft, setOfferDraft] = useState<OfferFields>({ problem: offer?.problem ?? "", solution: offer?.solution ?? "", availability: offer?.availability ?? "", scope: offer?.scope ?? "", proof: offer?.proof ?? "", price_hypothesis: offer?.price_hypothesis ?? "" });
  const offerKey = useRef(newKey());

  async function add() {
    if (busy) return; setBusy(true); setErr("");
    try {
      const r = await post("/api/experiments/events", { experimentId: exp.id, who, kind, detail, clientKey: eventKey.current, ...(correcting ? { correctsId: correcting } : {}) });
      if (!r.ok) { setErr(r.error ?? "Could not save that."); return; }
      eventKey.current = newKey(); setCorrecting(null); setWho(""); setDetail(""); onChange();
    } finally { setBusy(false); }
  }
  async function withdraw(id?: string) {
    if (!id) return;
    const r = await post("/api/experiments/events", { id, clientKey: newKey() }, "DELETE");
    if (!r.ok) setErr(r.error ?? "Could not remove that."); else onChange();
  }
  function startCorrection(ev: NonNullable<Experiment["events"]>[number]) {
    if (!ev.id) return;
    setCorrecting(ev.id); setWho(ev.who); setKind(ev.kind); setDetail(ev.detail); eventKey.current = newKey();
  }
  async function addEvidence() {
    if (busy) return; setBusy(true); setErr("");
    try {
      const r = await post("/api/experiments/evidence", { experimentId: exp.id, kind: evKind, status: evKind === "assumption" ? "assumption" : evStatus, note: evNote, source: evSource, source_date: evDate || undefined, clientKey: evidenceKey.current });
      if (!r.ok) { setErr(r.error ?? "Could not save that."); return; }
      evidenceKey.current = newKey(); setEvNote(""); setEvSource(""); setEvDate(""); onChange();
    } finally { setBusy(false); }
  }
  async function recheck(id?: string) { if (id) { await post("/api/experiments/evidence", { id }, "PATCH"); onChange(); } }
  async function dropEvidence(id?: string) { if (id) { await post("/api/experiments/evidence", { id }, "DELETE"); onChange(); } }
  async function saveOffer() {
    if (busy) return; setBusy(true); setErr("");
    try {
      const r = await post("/api/experiments/offers", { experimentId: exp.id, ...offerDraft, evidence_ids: evidence.filter((e) => e.status !== "assumption" && !e.synthetic).map((e) => e.id).filter(Boolean), clientKey: offerKey.current });
      if (!r.ok) { setErr(r.error ?? "Could not save that."); return; }
      offerKey.current = newKey(); onChange();
    } finally { setBusy(false); }
  }
  async function setMilestone(v: string) {
    const r = await post("/api/experiments", { id: exp.id, milestone_id: v || null }, "PATCH");
    if (!r.ok) setErr(r.error ?? "Could not save that."); else onChange();
  }
  async function setStage(v: string) {
    const r = await post("/api/experiments", { id: exp.id, stage: v }, "PATCH");
    if (!r.ok) setErr(r.error ?? "Could not save that."); else onChange();
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

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold">Stage: {LOOP_STAGE_LABEL[stage]}</span>
        <label className="flex items-center gap-1 text-[12px] text-[var(--bm-text3)]">I am really at
          <select style={{ ...field, width: "auto", minHeight: 36 }} value={exp.stage ?? ""} onChange={(e) => void setStage(e.target.value)} aria-label="Stage">
            <option value="">{exp.project_stage ? `Use my project stage (${exp.project_stage})` : "Use my project stage"}</option>
            {LOOP_STAGES.map((st) => <option key={st} value={st}>{LOOP_STAGE_LABEL[st]}</option>)}
          </select>
        </label>
      </div>

      {(exp.milestones?.length ?? 0) > 0 && (
        <label className="flex flex-col gap-1 text-[12.5px]">Part of milestone
          <select style={field} value={exp.milestone_id ?? ""} onChange={(e) => void setMilestone(e.target.value)} aria-label="Milestone">
            <option value="">Not linked to a milestone</option>
            {exp.milestones!.map((m) => <option key={m.id} value={m.id}>{m.title}{m.done ? " (completed)" : ""}</option>)}
          </select>
          <span className="text-[12px] text-[var(--bm-text3)]">{exp.milestone ? `${exp.milestone.done ? "This milestone is completed." : "This milestone is not completed."} ` : ""}Results here never complete a milestone. You do that yourself on the project page.</span>
        </label>
      )}

      <div className="rounded-[10px] border border-[var(--bm-border)] p-3">
        <p className="text-[13px] font-semibold">{move.headline}</p>
        <p className="mt-1 text-[12px] text-[var(--bm-text3)]">{move.why}</p>
        <details className="mt-2 text-[12px] text-[var(--bm-text3)]">
          <summary style={{ minHeight: 32, cursor: "pointer" }}>Why this next step</summary>
          <ul className="m-0 mt-1 list-disc pl-5">{move.because.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
        <p className="mt-2 text-[12px] text-[var(--bm-text3)]">{t.people} {t.people === 1 ? "person" : "people"} · {t.sent} sent · {t.replied + t.conversations} replied or talked · {t.wouldPay + t.pilotAgreed} interested · {t.paid} paid · {t.delivered} delivered · {t.noReply} no reply · {t.declined} said no</p>
      </div>

      <div className="rounded-[10px] border border-[var(--bm-border)] p-3">
        <p className="text-[13px] font-semibold">Known, assumed, unknown</p>
        {([["Known", know.known], ["Assumed", know.assumed], ["Unknown", know.unknown]] as const).map(([label, items]) => (
          <div key={label} className="mt-2">
            <p className="text-[12px] font-semibold">{label}</p>
            {items.length ? <ul className="m-0 list-disc pl-5 text-[12.5px] text-[var(--bm-text2)]">{items.map((x) => <li key={x} style={{ overflowWrap: "anywhere" }}>{x}</li>)}</ul> : <p className="text-[12px] text-[var(--bm-text3)]">Nothing yet.</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold">Evidence</p>
        {evidence.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {evidence.map((ev) => (
              <li key={ev.id} className="text-[13px]" style={{ opacity: ev.synthetic ? 0.6 : 1 }}>
                <span className="font-medium">{EVIDENCE_KIND_LABEL[ev.kind]}</span>{" "}
                <span className="text-[var(--bm-text2)]">({EVIDENCE_STATUS_LABEL[ev.status]}{ev.synthetic ? ", test run, not counted" : ""}{isStale(ev) ? ", may be out of date" : ""})</span>
                <span className="block text-[var(--bm-text2)]" style={{ overflowWrap: "anywhere" }}>{ev.note}{ev.source ? ` Source: ${ev.source}.` : ""}</span>
                {ev.kind !== "assumption" && <button type="button" onClick={() => void recheck(ev.id)} className="text-[12px] underline" style={{ minHeight: 32 }}>I checked this again today</button>}{" "}
                <button type="button" onClick={() => void dropEvidence(ev.id)} className="text-[12px] text-[var(--bm-text3)] underline" style={{ minHeight: 32 }}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <select style={field} value={evKind} onChange={(e) => setEvKind(e.target.value as typeof evKind)} aria-label="Kind of evidence">
          {EVIDENCE_KINDS.map((k) => <option key={k} value={k}>{EVIDENCE_KIND_LABEL[k]}</option>)}
        </select>
        {evKind !== "assumption" && (
          <select style={field} value={evStatus} onChange={(e) => setEvStatus(e.target.value as typeof evStatus)} aria-label="How sure">
            <option value="founder_report">I am reporting this (no one else can check it)</option>
            <option value="observed">Someone can check it (I will say where)</option>
          </select>
        )}
        <input style={field} value={evNote} maxLength={500} onChange={(e) => setEvNote(e.target.value)} placeholder={evKind === "assumption" ? "What you believe but have not checked" : "What you saw or heard"} aria-label="Evidence" />
        {evKind !== "assumption" && <input style={field} value={evSource} maxLength={300} onChange={(e) => setEvSource(e.target.value)} placeholder="Where it can be checked (link or place)" aria-label="Source" />}
        {evKind !== "assumption" && <label className="flex flex-col gap-1 text-[12px] text-[var(--bm-text3)]">Date it was published or happened (optional)<input type="date" style={field} value={evDate} onChange={(e) => setEvDate(e.target.value)} /></label>}
        <Button variant="secondary" onClick={() => void addEvidence()} disabled={busy || evNote.trim().length < 5} style={{ minHeight: 44 }}>Add evidence</Button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold">Offer or test{offer ? ` (version ${offer.version})` : ""}</p>
        <p className="text-[12px] text-[var(--bm-text3)]">{guide.what}{guide.notYet ? ` ${guide.notYet}` : ""}</p>
        {guide.fields.map((f) => (
          <label key={f} className="flex flex-col gap-1 text-[12.5px]">{f === "price_hypothesis" && guide.priceLabel ? guide.priceLabel : FIELD_LABEL[f]}
            <input style={field} value={offerDraft[f]} maxLength={f === "price_hypothesis" ? 120 : 400} onChange={(e) => setOfferDraft({ ...offerDraft, [f]: e.target.value })} />
          </label>
        ))}
        <Button variant="secondary" onClick={() => void saveOffer()} disabled={busy || !offerDraft.problem.trim()} style={{ minHeight: 44 }}>{offer ? `Save as version ${offer.version + 1}` : "Save offer"}</Button>
        <p className="text-[12px] text-[var(--bm-text3)]">Saving an offer does not send it to anyone. Earlier versions are kept.</p>
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
          <Button onClick={() => void add()} disabled={busy || !who.trim()} style={{ minHeight: 44 }}>{busy ? "Saving…" : correcting ? "Save correction" : "Save"}</Button>
          {correcting && <p className="text-[12px] text-[var(--bm-text3)]">You are correcting an earlier entry. The old one stays in the history. <button type="button" className="underline" onClick={() => { setCorrecting(null); setWho(""); setDetail(""); }}>Cancel</button></p>}
          {evs.length > 0 && (
            <details className="text-[12px] text-[var(--bm-text3)]">
              <summary style={{ minHeight: 32, cursor: "pointer" }}>History ({evs.length}), correct or withdraw a mistake</summary>
              <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                {[...evs].reverse().map((ev) => {
                  const live = counted.has(ev.id);
                  const note = ev.kind === "retracted" ? "withdrawal" : ev.synthetic ? "test run, not counted" : replacedIds.has(ev.id) ? "replaced by a correction" : ev.corrects_id ? "correction" : "";
                  return (
                    <li key={ev.id} className="flex items-center gap-2" style={{ opacity: live ? 1 : 0.6 }}>
                      <span className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>{ev.kind === "retracted" ? `${ev.who || "Entry"}: withdrawn` : `${ev.who || "Note"}: ${STATE_LABEL[ev.kind as keyof typeof STATE_LABEL] ?? ev.kind}`}{note ? ` (${note})` : ""}</span>
                      {live && ev.kind !== "note" && <button type="button" onClick={() => startCorrection(ev)} style={{ minHeight: 32, textDecoration: "underline" }}>Correct</button>}
                      {live && <button type="button" onClick={() => void withdraw(ev.id)} style={{ minHeight: 32, textDecoration: "underline" }}>Withdraw</button>}
                    </li>
                  );
                })}
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
