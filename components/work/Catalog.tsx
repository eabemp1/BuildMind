"use client";
import React from "react";
import { GROUP_LABEL, GROUP_ORDER, searchCatalog, type CatalogEntry, type WorkGroup } from "@/lib/work/registry";
import { card, input, muted } from "./ui";

export default function Catalog({ entries, recent, onPick, onOpenItem }: {
  entries: CatalogEntry[];
  recent: Array<{ id: string; title: string; kind: string }>;
  onPick: (e: CatalogEntry) => void;
  onOpenItem: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const shown = searchCatalog(entries, q);
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you need? Try: email, pricing, pitch, survey" aria-label="Search" style={input} />
      {recent.length > 0 && !q && (
        <div>
          <p style={{ ...muted, marginBottom: 8, fontWeight: 600 }}>Pick up where you left off</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {recent.slice(0, 3).map((r) => (
              <button key={r.id} type="button" onClick={() => onOpenItem(r.id)} style={{ ...card, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", color: "var(--bm-text2)", fontSize: 13 }}>{r.title}</button>
            ))}
          </div>
        </div>
      )}
      {shown.length === 0 && <p style={muted}>Nothing matches. Try a different word, such as "email" or "price".</p>}
      {GROUP_ORDER.map((g: WorkGroup) => {
        const list = shown.filter((e) => e.group === g);
        if (!list.length) return null;
        return (
          <section key={g} aria-label={GROUP_LABEL[g].label}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 2px" }}>{GROUP_LABEL[g].label}</h2>
            <p style={{ ...muted, marginBottom: 10 }}>{GROUP_LABEL[g].blurb}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
              {list.map((e) => (
                <button key={e.id} type="button" onClick={() => onPick(e)} style={{ ...card, textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "grid", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>{e.label}</span>
                  <span style={{ fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.4 }}>{e.blurb}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
