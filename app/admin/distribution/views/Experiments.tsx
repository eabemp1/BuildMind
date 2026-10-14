"use client";
import React, { useMemo, useState } from "react";
import { C, Panel } from "@/app/admin/components/ui";
import { compareExperiments, confidenceOf, missingEvidence, per1000, outcomes, MIN_REACH, type Experiment } from "@/lib/distribution/experiments";
import { api, Btn, Chip, Empty, Field, fmtDate, input } from "../shared";

const METRICS: [keyof Experiment, string][] = [["impressions", "Impressions"], ["replies", "Replies"], ["meaningful_exchanges", "Meaningful exchanges"], ["profile_visits", "Profile visits"], ["qualified_founders", "Qualified founders"], ["signups", "Signups"], ["activations", "Activations"], ["paid", "Paid"]];
const CONF = { insufficient: C.red, low: C.amber, moderate: C.a } as const;

function Card({ e, picked, toggle, reload }: { e: Experiment; picked: boolean; toggle: () => void; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState<Record<string, string>>(() => Object.fromEntries(METRICS.map(([k]) => [k, e[k] == null ? "" : String(e[k])])));
  const [t, setT] = useState({ observations: e.observations ?? "", learning: e.learning ?? "", next_experiment: e.next_experiment ?? "", status: e.status });
  const [saved, setSaved] = useState("");
  const conf = confidenceOf(e);
  const missing = missingEvidence(e);

  async function save() {
    const data: Record<string, unknown> = { ...t };
    for (const [k] of METRICS) data[k] = m[k] === "" ? null : Math.max(0, Math.floor(Number(m[k]) || 0));
    const r = await api(`experiments?id=${e.id}`, "PATCH", data);
    setSaved(r.ok ? "Saved" : r.error ?? "Failed");
    if (r.ok) reload();
  }

  return (
    <div style={{ borderTop: `1px solid ${C.b}`, padding: "10px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={picked} onChange={toggle} title="Select to compare" style={{ marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{e.hypothesis}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4, fontSize: 11, color: C.t3 }}>
            <Chip color={C.t2}>{e.platform}</Chip>{e.segment && <span>{e.segment}</span>}<span>{e.status}</span><span>{fmtDate(e.run_on)}</span>
            <Chip color={CONF[conf.level]}>{conf.level} confidence</Chip>
            {e.impressions != null && <span>{e.impressions.toLocaleString()} reach · {outcomes(e)} people</span>}
          </div>
        </div>
        <Btn small onClick={() => setOpen(!open)}>{open ? "Close" : "Record"}</Btn>
      </div>
      {open && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: C.t3 }}>{conf.reason}{e.metrics_as_of ? ` Metrics entered ${fmtDate(e.metrics_as_of)}.` : ""} Leave a box empty if you do not know it. Empty is not zero.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
            {METRICS.map(([k, l]) => <Field key={k} label={l}><input type="number" min={0} value={m[k]} onChange={(ev) => setM({ ...m, [k]: ev.target.value })} style={input} /></Field>)}
          </div>
          {missing.length > 0 && <div style={{ fontSize: 11.5, color: C.amber }}>Missing evidence: {missing.join(", ")}.</div>}
          <Field label="Status"><select value={t.status} onChange={(ev) => setT({ ...t, status: ev.target.value })} style={{ ...input, width: "auto" }}>{["planned", "running", "done"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="What you observed (replies, who engaged, what they said)"><textarea value={t.observations} onChange={(ev) => setT({ ...t, observations: ev.target.value })} rows={3} style={{ ...input, resize: "vertical" }} /></Field>
          <Field label="What you learned"><textarea value={t.learning} onChange={(ev) => setT({ ...t, learning: ev.target.value })} rows={2} style={{ ...input, resize: "vertical" }} /></Field>
          <Field label="Next experiment"><input value={t.next_experiment} onChange={(ev) => setT({ ...t, next_experiment: ev.target.value })} style={input} /></Field>
          {e.variant && <details><summary style={{ fontSize: 11.5, color: C.t3, cursor: "pointer" }}>Variant text</summary><div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", marginTop: 6 }}>{e.variant}</div></details>}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Btn kind="primary" onClick={save}>Save</Btn>
            <Btn kind="danger" small onClick={async () => { if (confirm("Delete this experiment?")) { await api(`experiments?id=${e.id}`, "DELETE"); reload(); } }}>Delete</Btn>
            {saved && <span style={{ fontSize: 12, color: C.t3 }}>{saved}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Experiments({ items, reload }: { items: Experiment[]; reload: () => void }) {
  const [h, setH] = useState({ hypothesis: "", platform: "linkedin", segment: "", run_on: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const cmp = useMemo(() => (picked.length >= 2 ? compareExperiments(items.filter((e) => picked.includes(e.id))) : null), [picked, items]);

  async function add() {
    if (!h.hypothesis.trim()) return setErr("State what you are testing.");
    const r = await api("experiments", "POST", { hypothesis: h.hypothesis, platform: h.platform, segment: h.segment || null, run_on: h.run_on || null, status: "planned" });
    if (!r.ok) return setErr(r.error ?? "Could not save");
    setErr(""); setH({ ...h, hypothesis: "" }); reload();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title="New experiment">
        <div style={{ display: "grid", gap: 10 }}>
          <Field label="Hypothesis" hint="e.g. Opening with a personal admission starts more conversations than an abstract insight."><textarea value={h.hypothesis} onChange={(e) => setH({ ...h, hypothesis: e.target.value })} rows={2} style={{ ...input, resize: "vertical" }} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
            <Field label="Platform"><select value={h.platform} onChange={(e) => setH({ ...h, platform: e.target.value })} style={input}>{["linkedin", "x", "reddit", "hn", "email", "other"].map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Audience segment"><input value={h.segment} onChange={(e) => setH({ ...h, segment: e.target.value })} style={input} /></Field>
            <Field label="Date run"><input type="date" value={h.run_on} onChange={(e) => setH({ ...h, run_on: e.target.value })} style={input} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Btn kind="primary" onClick={add}>Add experiment</Btn>{err && <span style={{ fontSize: 12, color: C.red }}>{err}</span>}</div>
        </div>
      </Panel>

      {cmp && (
        <Panel title="Comparison" right={<Chip color={cmp.verdict === "leader" ? C.a : C.amber}>{cmp.verdict === "leader" ? "Leader" : cmp.verdict === "insufficient" ? "Not enough data" : "No clear difference"}</Chip>}>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 8 }}>{cmp.reason}</div>
          {cmp.rows.map((r) => {
            const e = items.find((x) => x.id === r.id)!;
            return (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, fontSize: 12, padding: "5px 0", borderTop: `1px solid ${C.b}` }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: r.id === cmp.leaderId ? C.a : C.t2 }}>{e.hypothesis}</span>
                <span style={{ color: C.t3, whiteSpace: "nowrap" }}>{r.outcomes} people / {r.n.toLocaleString()} reach · {per1000(r.rate)} per 1,000 (range {per1000(r.lo)}–{per1000(r.hi)})</span>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: C.t4, marginTop: 8 }}>People means qualified founders, activations and paid, as you entered them. Raw replies and impressions never decide this. Needs {MIN_REACH}+ impressions each.</div>
        </Panel>
      )}

      <Panel title="Experiments" right={<span style={{ fontSize: 11, color: C.t3 }}>Tick two or more to compare</span>}>
        {items.length === 0 && <Empty>No experiments yet. The Writing Lab can log a version for you, or add one above.</Empty>}
        {items.map((e) => <Card key={e.id} e={e} picked={picked.includes(e.id)} toggle={() => setPicked((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]))} reload={reload} />)}
      </Panel>
    </div>
  );
}
