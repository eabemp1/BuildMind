"use client";
import { useState } from "react";
import PreparedWork from "@/components/today/PreparedWork";
import Link from "next/link";
import { agentFor, stepActions } from "@/lib/break/stepIntent";

const AGENT_LABEL = { competitor: "Send the competitor agent", research: "Send the research agent", validation: "Send the validation agent" } as const;

/** Buttons under a step that open the BuildMind tool that does the step. Renders nothing when no tool fits. */
export default function StepActions({ step, idea, projectId }: { step: string; idea?: string; projectId?: string | null }) {
  const actions = stepActions(step);
  const [open, setOpen] = useState<string | null>(null);
  const agent = agentFor(step);
  if (!actions.length && !agent) return null;
  const current = actions.find((a) => a.id === open);
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {actions.map((a) => (
          <button key={a.id} type="button" aria-pressed={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}
            style={{ minHeight: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--bm-accent-bd)", background: open === a.id ? "var(--bm-accent-dim)" : "transparent", color: "var(--bm-accent)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>{a.label}</button>
        ))}
        {agent && (
          <Link href={`/agents?agent=${agent}`}
            style={{ minHeight: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            {AGENT_LABEL[agent]}
          </Link>
        )}
      </div>
      {current && <PreparedWork key={current.id} task={current.task} projectId={projectId ?? null} idea={projectId ? undefined : idea} />}
    </div>
  );
}
