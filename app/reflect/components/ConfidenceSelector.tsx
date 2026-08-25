"use client";

import { Card } from "@/components/ui/card";

const labels = [
  "",
  "Lost",
  "Uncertain",
  "Steady",
  "Confident",
  "Unstoppable",
];

const colors = [
  "",
  "var(--bm-red)",
  "var(--bm-amber)",
  "var(--bm-text2)",
  "var(--bm-teal)",
  "var(--bm-accent)",
];

export function ConfidenceSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Card variant="data" className="mb-5 p-[18px] sm:px-[22px]">
      <p className="text-xs font-semibold text-[var(--bm-text2)]">
        How confident do you feel?
      </p>
      <p
        className="mt-1.5 text-xs font-semibold"
        style={{ color: colors[value] }}
      >
        {labels[value]}
      </p>

      <div className="mt-3 flex gap-2">
        {[1, 2, 3, 4, 5].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="h-9 flex-1 rounded-[var(--r-lg)] border text-sm transition-colors"
            style={{
              borderColor:
                value === option ? colors[option] : "var(--bm-border)",
              background:
                value === option
                  ? `${colors[option]}15`
                  : "var(--bm-bg3)",
              color:
                value === option ? colors[option] : "var(--bm-text3)",
              fontWeight: value === option ? 700 : 400,
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </Card>
  );
}
