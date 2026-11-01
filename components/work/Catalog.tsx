"use client";
import React from "react";
import { GROUP_LABEL, GROUP_ORDER, searchCatalog, type CatalogEntry, type WorkGroup } from "@/lib/work/registry";
import { input, muted } from "./ui";

export default function Catalog({ entries, recent, onPick, onOpenItem }: {
  entries: CatalogEntry[];
  recent: Array<{ id: string; title: string; kind: string }>;
  onPick: (e: CatalogEntry) => void;
  onOpenItem: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const shown = searchCatalog(entries, q);
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <input className="wk-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: email, pricing, pitch" aria-label="Search work" style={{ ...input, padding: "12px 14px", borderRadius: 11 }} />
      {recent.length > 0 && !q && (
        <section aria-label="Recent">
          <h2 style={heading}>Recent</h2>
          <div className="wk-list">
            {recent.slice(0, 3).map((r) => (
              <button key={r.id} type="button" className="wk-row" onClick={() => onOpenItem(r.id)}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", overflowWrap: "anywhere" }}>{r.title}</span>
                <span className="wk-go" aria-hidden>›</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {shown.length === 0 && <p style={muted}>No match. Try "email" or "price".</p>}
      {GROUP_ORDER.map((g: WorkGroup) => {
        const list = shown.filter((e) => e.group === g);
        if (!list.length) return null;
        return (
          <section key={g} aria-label={GROUP_LABEL[g].label}>
            <h2 style={heading}>{GROUP_LABEL[g].label}</h2>
            <div className="wk-list">
              {list.map((e) => (
                <button key={e.id} type="button" className="wk-row" onClick={() => onPick(e)}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--bm-text)" }}>{e.label}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--bm-text3)", marginTop: 2 }}>{e.blurb}</span>
                  </span>
                  <span className="wk-go" aria-hidden>›</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const heading: React.CSSProperties = { fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 8px 2px" };
