"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  projectId: string;
  onLogged?: () => void;
}

const TYPE_OPTIONS: { value: "support_ticket" | "nps_score" | "customer_message" | "other"; label: string }[] = [
  { value: "support_ticket", label: "Support ticket" },
  { value: "nps_score", label: "NPS score" },
  { value: "customer_message", label: "Customer message" },
  { value: "other", label: "Other" },
];

/**
 * SignalCaptureForm — the actual data source behind Risk Interrupt /
 * Recovery Mode (see lib/riskSignals.ts for why this is the chosen MVP
 * signal source instead of a live integration). Collapsed by default —
 * this is a "log it when it happens" affordance, not something that
 * should compete with the day's main task for attention.
 */
export function SignalCaptureForm({ projectId, onLogged }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<typeof TYPE_OPTIONS[number]["value"]>("support_ticket");
  const [severity, setSeverity] = useState<"critical" | "warning" | "neutral" | "positive">("warning");
  const [note, setNote] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [mrrAtRisk, setMrrAtRisk] = useState("");
  const [npsValue, setNpsValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justLogged, setJustLogged] = useState(false);

  const handleSubmit = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/risk-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          signalType: type,
          severity,
          note: note.trim(),
          customerName: customerName.trim() || undefined,
          mrrAtRisk: mrrAtRisk ? Number(mrrAtRisk) : undefined,
          value: type === "nps_score" && npsValue ? Number(npsValue) : undefined,
        }),
      });
      if (res.ok) {
        setNote(""); setCustomerName(""); setMrrAtRisk(""); setNpsValue("");
        setJustLogged(true);
        setTimeout(() => setJustLogged(false), 2500);
        onLogged?.();
      }
    } catch {}
    setSubmitting(false);
  };

  return (
    <div style={{ border: "1px solid var(--bm-border)", borderRadius: "var(--r-xl)", background: "var(--bm-bg2)", marginTop: 16 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "none", border: "none", cursor: "pointer",
          fontFamily: "inherit", color: "var(--bm-text3)", fontSize: 12, fontWeight: 600,
        }}
      >
        <span>Log a customer signal (support ticket, NPS, warning)</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} style={selectStyle}>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} style={selectStyle}>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="neutral">Neutral</option>
              <option value="positive">Positive</option>
            </select>
            {type === "nps_score" && (
              <input
                type="number" min={0} max={10} placeholder="Score 0-10"
                value={npsValue} onChange={(e) => setNpsValue(e.target.value)}
                style={{ ...selectStyle, width: 100 }}
              />
            )}
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened? e.g. 'Ticket #402: API lag reported'"
            rows={2}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--bm-border2)",
              background: "var(--bm-bg3)", color: "var(--bm-text)", fontSize: 13, fontFamily: "inherit", resize: "vertical",
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text" placeholder="Customer/account name (optional)"
              value={customerName} onChange={(e) => setCustomerName(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            />
            <input
              type="number" min={0} placeholder="MRR at risk $ (optional)"
              value={mrrAtRisk} onChange={(e) => setMrrAtRisk(e.target.value)}
              style={{ ...selectStyle, width: 160 }}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !note.trim()}
            style={{
              alignSelf: "flex-start", padding: "8px 16px", borderRadius: 8, border: "none",
              background: !note.trim() ? "var(--bm-bg3)" : "var(--bm-accent)",
              color: !note.trim() ? "var(--bm-text4)" : "#000",
              fontSize: 12, fontWeight: 700, cursor: !note.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}
          >
            {submitting ? "Logging…" : justLogged ? "Logged ✓" : "Log signal"}
          </button>
        </div>
      )}
    </div>
  );
}

const selectStyle: CSSProperties = {
  padding: "7px 10px", borderRadius: 8, border: "1px solid var(--bm-border2)",
  background: "var(--bm-bg3)", color: "var(--bm-text)", fontSize: 12, fontFamily: "inherit",
};
