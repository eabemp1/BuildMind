"use client";
import React from "react";
import { SPEC_BY_ID, EXISTING } from "@/lib/work/registry";
import { muted } from "./ui";

export interface LibraryRow { id: string; kind: string; title: string; status: string; updated_at: string }

const when = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const STATUS: Record<string, string> = { draft: "Draft", used: "Used", sent: "Sent" };

export default function Library({ rows, setup, onOpen }: { rows: LibraryRow[]; setup: boolean; onOpen: (id: string) => void }) {
  if (setup) return <p style={muted}>Saving isn't switched on yet. Run the latest database migration.</p>;
  if (!rows.length) return <p style={muted}>Nothing saved yet. Prepare something and it appears here.</p>;
  return (
    <div className="wk-list">
      {rows.map((r) => (
        <button key={r.id} type="button" className="wk-row" onClick={() => onOpen(r.id)}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--bm-text)", overflowWrap: "anywhere" }}>{r.title}</span>
            <span style={{ display: "block", fontSize: 12.5, color: "var(--bm-text3)", marginTop: 2 }}>{SPEC_BY_ID[r.kind]?.label ?? EXISTING.find((e) => e.kind === r.kind)?.label ?? r.kind}, {when(r.updated_at)}</span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: r.status === "draft" ? "var(--bm-text3)" : "var(--bm-green)", flexShrink: 0 }}>{STATUS[r.status] ?? r.status}</span>
        </button>
      ))}
    </div>
  );
}
