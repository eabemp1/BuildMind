"use client";

import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export const mono = "'DM Mono', monospace";
export const display = "'Syne', sans-serif";
export const body = "'Inter', sans-serif";

/** First sentence of a block of text, trimmed to `max` characters. */
export function firstSentence(text: string, max = 140): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  const s = m ? m[0] : t;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/** Everything after the first sentence ("" if there is nothing more). */
export function afterFirstSentence(text: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  return m ? t.slice(m[0].length).trim() : "";
}

export function Chip({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} style={{ fontFamily: mono, fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 99, padding: "1px 8px", flexShrink: 0, lineHeight: 1.6 }}>
      {children}
    </span>
  );
}

/** A titled section the reader opens on purpose. The summary stays visible when closed. */
export function Disclosure({
  title, summary, defaultOpen = false, tone, children,
}: { title: string; summary?: React.ReactNode; defaultOpen?: boolean; tone?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div style={{ border: `1px solid ${tone ?? "var(--bm-border)"}`, borderRadius: 14, background: "var(--bm-bg2)" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "none", border: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}
      >
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: "var(--bm-text)", letterSpacing: "-0.01em" }}>{title}</span>
          {summary && <span style={{ fontFamily: body, fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.45 }}>{summary}</span>}
        </span>
        <ChevronDown size={16} style={{ color: "var(--bm-text3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
      </button>
      {open && <div id={id} style={{ padding: "2px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>}
    </div>
  );
}

export const bodyText: React.CSSProperties = { fontFamily: body, fontSize: 14, lineHeight: 1.6, color: "var(--bm-text2)", margin: 0 };
export const smallText: React.CSSProperties = { fontFamily: body, fontSize: 12.5, lineHeight: 1.5, color: "var(--bm-text3)", margin: 0 };
export const labelText: React.CSSProperties = { fontFamily: body, fontSize: 12, fontWeight: 600, color: "var(--bm-text3)", margin: 0 };
