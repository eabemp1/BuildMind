"use client";
/**
 * Your limits: minutes a day and money a month. Saved to user_behavior_state (founder_constraints).
 * Today, the coach and the stress test read these and treat them as binding.
 */
import { useEffect, useState } from "react";

export default function LimitsCard({ isMobile = false }: { isMobile?: boolean }) {
  const [minutes, setMinutes] = useState("");
  const [budget, setBudget] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/user/behavior-state?keys=founder_constraints", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const c = j?.values?.founder_constraints as { minutesPerDay?: number | null; monthlyBudget?: number | null } | null | undefined;
        if (c?.minutesPerDay != null) setMinutes(String(c.minutesPerDay));
        if (c?.monthlyBudget != null) setBudget(String(c.monthlyBudget));
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaved("saving");
    try {
      const res = await fetch("/api/user/behavior-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { founder_constraints: { minutesPerDay: minutes === "" ? null : Number(minutes), monthlyBudget: budget === "" ? null : Number(budget) } } }),
      });
      setSaved(res.ok ? "saved" : "error");
    } catch {
      setSaved("error");
    }
  }

  const field = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "var(--bm-bg)", color: "var(--bm-text)", fontSize: 14 } as const;
  const label = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 6 } as const;

  return (
    <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: isMobile ? "18px" : "22px 24px" }}>
      <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--bm-text)", marginBottom: 6 }}>Your limits</div>
      <div style={{ fontSize: isMobile ? 13 : 12, color: "var(--bm-text3)", marginBottom: 16 }}>
        Tasks and advice will fit inside these. Leave a box empty if you do not want to set it. Enter 0 for no money to spend.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <div>
          <label htmlFor="limit-minutes" style={label}>Minutes a day for the business</label>
          <input id="limit-minutes" inputMode="numeric" style={field} value={minutes} onChange={(e) => { setMinutes(e.target.value.replace(/\D/g, "")); setSaved("idle"); }} placeholder="e.g. 30" />
        </div>
        <div>
          <label htmlFor="limit-budget" style={label}>Money for the business each month</label>
          <input id="limit-budget" inputMode="numeric" style={field} value={budget} onChange={(e) => { setBudget(e.target.value.replace(/\D/g, "")); setSaved("idle"); }} placeholder="e.g. 0, in your own currency" />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button type="button" onClick={save} disabled={saved === "saving"} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--bm-accent)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          {saved === "saving" ? "Saving…" : "Save limits"}
        </button>
        <span role="status" style={{ fontSize: 12, color: saved === "error" ? "var(--bm-red)" : "var(--bm-text3)" }}>
          {saved === "saved" ? "Saved. Tomorrow's task will respect this." : saved === "error" ? "Could not save. Try again." : ""}
        </span>
      </div>
    </div>
  );
}
