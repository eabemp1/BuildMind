"use client";

import React from "react";
import { DURATION_CHOICES, defaultChoiceFor, defaultMeasure, looksLikeOpenLoop, type DurationChoice } from "@/lib/today/loops";

export type FollowUpValue = { choice: DurationChoice | null; measure: string };

/**
 * "Remind me to check back" — the founder picks how long to wait; the app
 * brings the task back after that time to record evidence.
 */
export function FollowUpPicker({
  task, texts, value, onChange,
}: {
  task: string;
  texts: string[];
  value: FollowUpValue;
  onChange: (v: FollowUpValue) => void;
}) {
  const touched = React.useRef(false);
  const joined = texts.join(" ");
  const suggest = looksLikeOpenLoop(...texts);

  // Preselect once the founder's own words suggest a result is pending.
  React.useEffect(() => {
    if (touched.current) return;
    if (suggest) onChange({ choice: defaultChoiceFor(joined), measure: defaultMeasure(task, joined) });
    else if (value.choice) onChange({ choice: null, measure: value.measure });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggest, joined]);

  const chip = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? "var(--bm-accent)" : "var(--bm-border)"}`,
    background: active ? "var(--bm-accent-dim)" : "transparent",
    color: active ? "var(--bm-text)" : "var(--bm-text3)",
    borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  });

  function pick(choice: DurationChoice | null) {
    touched.current = true;
    onChange({ choice, measure: value.measure || defaultMeasure(task, joined) });
  }

  return (
    <div style={{ marginBottom: 14, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 6 }}>Remind me to check back</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={chip(value.choice === null)} onClick={() => pick(null)}>No</button>
        {(Object.keys(DURATION_CHOICES) as DurationChoice[]).map((k) => (
          <button key={k} type="button" style={chip(value.choice === k)} onClick={() => pick(k)}>{DURATION_CHOICES[k].label}</button>
        ))}
      </div>
      {value.choice && (
        <label style={{ display: "block", marginTop: 8 }}>
          <span style={{ fontSize: 12, color: "var(--bm-text3)" }}>What should you measure?</span>
          <input
            value={value.measure} maxLength={200}
            onChange={(e) => { touched.current = true; onChange({ ...value, measure: e.target.value }); }}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 4, background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: "7px 9px", fontSize: 13, color: "var(--bm-text)", fontFamily: "inherit" }}
          />
        </label>
      )}
    </div>
  );
}
