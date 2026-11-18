"use client";
import { OUTCOME } from "@/lib/prep/context";
import React from "react";
import { SPEC_BY_ID, EXISTING } from "@/lib/work/registry";
import { muted } from "./ui";

export interface LibraryRow { id: string; kind: string; title: string; status: string; updated_at: string; source?: "prep"; task?: string; project?: string | null; outcome?: string | null }

const when = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const STATUS: Record<string, string> = { draft: "Draft", used: "Used", sent: "Sent" };

export default function Library({ rows, setup, onOpen }: { rows: LibraryRow[]; setup: boolean; onOpen: (id: string, row?: LibraryRow) => void }) {
  const manyProjects = new Set(rows.map((r) => r.project).filter(Boolean)).size > 1;
  const [all, setAll] = React.useState(false);
  if (setup) return <p style={muted}>Saving isn't switched on yet. Run the latest database migration.</p>;
  if (!rows.length) return <p style={muted}>Nothing saved yet. Prepare something and it appears here.</p>;
  const shown = all ? rows : rows.slice(0, 30);
  return (
    <div className="wk-list">
      <p style={{ ...muted, margin: "0 0 8px" }}>Everything you prepare is listed here, newest first.</p>
      {shown.map((r) => (
        <button key={r.id} type="button" className="wk-row" onClick={() => onOpen(r.id, r)}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--bm-text)", overflowWrap: "anywhere" }}>{r.title}</span>
            <span style={{ display: "block", fontSize: 12.5, color: "var(--bm-text3)", marginTop: 2 }}>{SPEC_BY_ID[r.kind]?.label ?? EXISTING.find((e) => e.kind === r.kind)?.label ?? r.kind}, {when(r.updated_at)}{manyProjects && r.project ? `, ${r.project}` : ""}{r.source === "prep" && when(r.updated_at) !== "today" ? ". Opening it prepares it again." : ""}</span>
            {r.source === "prep" && r.task && <span style={{ display: "block", fontSize: 12.5, color: "var(--bm-text3)", marginTop: 2, overflowWrap: "anywhere" }}>For: {r.task.length > 110 ? `${r.task.slice(0, 107)}...` : r.task}</span>}
            {r.outcome && <span style={{ display: "block", fontSize: 12.5, color: "var(--bm-text2, var(--bm-text3))", marginTop: 2 }}>Result you recorded: {OUTCOME[r.outcome] ?? r.outcome.replace(/_/g, " ")}</span>}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: r.status === "draft" ? "var(--bm-text3)" : "var(--bm-green)", flexShrink: 0 }}>{STATUS[r.status] ?? r.status}</span>
        </button>
      ))}
      {!all && rows.length > 30 && (
        <button type="button" className="wk-row" onClick={() => setAll(true)} style={{ justifyContent: "center", minHeight: 44 }}>Show {rows.length - 30} older</button>
      )}
    </div>
  );
}
