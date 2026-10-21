"use client";

import React from "react";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import { carryIsFresh, type TomorrowCarry as Carry } from "@/lib/today/evening";

function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Last night you said your first move would be…" — shown once, the next day. */
export default function TomorrowCarry() {
  const [carry, setCarry] = React.useState<Carry | null>(null);

  React.useEffect(() => {
    let live = true;
    void fetchBehaviorState<{ tomorrow_first_move: Carry }>(["tomorrow_first_move"]).then((v) => {
      const c = v.tomorrow_first_move;
      if (live && carryIsFresh(c, localDay())) setCarry(c);
    });
    return () => { live = false; };
  }, []);

  if (!carry) return null;
  const dismiss = () => {
    setCarry(null);
    void persistBehaviorState({ tomorrow_first_move: { ...carry, dismissed: true } });
  };

  return (
    <div style={{ border: "1px solid var(--bm-border)", borderRadius: 10, background: "var(--bm-bg2)", padding: "10px 12px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        <div style={{ fontSize: 11, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: 0.4 }}>Your first move, from last night</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginTop: 2 }}>{carry.clear || carry.text}</div>
        {carry.task ? <div style={{ fontSize: 12, color: "var(--bm-text3)", marginTop: 3 }}>Continuing: {carry.task.length > 110 ? `${carry.task.slice(0, 110)}...` : carry.task}</div> : null}
        {carry.clear && carry.clear.trim().toLowerCase() !== carry.text.trim().toLowerCase() ? <div style={{ fontSize: 12, color: "var(--bm-text4)", marginTop: 2 }}>You wrote: {carry.text}</div> : null}
      </div>
      <button type="button" onClick={dismiss} style={{ border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text3)", borderRadius: 6, padding: "4px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Done</button>
    </div>
  );
}
