"use client";

/**
 * components/break/InvestigateClaim.tsx — "Check this claim" under a claim or assumption.
 * Sends the matching agent to look for sources on that one claim (Builder plan).
 * Shows what it found, with its sources, and says plainly when it found nothing solid.
 */

import { useState } from "react";
import Link from "next/link";
import { usePlan } from "@/lib/usePlan";
import { agentForClaim, canInvestigate, investigateBody, type InvestigateContext } from "@/lib/break/investigate";
import { CLAIM_STATUS_LABEL, TIER_LABEL, classifyFinding, type ClaimStatus } from "@/lib/evidence";
import { Chip, bodyText, smallText } from "@/components/break-my-startup/ui";

interface Finding { title: string; evidence: string; positive: boolean; confidence: number; sources?: string[]; counter_evidence?: string | null; source_type?: string; signal_type?: string }
interface Outcome { status: ClaimStatus; findings: Finding[]; agent: string }

const STATUS_COLOR: Record<ClaimStatus, string> = {
  supported: "var(--bm-green)", contradicted: "var(--bm-red)", mixed: "var(--bm-amber)", unverified: "var(--bm-text3)",
};
const AGENT_NAME = { competitor: "competitor agent", research: "research agent", validation: "validation agent" } as const;

export function InvestigateClaim({ claim, ctx }: { claim: string; ctx?: InvestigateContext }) {
  const { plan } = usePlan();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome | null>(null);
  if (!ctx || !canInvestigate(claim, ctx)) return null;
  const agent = agentForClaim(claim);

  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/agents/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(investigateBody(claim, ctx as InvestigateContext)) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(res.status === 403 ? "Checking a claim needs the Builder plan." : (json?.error ?? "The check did not finish. Try again."));
      setOut({ status: (json.result?.claimStatus ?? "unverified") as ClaimStatus, findings: (json.result?.findings ?? []) as Finding[], agent });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check did not finish. Try again.");
    } finally { setBusy(false); }
  }

  if (plan === "free") {
    return <Link href="/upgrade" style={{ ...smallText, fontSize: 12.5, color: "var(--bm-accent)" }}>Check this against sources (Builder plan)</Link>;
  }

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      {!out && (
        <button type="button" onClick={run} disabled={busy}
          style={{ justifySelf: "start", minHeight: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--bm-accent-bd)", background: "transparent", color: "var(--bm-accent)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Checking against sources. This can take a minute or two." : `Check this with the ${AGENT_NAME[agent]}`}
        </button>
      )}
      {error && <p role="alert" style={{ ...smallText, color: "var(--bm-red)" }}>{error}</p>}
      {out && (
        <div style={{ display: "grid", gap: 8, border: "1px solid var(--bm-border)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Chip color={STATUS_COLOR[out.status]}>{CLAIM_STATUS_LABEL[out.status]}</Chip>
            <span style={{ ...smallText, fontSize: 12 }}>Checked by the {AGENT_NAME[out.agent as keyof typeof AGENT_NAME]}. Sources found by search are not proof; talk to customers to settle it.</span>
          </div>
          {out.status === "unverified" && <p style={bodyText}>Nothing solid turned up with enough independent sources. That does not mean the claim is false.</p>}
          {out.findings.slice(0, 4).map((f, i) => {
            const tier = classifyFinding({ ...f, signal_type: f.signal_type ?? "", source_type: f.source_type ?? "reasoning", evidence: f.evidence ?? "", confidence: f.confidence } as never).tier;
            return (
              <div key={`${i}-${f.title}`} style={{ display: "grid", gap: 2 }}>
                <p style={{ ...bodyText, color: "var(--bm-text)", fontSize: 13.5, fontWeight: 600 }}>{f.positive ? "For" : "Against"}: {f.title} <span style={{ ...smallText, fontSize: 11.5 }}>({TIER_LABEL[tier]})</span></p>
                <p style={{ ...bodyText, fontSize: 13 }}>{f.evidence}</p>
                {f.counter_evidence && <p style={{ ...smallText, fontSize: 12 }}>Against this: {f.counter_evidence}</p>}
                {(f.sources ?? []).slice(0, 3).map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ ...smallText, fontSize: 12, color: "var(--bm-accent)", overflowWrap: "anywhere" }}>{u}</a>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
