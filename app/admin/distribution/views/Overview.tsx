"use client";
import React from "react";
import { C, Panel } from "@/app/admin/components/ui";
import type { Overview } from "@/lib/distribution/overview";
import { Chip, Empty } from "../shared";

const KIND = { contact: { l: "Contact", c: C.a }, engage: { l: "Engage", c: C.teal }, write: { l: "Write", c: C.amber }, learn: { l: "Learn", c: C.t2 } } as const;
const GO = { contact: "conversations", engage: "conversations", write: "writing", learn: "experiments" } as const;

export function OverviewView({ o, go }: { o: Overview; go: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="adm-kpis">
        {o.metrics.map((m, i) => (
          <div key={m.label} className="adm-rise" style={{ animationDelay: `${i * 40}ms`, background: C.bg2, border: `1px solid ${C.b}`, borderRadius: C.rLg, padding: "12px 14px", minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: m.value === null ? C.t4 : C.t }}>{m.value === null ? "—" : m.value}</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>{m.value === null ? "No data logged yet" : m.sub}</div>
            <div style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>{m.source}</div>
          </div>
        ))}
      </div>

      <Panel title="Today's intelligence">
        {o.insight ? (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{o.insight.text}</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>Based on: {o.insight.basis}</div>
          </>
        ) : (
          <Empty>Not enough logged evidence to say anything yet. Log conversations and a first experiment, and this will start pointing at what to change. Until then it stays empty rather than guessing.</Empty>
        )}
      </Panel>

      <Panel title="Today's action queue" right={<span style={{ fontSize: 11, color: C.t3 }}>{o.interactionsToday} real interaction{o.interactionsToday === 1 ? "" : "s"} today</span>}>
        {o.actions.length === 0 && <Empty>Nothing queued. Add a conversation or an experiment.</Empty>}
        {o.actions.map((a, i) => (
          <button key={a.id} onClick={() => go(GO[a.kind])} className="adm-rise" style={{ animationDelay: `${i * 35}ms`, display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: 0, borderTop: i ? `1px solid ${C.b}` : "none", padding: "10px 0", color: "inherit", font: "inherit", cursor: "pointer" }}>
            <Chip color={KIND[a.kind].c}>{KIND[a.kind].l}</Chip>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{a.title}</span>
              <span style={{ display: "block", fontSize: 12, color: C.t3 }}>{a.why}</span>
            </span>
          </button>
        ))}
        <div style={{ fontSize: 11, color: C.t4, marginTop: 8 }}>Ranked by what you will learn and who it reaches, not by how much content it makes.</div>
      </Panel>

      <Panel title="Data sources">
        <div className="adm-three">
          {[
            ["Conversation log", "Manual", "Your saved discussions and outreach."],
            ["Experiment results", "Manual", "Numbers you enter from each platform."],
            ["Search Console", "Not connected", "Enter country and query data by hand for now."],
            ["Website analytics", "Not connected", "No visits are shown until this is connected."],
            ["Signups and billing", "Not attributed", "Activations and paid are entered per experiment."],
          ].map(([n, s, d]) => (
            <div key={n} style={{ border: `1px solid ${C.b}`, borderRadius: C.rMd, padding: 10, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 12.5, fontWeight: 600 }}><span>{n}</span><span style={{ fontSize: 10.5, color: s === "Manual" ? C.a : C.t4, fontWeight: 600 }}>{s}</span></div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{d}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
