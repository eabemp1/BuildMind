"use client";
import React from "react";
import { SPEC_BY_ID, EXISTING } from "@/lib/work/registry";
import { card, muted } from "./ui";

export interface LibraryRow { id: string; kind: string; title: string; status: string; updated_at: string }

const when = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

export default function Library({ rows, setup, onOpen }: { rows: LibraryRow[]; setup: boolean; onOpen: (id: string) => void }) {
  if (setup) return <p style={muted}>The library is not set up yet, so new work is shown but not saved. Run the latest database migration to turn saving on.</p>;
  if (!rows.length) return <p style={muted}>Nothing here yet. Pick something from "New" and it will be saved here automatically.</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => (
        <button key={r.id} type="button" onClick={() => onOpen(r.id)} style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--bm-text)", overflowWrap: "anywhere" }}>{r.title}</span>
            <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>{SPEC_BY_ID[r.kind]?.label ?? EXISTING.find((e) => e.kind === r.kind)?.label ?? r.kind} · {when(r.updated_at)}</span>
          </span>
          <span style={{ fontSize: 12, color: r.status === "draft" ? "var(--bm-text3)" : "var(--bm-green)", flexShrink: 0 }}>{r.status === "draft" ? "Draft" : r.status === "used" ? "Used" : "Sent"}</span>
        </button>
      ))}
    </div>
  );
}
