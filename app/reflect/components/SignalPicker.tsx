"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SIGNAL_KINDS, SIGNAL_LABELS, type SignalKind } from "@/lib/outcomeSignal";

export type SignalValue = { kind: SignalKind | null; count: number; proof?: string };

/**
 * "Did it produce anything?" - the structured outcome the learning loop scores advice against.
 * Optional: skipping it falls back to comparing the words you wrote.
 */
export function SignalPicker({ value, onChange }: { value: SignalValue; onChange: (value: SignalValue) => void }) {
  const kind = value.kind;
  const [redditNote, setRedditNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const isReddit = /^https:\/\/([a-z]+\.)?reddit\.com\/\S*comments\//i.test((value.proof ?? "").trim());
  async function checkReddit() {
    setChecking(true); setRedditNote(null);
    try {
      const r = await fetch("/api/proof/reddit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value.proof }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) setRedditNote(j.error ?? "Could not check that.");
      else if (j.status === "verified") setRedditNote(`Confirmed as your post. ${j.count} other ${j.count === 1 ? "person has" : "people have"} commented. BuildMind will count them when you save.`);
      else if (j.status === "needs_code") setRedditNote(`To prove the post is yours, comment ${j.code} on it from your account, then check again. You can delete the comment afterwards only after saving.`);
      else setRedditNote("Reddit did not answer from our side. Your link is still saved as proof.");
    } catch { setRedditNote("Could not reach the server."); }
    setChecking(false);
  }
  return (
    <Card variant="data" className="mb-5 rounded-[var(--r-xl)] p-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--bm-text3)]">What did it produce?</p>
        <p className="text-xs text-[var(--bm-text3)]">Optional · only proven results count</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="What the task produced">
        {SIGNAL_KINDS.map((k) => {
          const on = kind === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ kind: on ? null : k, count: k === "none" ? 0 : Math.max(1, value.count || 1), proof: value.proof })}
              className="min-h-9 rounded-[var(--r-md)] border px-3 text-sm transition-colors"
              style={{
                borderColor: on ? "var(--bm-accent)" : "var(--bm-border)",
                background: on ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
                color: on ? "var(--bm-accent)" : "var(--bm-text3)",
                fontWeight: on ? 700 : 400,
              }}
            >
              {SIGNAL_LABELS[k]}
            </button>
          );
        })}
      </div>
      {kind && kind !== "none" && (
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--bm-text3)]">
          How many?
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={value.count}
            onChange={(e) => onChange({ kind, count: Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))), proof: value.proof })}
            className="h-9 w-20 rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-2 text-sm text-[var(--bm-text)]"
          />
        </label>
      )}
      {kind && kind !== "none" && (
        <div className="mt-3">
          <label className="block text-sm text-[var(--bm-text3)]" htmlFor="signal-proof">
            Proof <span className="text-[var(--bm-text4)]">· a link to it, or paste the reply</span>
          </label>
          <textarea
            id="signal-proof"
            rows={2}
            maxLength={2000}
            value={value.proof ?? ""}
            onChange={(e) => onChange({ kind, count: value.count, proof: e.target.value })}
            placeholder="https://... or the text of the reply"
            className="mt-1.5 w-full rounded-[var(--r-md)] border border-[var(--bm-border)] bg-[var(--bm-bg2)] px-2.5 py-2 text-sm text-[var(--bm-text)]"
          />
          {isReddit && (
            <div className="mt-2">
              <button type="button" onClick={checkReddit} disabled={checking} className="min-h-9 rounded-[var(--r-md)] border border-[var(--bm-border)] px-3 text-sm text-[var(--bm-text2)]">
                {checking ? "Checking..." : "Check this Reddit post"}
              </button>
              {redditNote && <p role="status" className="mt-1.5 text-xs leading-relaxed text-[var(--bm-text2)]">{redditNote}</p>}
            </div>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--bm-text3)]">
            Without proof this is saved as unverified and does not change your accuracy. Visits and signups from your tracked links and Stripe payments are counted automatically.
          </p>
        </div>
      )}
    </Card>
  );
}
