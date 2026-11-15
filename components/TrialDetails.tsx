"use client";

import { Price } from "@/components/Price";
import { trialSummary } from "@/lib/trialSummary";

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 6px" }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((t) => <li key={t} style={{ fontSize: 13, lineHeight: 1.55, color: "var(--bm-text2)" }}>{t}</li>)}
      </ul>
    </div>
  );
}

/** What the trial includes, its limits, when it ends and what happens next, in plain words. */
export function TrialDetails({ endsLabel }: { endsLabel: string | null }) {
  const s = trialSummary();
  return (
    <section aria-labelledby="trial-details" style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 id="trial-details" style={{ fontSize: 15, fontWeight: 800, color: "var(--bm-text)", margin: 0 }}>What your trial includes</h2>
      <Block title="Included" items={s.included} />
      <Block title="Limits" items={s.limits} />
      <Block title={endsLabel ? `When it ends on ${endsLabel}` : "When it ends"} items={s.afterwards} />
      <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0 }}>To keep Builder: <strong><Price kind="month" /></strong>. Cancel any time.</p>
    </section>
  );
}
