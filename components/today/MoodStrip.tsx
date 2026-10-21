"use client";
/**
 * components/today/MoodStrip.tsx - the mood as a control, not a label.
 * Shows what kind of day it is, what the page is doing about it, and gives the founder two
 * levers: Focus (dim everything but the task) and, in calm moods, Show everything.
 */
import { MOOD_BEHAVIOR, MOOD_META, type Mood } from "@/lib/today/mood";

const pill: React.CSSProperties = { minHeight: 32, padding: "0 12px", borderRadius: 999, fontSize: "var(--text-sm)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };

export default function MoodStrip({ mood, engaged, timerRunning, calm, showAll, onToggleFocus, onToggleAll }: {
  mood: Mood; engaged: boolean; timerRunning: boolean; calm: boolean; showAll: boolean; onToggleFocus: () => void; onToggleAll: () => void;
}) {
  const meta = MOOD_META[mood];
  const behavior = MOOD_BEHAVIOR[mood];
  return (
    <div className="today-mood-strip" style={{ flexWrap: "wrap", rowGap: 6 }} aria-label={`Today is a ${meta.label} day`}>
      <span className={engaged ? "dot bm-mood-live" : "dot"} />
      <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--bm-accent)" }}>{meta.label}</span>
      <span className="tone" style={{ fontSize: "var(--text-sm)", color: "var(--bm-text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
        {engaged ? behavior.engagedNote : meta.tone}
      </span>
      <span style={{ flex: 1 }} />
      {calm && !engaged && (
        <button type="button" onClick={onToggleAll} aria-pressed={showAll} style={{ ...pill, border: "1px solid var(--bm-border3)", background: "transparent", color: "var(--bm-text3)" }}>
          {showAll ? "Keep it calm" : "Show everything"}
        </button>
      )}
      {!timerRunning && (
        <button type="button" onClick={onToggleFocus} aria-pressed={engaged}
          style={{ ...pill, border: "1px solid var(--bm-accent-bd)", background: engaged ? "var(--bm-accent)" : "var(--bm-accent-dim)", color: engaged ? "var(--mood-on-accent, #15130a)" : "var(--bm-accent)" }}>
          {engaged ? "Exit focus" : behavior.focusVerb}
        </button>
      )}
    </div>
  );
}
