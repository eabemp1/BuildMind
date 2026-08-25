"use client";

import { ArrowRight, Clock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type DecisionBriefProps = {
  action: string;
  rationale: string;
  time?: string;
  lowConfidence?: boolean;
  expectedEvidence?: string;
  onExecute?: () => void;
  executeLabel?: string;
};

/** Presentational only: callers retain recommendation and execution behavior. */
export function DecisionBrief({ action, rationale, time, lowConfidence = false, expectedEvidence, onExecute, executeLabel = "Execute" }: DecisionBriefProps) {
  return (
    <Card variant={lowConfidence ? "data" : "alert"} className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--bm-accent)] text-white"><Target size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--bm-text3)]">
            {lowConfidence ? "Calibration recommendation" : "Decision brief"}
          </p>
          <h2 className="mt-2 text-lg font-medium leading-snug text-[var(--bm-text)]">{action}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--bm-text2)]">{rationale}</p>
          {expectedEvidence ? <p className="mt-3 border-t border-[var(--bm-border)] pt-3 text-xs leading-relaxed text-[var(--bm-text3)]"><span className="font-medium text-[var(--bm-text2)]">Expected evidence: </span>{expectedEvidence}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {time ? <span className="inline-flex items-center gap-1.5 text-xs text-[var(--bm-text3)]"><Clock size={12} />{time}</span> : null}
            {onExecute ? <Button size="sm" onClick={onExecute}> {executeLabel} <ArrowRight size={13} /></Button> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
