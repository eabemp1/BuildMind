"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Signal } from "./IntelligencePanel";
import { EvidenceDisclosure } from "./EvidenceDisclosure";

const iconBySeverity = { low: Info, medium: Info, high: AlertCircle, critical: AlertCircle };

export function SignalList({ signals }: { signals: Signal[] }) {
  if (!signals.length) return null;
  return <Card variant="data" className="divide-y divide-[var(--bm-border)]"><div className="px-4 py-3"><p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--bm-text3)]">Signals</p></div>{signals.map((signal, index) => {
    const Icon = iconBySeverity[signal.severity];
    return <div className="px-4 py-3" key={`${signal.title}-${index}`}><div className="flex gap-2"><Icon size={14} className={signal.severity === "critical" ? "mt-0.5 text-[var(--bm-red)]" : "mt-0.5 text-[var(--bm-text3)]"} /><div className="min-w-0 flex-1"><p className="text-sm text-[var(--bm-text)]">{signal.title}</p><p className="mt-1 text-xs leading-relaxed text-[var(--bm-text3)]">{signal.summary}</p><p className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--bm-text3)]"><CheckCircle2 size={11} /> {Math.round(signal.confidence * 100)}% confidence</p><div className="mt-2"><EvidenceDisclosure signal={signal} /></div></div></div></div>;
  })}</Card>;
}
