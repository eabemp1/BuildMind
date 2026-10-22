"use client";
/**
 * components/today/MoodStrip.tsx - the mood as a status line, not a control.
 * Shows what kind of day it is and what the page is doing about it. It reacts by itself: starting the
 * focus timer (the one already on the task) engages the page. No extra buttons.
 */
import { MOOD_BEHAVIOR, MOOD_META, type Mood } from "@/lib/today/mood";

export default function MoodStrip({ mood, engaged }: { mood: Mood; engaged: boolean }) {
  const meta = MOOD_META[mood];
  const behavior = MOOD_BEHAVIOR[mood];
  return (
    <div className="today-mood-strip" aria-label={`Today is a ${meta.label} day`}>
      <span className={engaged ? "dot bm-mood-live" : "dot"} />
      <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--bm-accent)" }}>{meta.label}</span>
      <span className="tone" style={{ fontSize: "var(--text-sm)", color: "var(--bm-text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
        {engaged ? behavior.engagedNote : meta.tone}
      </span>
    </div>
  );
}
