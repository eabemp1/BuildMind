"use client";

import React from "react";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { sanitizeMarkdown } from "@/lib/sanitizeOutput";
import type { OpenPane } from "@/components/layout/side-pane-context";

type ReaderReq = Extract<OpenPane, { kind: "reader" }>;

/** A read-only detail view: an insight, a mirror reflection, an agent's report. */
export default function ReaderPane({ req }: { req: ReaderReq }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "18px 20px 28px" }}>
      <div>
        {req.eyebrow && <p style={{ margin: 0, fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bm-accent)" }}>{req.eyebrow}</p>}
        <h2 style={{ margin: "4px 0 0", fontFamily: "'Syne', sans-serif", fontSize: 20, lineHeight: 1.25, color: "var(--bm-text)", letterSpacing: "-0.01em" }}>{req.title}</h2>
        {req.subtitle && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--bm-text3)" }}>{req.subtitle}</p>}
      </div>

      {req.facts && req.facts.length > 0 && (
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {req.facts.map((f) => (
            <div key={f.label} style={{ background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "8px 10px", minWidth: 0 }}>
              <dt style={{ fontSize: 11, color: "var(--bm-text3)" }}>{f.label}</dt>
              <dd style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 600, color: "var(--bm-text)", overflowWrap: "anywhere" }}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div style={{ maxWidth: "68ch" }}>
        <Markdown textSize={14}>{sanitizeMarkdown(req.markdown)}</Markdown>
      </div>

      {req.href && (
        <Link href={req.href} style={{ alignSelf: "flex-start", display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--bm-accent)", textDecoration: "none" }}>
          {req.hrefLabel ?? "Open full page"} <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
