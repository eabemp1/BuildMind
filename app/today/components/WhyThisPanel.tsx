"use client";

import { useState } from "react";
import { buildWhyThis, type WhyThisInput } from "@/lib/whyThis";

const LEVEL_COLOR = { high: "var(--bm-green)", medium: "var(--bm-accent)", low: "var(--bm-red)", unknown: "var(--bm-text3)" } as const;

export function WhyThisPanel({ data }: { data: WhyThisInput }) {
  const [open, setOpen] = useState(false);
  const m = buildWhyThis(data);

  return (
    <div style={{ margin: "8px 0 14px" }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--bm-text3)", textDecoration: "underline", textUnderlineOffset: 3 }}>
        {open ? "Hide why" : "Why am I seeing this?"}
      </button>
      {open && (
        <div style={{ marginTop: 10, border: "1px solid var(--bm-border)", borderRadius: 14, background: "var(--bm-bg2)", padding: "14px 14px", display: "grid", gap: 12, fontSize: 13.5, lineHeight: 1.55, color: "var(--bm-text2)" }}>
          {m.fallbackNote && (
            <div style={{ color: "var(--bm-amber, #E8C547)" }}>{m.fallbackNote}</div>
          )}
          <div>
            <div style={{ color: "var(--bm-text)", fontWeight: 700, marginBottom: 4 }}>Why this task</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{m.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
          {m.signals.length > 0 && (
            <div>
              <div style={{ color: "var(--bm-text)", fontWeight: 700, marginBottom: 4 }}>What BuildMind noticed</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {m.signals.map((s, i) => <li key={i}><b style={{ color: "var(--bm-text)" }}>{s.title}.</b> {s.detail}</li>)}
              </ul>
            </div>
          )}
          <div>
            <span style={{ color: "var(--bm-text)", fontWeight: 700 }}>How sure we are: </span>
            <span style={{ color: LEVEL_COLOR[m.confidence.level] }}>{m.confidence.label}</span>
          </div>
          {m.usedReflection !== null && (
            <div>
              <span style={{ color: "var(--bm-text)", fontWeight: 700 }}>Your last check-in: </span>
              {m.usedReflection ? "used to shape this task." : "wasn't available, so it wasn't used."}
            </div>
          )}
          {m.alternatives.length > 0 && (
            <div>
              <div style={{ color: "var(--bm-text)", fontWeight: 700, marginBottom: 4 }}>Other options we weighed</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {m.alternatives.map((a, i) => <li key={i}>{a.action}. <span style={{ color: "var(--bm-text3)" }}>{a.why}</span></li>)}
              </ul>
            </div>
          )}
          <a href={m.mirrorLink} style={{ color: "var(--bm-accent)", fontWeight: 600, textDecoration: "none" }}>
            Something wrong about you? Correct it in Founder Mirror
          </a>
        </div>
      )}
    </div>
  );
}
