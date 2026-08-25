"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EvidenceDisclosure } from "./EvidenceDisclosure";
import type { Signal } from "./IntelligencePanel";

export function RiskInterrupt({ signal }: { signal: Signal }) {
  return (
    <Card
      variant="alert"
      role="alert"
      className="mb-4 border-[var(--bm-red-bd)] p-4"
    >
      <div className="flex gap-3">
        <AlertTriangle
          size={18}
          className="mt-0.5 shrink-0 text-[var(--bm-red)]"
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--bm-red)]">
            Critical risk
          </p>
          <h2 className="mt-1 text-sm font-medium text-[var(--bm-text)]">
            {signal.title}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--bm-text2)]">
            {signal.summary}
          </p>
          {signal.recommended_response ? (
            <p className="mt-2 text-xs leading-relaxed text-[var(--bm-text3)]">
              {signal.recommended_response}
            </p>
          ) : null}
          <div className="mt-3">
            <EvidenceDisclosure signal={signal} />
          </div>
        </div>
      </div>
    </Card>
  );
}
