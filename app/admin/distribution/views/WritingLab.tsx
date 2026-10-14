"use client";
import React, { useState } from "react";
import { C, Panel } from "@/app/admin/components/ui";
import type { Diagnosis, Point } from "@/lib/distribution/diagnose";
import type { Draft } from "@/lib/distribution/overview";
import { api, Btn, Chip, Copy, Empty, Field, fmtDate, input } from "../shared";

const APPROACH = { personal: "Personal", provocative: "Provocative", analytical: "Analytical" } as const;

function Points({ title, items, color }: { title: string; items: Point[]; color: string }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{title}</div>
      {items.map((p, i) => (
        <div key={i} style={{ fontSize: 12.5, lineHeight: 1.55, padding: "5px 0", borderTop: i ? `1px solid ${C.b}` : "none" }}>
          {p.point}
          {p.quote ? <div style={{ color: C.t3, borderLeft: `2px solid ${C.b2}`, paddingLeft: 8, marginTop: 3, fontSize: 12 }}>“{p.quote}”</div> : <div style={{ color: C.t4, fontSize: 11, marginTop: 2 }}>No supporting quote from your draft.</div>}
        </div>
      ))}
    </div>
  );
}

export function WritingLab({ drafts, reload, onLogged }: { drafts: (Draft & { audience?: string; outcome?: string; context?: string; diagnosis?: Diagnosis | null })[]; reload: () => void; onLogged: () => void }) {
  const [body, setBody] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [audience, setAudience] = useState("");
  const [outcome, setOutcome] = useState("Start conversations with founders");
  const [context, setContext] = useState("");
  const [draftId, setDraftId] = useState<string | undefined>();
  const [d, setD] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [logged, setLogged] = useState<string>("");

  async function run() {
    setBusy(true); setErr(""); setD(null);
    const r = await api<{ diagnosis: Diagnosis; draft: { id: string } | null }>("diagnose", "POST", { body, platform, audience: audience || undefined, outcome: outcome || undefined, context: context || undefined, draftId });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Could not diagnose");
    setD(r.diagnosis);
    if (r.draft) setDraftId(r.draft.id);
    reload();
  }

  function open(x: (typeof drafts)[number]) {
    setBody(x.body); setPlatform(x.platform); setAudience(x.audience ?? ""); setOutcome(x.outcome ?? ""); setContext(x.context ?? ""); setDraftId(x.id); setD((x.diagnosis as Diagnosis) ?? null); setErr("");
  }

  async function logExperiment(text: string, hypothesis: string, label: string) {
    const r = await api("experiments", "POST", { hypothesis: hypothesis || `Test the ${label} version`, platform, segment: audience || null, variant: text, draft_id: draftId ?? null, status: "planned" });
    if (r.ok) { setLogged(label); onLogged(); }
  }

  return (
    <div className="adm-two" style={{ alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <Panel title="Draft">
          <div style={{ display: "grid", gap: 10 }}>
            <Field label="Your draft" hint="Nothing is posted anywhere. You publish it yourself.">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="Paste a post, comment or message…" style={{ ...input, resize: "vertical", lineHeight: 1.55 }} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
              <Field label="Platform">
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={input}>
                  {["linkedin", "x", "reddit", "hn", "other"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Intended audience"><input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. African solo founders" style={input} /></Field>
            </div>
            <Field label="Desired outcome"><input value={outcome} onChange={(e) => setOutcome(e.target.value)} style={input} /></Field>
            <Field label="Context or evidence (optional)"><textarea value={context} onChange={(e) => setContext(e.target.value)} rows={2} style={{ ...input, resize: "vertical" }} /></Field>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn kind="primary" onClick={run} disabled={busy || body.trim().length < 20}>{busy ? "Diagnosing…" : draftId ? "Re-diagnose" : "Diagnose"}</Btn>
              {draftId && <Btn small onClick={() => { setBody(""); setD(null); setDraftId(undefined); }}>New draft</Btn>}
              {err && <span style={{ fontSize: 12, color: C.red }}>{err}</span>}
            </div>
          </div>
        </Panel>

        <Panel title="Saved drafts" right={<span style={{ fontSize: 11, color: C.t3 }}>{drafts.length}</span>}>
          {drafts.length === 0 && <Empty>Diagnosed drafts are saved here automatically.</Empty>}
          {drafts.slice(0, 12).map((x, i) => (
            <button key={x.id} onClick={() => open(x)} style={{ display: "flex", gap: 8, width: "100%", textAlign: "left", background: x.id === draftId ? C.bg3 : "none", border: 0, borderTop: i ? `1px solid ${C.b}` : "none", padding: "8px 4px", color: "inherit", font: "inherit", cursor: "pointer" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.body}</span>
              <span style={{ fontSize: 11, color: C.t3, whiteSpace: "nowrap" }}>{x.platform} · {fmtDate(x.updated_at)}</span>
            </button>
          ))}
        </Panel>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {!d && !busy && <Panel title="Diagnosis"><Empty>Paste a draft and diagnose it. You get what the draft is doing and where it may lose the reader before any rewrite.</Empty></Panel>}
        {busy && <Panel title="Diagnosis"><Empty>Reading your draft…</Empty></Panel>}
        {d && (
          <>
            <Panel title="Measured from your text" right={<Chip color={C.a}>Facts</Chip>}>
              {d.observations.map((o, i) => (
                <div key={o.key} className="adm-rise" style={{ animationDelay: `${i * 30}ms`, display: "flex", gap: 8, padding: "6px 0", borderTop: i ? `1px solid ${C.b}` : "none", fontSize: 12.5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 6, flexShrink: 0, background: o.status === "ok" ? C.a : C.amber }} />
                  <span><b>{o.label}.</b> <span style={{ color: C.t3 }}>{o.detail}</span></span>
                </div>
              ))}
            </Panel>

            {d.ai && (
              <Panel title="Model judgment" right={<Chip color={C.amber}>Not a measurement</Chip>}>
                {d.insight && <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 10 }}><b>Underlying idea worth keeping.</b> {d.insight}</div>}
                <Points title="What is working" items={d.working} color={C.a} />
                <Points title="Where it may lose the reader" items={d.weakening} color={C.amber} />
                {d.productFit && <div style={{ fontSize: 12.5, lineHeight: 1.55 }}><b>Should BuildMind appear here?</b> <span style={{ color: C.t2 }}>{d.productFit}</span></div>}
              </Panel>
            )}

            {d.openings.length > 0 && (
              <Panel title="Alternative openings">
                {d.openings.map((o, i) => (
                  <div key={i} style={{ padding: "8px 0", borderTop: i ? `1px solid ${C.b}` : "none" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}><div style={{ fontSize: 13, lineHeight: 1.5 }}>{o.text}</div><Copy text={o.text} /></div>
                    <div style={{ fontSize: 11.5, color: C.t3, marginTop: 3 }}>{o.why}</div>
                  </div>
                ))}
              </Panel>
            )}

            {d.revisions.map((r) => (
              <Panel key={r.approach} title={`${APPROACH[r.approach]} version`} right={<Copy text={r.text} />}>
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.text}</div>
                <div style={{ fontSize: 12, color: C.t3, marginTop: 8 }}><b style={{ color: C.t2 }}>Why it might be stronger:</b> {r.why}</div>
                <div style={{ marginTop: 10, padding: "8px 10px", border: `1px solid ${C.b}`, borderRadius: C.rMd, background: C.bg3, fontSize: 12, lineHeight: 1.55 }}>
                  <div><b>Tests:</b> {r.hypothesis}</div>
                  <div><b>Watch:</b> {r.metric}</div>
                  <div><b>Change course if:</b> {r.changeIf}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Btn small onClick={() => logExperiment(r.text, r.hypothesis, r.approach)}>{logged === r.approach ? "Logged as experiment" : "Log as experiment"}</Btn>
                </div>
              </Panel>
            ))}

            {d.followUps.length > 0 && (
              <Panel title="Questions readers could answer">
                {d.followUps.map((q, i) => <div key={i} style={{ fontSize: 12.5, padding: "5px 0", borderTop: i ? `1px solid ${C.b}` : "none" }}>{q}</div>)}
              </Panel>
            )}
            <div style={{ fontSize: 11, color: C.t4, lineHeight: 1.5 }}>{d.note}</div>
          </>
        )}
      </div>
    </div>
  );
}
