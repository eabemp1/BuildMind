"use client";

/**
 * components/MrrWidget.tsx — Revenue Signal Input
 *
 * One number. The founder's current MRR in GHS.
 * Stored in projects.current_mrr (pesewas) and fed into the reflexion loop
 * so every task is revenue-aware.
 *
 * Design principle: frictionless. One click to edit, one click to save.
 * No dashboard. No chart. Just the number that matters.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface MrrWidgetProps {
  projectId: string;
  currentMrr: number;          // pesewas
  onUpdate?: (newMrr: number) => void;
}

const VIZ = {
  bg: "rgba(12,12,18,0.98)",
  border: "var(--bm-border)",
  borderFocus: "rgba(99,102,241,0.5)",
  text1: "#f0f0f5",
  text2: "#9494a8",
  text3: "#4a4a5a",
  indigo: "var(--bm-accent)",
  green: "#4ade80",
  amber: "#fbbf24",
};

export function MrrWidget({ projectId, currentMrr, onUpdate }: MrrWidgetProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [saving, setSaving] = useState(false);

  const mrrGhs = currentMrr > 0 ? (currentMrr / 100).toFixed(0) : null;

  async function handleSave() {
    const parsed = parseFloat(inputVal.replace(/[^0-9.]/g, ""));
    if (isNaN(parsed) || parsed < 0) { setEditing(false); return; }
    const pesewas = Math.round(parsed * 100);
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("projects")
        .update({ current_mrr: pesewas, mrr_updated_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("user_id", user.id);
      onUpdate?.(pesewas);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  const label = currentMrr === 0
    ? "Pre-revenue"
    : `GHS ${mrrGhs}/mo`;

  const color = currentMrr === 0 ? VIZ.text3 : VIZ.green;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, color: VIZ.text3, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
        Current MRR
      </div>

      {editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: VIZ.text2, fontSize: 13, fontWeight: 600 }}>
              GHS
            </span>
            <input
              autoFocus
              type="number"
              min="0"
              step="1"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="0"
              style={{
                width: 120,
                paddingLeft: 40,
                paddingRight: 10,
                paddingTop: 7,
                paddingBottom: 7,
                borderRadius: 8,
                border: `1px solid ${VIZ.borderFocus}`,
                background: VIZ.bg,
                color: VIZ.text1,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "none",
              background: VIZ.indigo,
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{ background: "none", border: "none", color: VIZ.text3, fontSize: 12, cursor: "pointer", padding: "7px 4px", fontFamily: "inherit" }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setInputVal(mrrGhs ?? ""); setEditing(true); }}
          title="Click to update your MRR — this makes your daily tasks revenue-aware"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: `1px solid ${VIZ.border}`,
            borderRadius: 8,
            padding: "6px 10px",
            cursor: "pointer",
            fontFamily: "inherit",
            width: "fit-content",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color }}>
            {label}
          </span>
          <span style={{ fontSize: 10, color: VIZ.text3 }}>✎</span>
        </button>
      )}

      <div style={{ fontSize: 11, color: VIZ.text3, maxWidth: 200, lineHeight: 1.4 }}>
        {currentMrr === 0
          ? "Add your MRR so your daily tasks target revenue, not just progress."
          : "Your tasks are revenue-aware. Update anytime."}
      </div>
    </div>
  );
}
