"use client";

/**
 * components/coach/CoachActionResultCard.tsx
 *
 * Renders a Coach Action's result (lib/coachActions/types.ts). Everything
 * here is server-computed data — stats, task rows, download links — never
 * model-written text, so what the founder sees is exactly what's in their
 * data. Task titles come from the database (founder- or AI-authored), so
 * they pass through sanitizeOutput like every other rendered string, and
 * download links are refused unless they're same-origin API paths.
 */

import { Download, ListChecks, Database, Flag, Radar, GitBranch, Brain, TrendingUp, History } from "lucide-react";
import type { CoachActionId, CoachActionResult } from "@/lib/coachActions/types";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

const isSafeDownload = (href: string) => href.startsWith("/api/") && !href.startsWith("//");

const ICONS: Record<CoachActionId, typeof Database> = {
  list_backlog: ListChecks,
  list_milestones: Flag,
  get_signals: Radar,
  get_decision_reasoning: GitBranch,
  get_beliefs: Brain,
  get_momentum: TrendingUp,
  get_execution_log: History,
  export_intelligence: Database,
};

export function CoachActionResultCard({ result }: { result: CoachActionResult }) {
  const Icon = ICONS[result.actionId] ?? Database;
  const downloads = (result.downloads ?? []).filter((d) => isSafeDownload(d.href));

  return (
    <div className="w-full rounded-[var(--r-lg)] border border-[var(--bm-border2)] bg-[var(--bm-bg3)] p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[var(--bm-intel-bd)] bg-[var(--bm-intel-dim)]">
          <Icon size={12} color="var(--bm-intel2)" />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--bm-text4)]">Coach action</div>
          <div className="truncate text-[12.5px] font-semibold text-[var(--bm-text)]">{sanitizeOutput(result.title)}</div>
        </div>
      </div>

      {result.stats && result.stats.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {result.stats.map((s) => (
            <div key={s.label} className="rounded-[var(--r-sm)] border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-2.5 py-2">
              <div className="font-mono text-[15px] font-bold leading-none text-[var(--bm-text)]">{sanitizeOutput(s.value)}</div>
              <div className="mt-1 text-[10px] text-[var(--bm-text3)]">{sanitizeOutput(s.label)}</div>
            </div>
          ))}
        </div>
      )}

      {result.rows && result.rows.length > 0 && (
        <ul className="m-0 mb-3 flex list-none flex-col gap-1.5 p-0">
          {result.rows.map((row, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-[var(--r-sm)] border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-2.5 py-2">
              <div className="min-w-0">
                <div className="text-[12px] leading-snug text-[var(--bm-text2)]">{sanitizeOutput(row.primary)}</div>
                {row.secondary && <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--bm-text3)]">{sanitizeOutput(row.secondary)}</div>}
                {row.detail && <div className="mt-1 text-[10.5px] leading-snug text-[var(--bm-intel2)]">{sanitizeOutput(row.detail)}</div>}
              </div>
              {row.badge && (
                <span className="shrink-0 rounded-full border border-[var(--bm-border)] px-2 py-0.5 font-mono text-[9.5px] text-[var(--bm-text3)]">
                  {sanitizeOutput(row.badge)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {downloads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {downloads.map((d, i) => (
            <a
              key={d.href}
              href={d.href}
              download
              className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-2 text-[11.5px] font-semibold no-underline"
              style={
                i === 0
                  ? { background: "var(--bm-accent)", color: "#15130a" }
                  : { background: "transparent", color: "var(--bm-text2)", border: "1px solid var(--bm-border2)" }
              }
            >
              <Download size={12} />
              {sanitizeOutput(d.label)}
            </a>
          ))}
        </div>
      )}

      {result.note && <p className="m-0 mt-2.5 text-[11px] leading-relaxed text-[var(--bm-text4)]">{sanitizeOutput(result.note)}</p>}
    </div>
  );
}
