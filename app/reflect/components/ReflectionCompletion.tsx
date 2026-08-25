"use client";

import { Brain, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ReflectionCompletion({
  witnessed,
  causality,
  nextAction,
  onToday,
  onOverview,
}: {
  witnessed?: string;
  causality?: string;
  nextAction: string;
  onToday: () => void;
  onOverview: () => void;
}) {
  return (
    <div className="mx-auto max-w-[560px] px-3 py-12 text-center sm:px-6">
      <div className="mx-auto grid h-15 w-15 place-items-center rounded-full border border-[var(--bm-green-bd)] bg-[var(--bm-green-dim)]">
        <CheckCircle2 size={26} className="text-[var(--bm-green)]" />
      </div>

      <h2 className="mt-4 text-[22px] font-bold text-[var(--bm-text)]">
        Reflection saved
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--bm-text3)]">
        This compounds. Every reflection makes tomorrow sharper.
      </p>

      <div className="mt-6 space-y-3 text-left">
        {witnessed ? (
          <Card
            variant="insight"
            className="p-5 text-sm leading-relaxed text-[var(--bm-text)]"
          >
            {witnessed}
          </Card>
        ) : null}

        {causality ? (
          <Card variant="insight" className="p-5">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--bm-intel)]">
              <Brain size={11} />
              BuildMind inference
            </p>
            <p className="mt-2 text-sm italic leading-relaxed text-[var(--bm-text2)]">
              {causality}
            </p>
          </Card>
        ) : null}

        <Card className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--bm-text3)]">
            Tomorrow&apos;s focus
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--bm-text2)]">
            {nextAction}
          </p>
        </Card>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" fullWidth onClick={onOverview}>
          Back to dashboard
        </Button>
        <Button fullWidth onClick={onToday}>
          Back to Today
        </Button>
      </div>
    </div>
  );
}
