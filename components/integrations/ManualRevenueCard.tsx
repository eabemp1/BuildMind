"use client";

import React from "react";

const label: React.CSSProperties = { fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" };
const small: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--bm-text3)", lineHeight: "var(--leading-normal)", margin: 0 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 10px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)" };
const btn = (primary = false): React.CSSProperties => ({ fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "6px 12px", border: `1px solid ${primary ? "var(--bm-text)" : "var(--bm-border2)"}`, background: primary ? "var(--bm-text)" : "transparent", color: primary ? "var(--bm-bg)" : "var(--bm-text2)" });

/**
 * For any payment tool BuildMind does not read: type three numbers. Saved as self-reported, so it is never shown as
 * verified. Nothing is connected and no key is needed.
 */
export default function ManualRevenueCard({ onSaved, onCancel }: { onSaved: () => void; onCancel?: () => void }) {
  const [customers, setCustomers] = React.useState("");
  const [mrr, setMrr] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [payments, setPayments] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function save() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/integrations/revenue-manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payingCustomers: Number(customers || 0), mrr: Number(mrr || 0), currency, paymentsLast30d: Number(payments || 0) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) setError(j.error ?? "Could not save.");
      else onSaved();
    } catch { setError("Could not reach BuildMind."); }
    setBusy(false);
  }

  const ok = customers !== "" && Number(customers) >= 0 && /^[A-Za-z]{3}$/.test(currency);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={label}>Type your numbers</div>
      <p style={small}>For Flutterwave, Paddle, Lemon Squeezy, Gumroad, bank transfer or cash. These are saved as your own numbers, and BuildMind will say so wherever it uses them. Update them whenever they change.</p>
      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
        <label style={small}>Paying customers<input style={input} inputMode="numeric" value={customers} onChange={(e) => setCustomers(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" aria-label="Paying customers" /></label>
        <label style={small}>Monthly revenue<input style={input} inputMode="decimal" value={mrr} onChange={(e) => setMrr(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" aria-label="Monthly revenue" /></label>
        <label style={small}>Currency<input style={input} value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="GHS" aria-label="Currency" /></label>
        <label style={small}>Payments, last 30 days<input style={input} inputMode="numeric" value={payments} onChange={(e) => setPayments(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" aria-label="Payments in the last 30 days" /></label>
      </div>
      {error && <p style={{ ...small, color: "var(--bm-text2)" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btn(true)} disabled={busy || !ok} onClick={save}>{busy ? "Saving…" : "Save my numbers"}</button>
        {onCancel && <button type="button" style={btn()} onClick={onCancel}>Skip for now</button>}
      </div>
    </div>
  );
}
