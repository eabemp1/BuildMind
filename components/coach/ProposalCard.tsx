"use client";

/**
 * A change the coach proposes. Nothing is written until the founder taps the button; the server re-checks ownership.
 */

import { useState } from "react";
import type { ProposalCard as Card, Undo } from "@/lib/coachWrites/server";
import { sanitizeOutput } from "@/lib/sanitizeOutput";

type State = { s: "idle" } | { s: "busy" } | { s: "done"; message: string; undo?: Undo } | { s: "undone"; message: string } | { s: "error"; message: string } | { s: "dismissed" };

export function ProposalCard({ card, projectId }: { card: Card; projectId: string }) {
  const [state, setState] = useState<State>({ s: "idle" });

  async function confirm(proposal: Card["proposal"]) {
    setState({ s: "busy" });
    try {
      const res = await fetch("/api/ai/coach/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, proposal }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.success) throw new Error(j?.error ?? "Couldn't do that.");
      setState({ s: "done", message: String(j.message ?? "Done."), undo: j.undo });
    } catch (e) {
      setState({ s: "error", message: e instanceof Error ? e.message : "Couldn't do that." });
    }
  }

  async function takeBack(undo: Undo) {
    try {
      const res = await fetch("/api/ai/coach/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo }) });
      const j = await res.json().catch(() => ({}));
      setState({ s: "undone", message: String(j?.message ?? j?.error ?? "Couldn't undo that.") });
    } catch { setState({ s: "undone", message: "Couldn't undo that." }); }
  }

  if (state.s === "dismissed") return <p className="mt-2 text-xs text-muted-foreground">Cancelled. Nothing was changed.</p>;
  if (state.s === "undone") return <p className="mt-2 text-sm text-muted-foreground">{sanitizeOutput(state.message)}</p>;
  if (state.s === "done") {
    const undo = state.undo;
    return (
      <p className="mt-2 text-sm">
        {sanitizeOutput(state.message)}
        {undo ? <button onClick={() => takeBack(undo)} className="ml-2 text-muted-foreground underline underline-offset-2 hover:text-foreground">Undo</button> : null}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg bg-muted/50 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{sanitizeOutput(card.heading)}</p>
      <p className="mt-1 text-sm">{sanitizeOutput(card.detail)}</p>
      {card.choices ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {card.choices.map((c) => (
            <button
              key={c.taskId}
              disabled={state.s === "busy"}
              onClick={() => confirm({ ...(card.proposal as Extract<Card["proposal"], { kind: "set_task" }>), taskId: c.taskId })}
              className="rounded-md bg-background px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
            >
              {sanitizeOutput(c.title)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        {!card.choices && (
          <button
            disabled={state.s === "busy"}
            onClick={() => confirm(card.proposal)}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-60"
          >
            {state.s === "busy" ? "Working…" : card.confirmLabel}
          </button>
        )}
        <button onClick={() => setState({ s: "dismissed" })} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
      {state.s === "error" && <p className="mt-2 text-xs text-destructive">{sanitizeOutput(state.message)}</p>}
    </div>
  );
}
