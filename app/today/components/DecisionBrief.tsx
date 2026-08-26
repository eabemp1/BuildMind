"use client";

import type { ReactNode } from "react";
import { ArrowRight, Clock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type DecisionBriefProps = {
  action: ReactNode;
  rationale?: ReactNode;
  time?: string;
  lowConfidence?: boolean;
  expectedEvidence?: string;
  onExecute?: () => void;
  executeLabel?: string;
};

/** Presentational only: callers retain recommendation and execution behavior. */
export function DecisionBrief({ action, rationale, time, lowConfidence = false, expectedEvidence, onExecute, executeLabel = "Execute" }: DecisionBriefProps) {
  return (
    <Card
      variant={lowConfidence ? "data" : "alert"}
      className="overflow-hidden"
      style={{ borderRadius: "var(--r-xl)" }}
    >
      <div className="border-b border-[var(--bm-border)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-[4px] bg-[var(--bm-accent-dim)] text-[var(--bm-accent)]">
            <Target size={11} />
          </span>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--bm-text3)]">
            {lowConfidence ? "Calibration brief" : "Decision brief"}
          </p>
          {time ? <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-[var(--bm-text4)]"><Clock size={11} />{time}</span> : null}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--bm-text4)]">What to do</p>
        <h2 className="mt-2 font-[family-name:var(--font-syne)] text-[19px] font-semibold leading-[1.28] text-[var(--bm-text)] sm:text-[21px]">{action}</h2>

        {lowConfidence ? (
          <p className="mt-3 border-l-2 border-[var(--bm-intel-bd)] pl-3 text-xs leading-relaxed text-[var(--bm-text3)]">
            This is an evidence-gathering action. The result will calibrate the next recommendation.
          </p>
        ) : null}

        {rationale ? (
          <div className="mt-4 border-t border-[var(--bm-border)] pt-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--bm-text4)]">Why now</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--bm-text2)]">{rationale}</p>
          </div>
        ) : null}

        {expectedEvidence ? (
          <div className="mt-3 rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg3)] px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--bm-text4)]">Expected evidence</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--bm-text3)]">{expectedEvidence}</p>
          </div>
        ) : null}

        {onExecute ? (
          <div className="mt-4">
            <Button size="sm" onClick={onExecute}>
              {executeLabel} <ArrowRight size={13} />
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
