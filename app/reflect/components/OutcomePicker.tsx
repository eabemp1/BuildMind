"use client";

export type ReflectionOutcome =
  | "completed"
  | "blocked"
  | "partial"
  | "learned";

const outcomes: {
  id: ReflectionOutcome;
  label: string;
  sublabel: string;
  color: string;
  background: string;
  border: string;
  icon: string;
}[] = [
  {
    id: "completed",
    label: "Nailed it",
    sublabel: "Made real progress",
    color: "var(--bm-green)",
    background: "var(--bm-green-dim)",
    border: "var(--bm-green-bd)",
    icon: "✓",
  },
  {
    id: "partial",
    label: "Partly done",
    sublabel: "Made some progress",
    color: "var(--bm-amber)",
    background: "rgba(232,160,32,0.08)",
    border: "rgba(232,160,32,0.22)",
    icon: "◐",
  },
  {
    id: "blocked",
    label: "Got blocked",
    sublabel: "Hit a roadblock",
    color: "var(--bm-red)",
    background: "var(--bm-red-dim)",
    border: "var(--bm-red-bd)",
    icon: "✕",
  },
  {
    id: "learned",
    label: "Learned something",
    sublabel: "New insight",
    color: "var(--bm-intel)",
    background: "var(--bm-intel-dim)",
    border: "var(--bm-intel-bd)",
    icon: "↯",
  },
];

export function OutcomePicker({
  outcome,
  locked,
  onChange,
}: {
  outcome: ReflectionOutcome | null;
  locked: boolean;
  onChange: (outcome: ReflectionOutcome) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {outcomes.map((item) => {
        const selected = outcome === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => !locked && onChange(item.id)}
            disabled={locked && !selected}
            className="flex min-h-16 items-center gap-3 rounded-[var(--r-xl)] border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              borderColor: selected ? item.border : "var(--bm-border)",
              background: selected ? item.background : "var(--bm-bg3)",
            }}
          >
            <span
              className="w-5 text-center text-base font-semibold"
              style={{ color: selected ? item.color : "var(--bm-text3)" }}
            >
              {item.icon}
            </span>
            <span>
              <span
                className="block text-[13px] font-medium"
                style={{ color: selected ? item.color : "var(--bm-text2)" }}
              >
                {item.label}
              </span>
              <span className="mt-0.5 block text-[10px] text-[var(--bm-text3)]">
                {item.sublabel}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
