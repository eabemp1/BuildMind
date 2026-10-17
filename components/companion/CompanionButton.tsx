"use client";

import React from "react";
import { CofounderAvatar } from "@/components/CofounderAvatar";
import type { PulseMode } from "@/components/CofounderPulse";
import { useCompanion } from "@/components/companion/useCompanion";
import MomentCard from "@/components/companion/MomentCard";
import { INTENSITY_LABEL, type Intensity } from "@/lib/companion/policy";
import { useActiveProjectId } from "@/lib/queries";
import { usePlan } from "@/lib/usePlan";

const MODE: Record<string, PulseMode> = {
  pushback_planned_vs_done: "challenge", pushback_avoidance: "challenge", reflection_gap: "insight",
  milestone_overdue: "alert", restart: "alert", win: "celebrate",
};

/**
 * The Co-founder lives in the top bar: a small avatar that shows a dot when it
 * has something to say, and opens today's brief and settings from any page.
 * Builder plan only (same gate the old sidebar card used).
 */
export default function CompanionButton() {
  const { plan } = usePlan();
  const projectId = useActiveProjectId();
  const { data, dismiss, acted, saveSettings } = useCompanion(projectId);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (plan !== "builder" || !data) return null;
  const meta = data.styles.find((s) => s.key === data.style);
  const color = meta?.color ?? "var(--bm-accent)";
  const top = data.moments[0];
  const mode: PulseMode = top ? MODE[top.kind] ?? "insight" : "observing";

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Co-founder"
        title={top ? `Co-founder: ${top.headline}` : "Co-founder"}
        style={{ position: "relative", display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 6, border: "1px solid var(--bm-border2)", background: "transparent", cursor: "pointer", padding: 0 }}
      >
        <CofounderAvatar style={data.style} color={color} mode={mode} pulsing={Boolean(top)} size={22} />
        {data.moments.length > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 14, height: 14, borderRadius: 7, background: "var(--bm-accent)", color: "#15130a", fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 3px" }}>
            {data.moments.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog" aria-label="Co-founder brief"
          style={{
            position: "fixed", zIndex: 80, top: 54, right: 8, left: 8, marginLeft: "auto", width: "min(380px, calc(100vw - 16px))",
            maxHeight: "calc(100dvh - 70px)", overflowY: "auto", background: "var(--bm-bg)", border: "1px solid var(--bm-border2)",
            borderRadius: 10, padding: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", display: "grid", gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>Your co-founder · {meta?.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--bm-text3)" }}>{meta?.tagline}</div>
            </div>
          </div>

          {data.moments.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.5 }}>Nothing needs you right now. I'll speak up when your records say something is slipping.</div>
          ) : (
            data.moments.map((m) => (
              <MomentCard key={m.key} m={m} color={color} projectId={projectId} onDismiss={dismiss} onActed={acted} />
            ))
          )}

          <div style={{ borderTop: "1px solid var(--bm-border)", paddingTop: 10, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace" }}>Style</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.styles.map((s) => (
                <button key={s.key} type="button" onClick={() => void saveSettings({ style: s.key })} title={s.tagline}
                  style={{ border: `1px solid ${s.key === data.style ? s.color : "var(--bm-border)"}`, background: "transparent", color: s.key === data.style ? "var(--bm-text)" : "var(--bm-text3)", borderRadius: 6, padding: "4px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bm-text3)", fontFamily: "'DM Mono', monospace" }}>How often (max {data.cap} a day)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["quiet", "balanced", "relentless"] as Intensity[]).map((i) => (
                <button key={i} type="button" onClick={() => void saveSettings({ intensity: i })}
                  style={{ border: `1px solid ${i === data.intensity ? "var(--bm-accent)" : "var(--bm-border)"}`, background: i === data.intensity ? "var(--bm-accent-dim)" : "transparent", color: i === data.intensity ? "var(--bm-text)" : "var(--bm-text3)", borderRadius: 6, padding: "4px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {INTENSITY_LABEL[i]}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--bm-text4)", lineHeight: 1.4 }}>Style and frequency change how I talk, never the facts. I only act when you approve.</div>
          </div>
        </div>
      )}
    </div>
  );
}
