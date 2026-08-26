"use client";

import { Card } from "@/components/ui/card";

const labels = ["", "Lost", "Uncertain", "Steady", "Confident", "Unstoppable"];
const colors = ["", "var(--bm-red)", "var(--bm-amber)", "var(--bm-text2)", "var(--bm-teal)", "var(--bm-accent)"];

export function ConfidenceSelector({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <Card variant="data" className="mb-5 rounded-[var(--r-xl)] p-4 sm:px-5"><div className="flex items-baseline justify-between gap-4"><p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--bm-text3)]">Confidence</p><p className="text-xs font-semibold" style={{ color: colors[value] }}>{labels[value]}</p></div><div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((option) => <button key={option} type="button" onClick={() => onChange(option)} aria-label={`${option}: ${labels[option]}`} className="h-9 flex-1 rounded-[var(--r-md)] border text-sm transition-colors" style={{ borderColor: value === option ? colors[option] : "var(--bm-border)", background: value === option ? `${colors[option]}15` : "var(--bm-bg2)", color: value === option ? colors[option] : "var(--bm-text3)", fontWeight: value === option ? 700 : 400 }}>{option}</button>)}</div></Card>;
}
