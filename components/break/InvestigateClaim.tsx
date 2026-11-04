"use client";

/**
 * components/break/InvestigateClaim.tsx — "Check this claim" under a claim or assumption.
 * Sends the matching agent to look for sources on that one claim (Builder plan). The result is
 * saved, each finding can be confirmed or rejected, and a confirmed, well-sourced finding changes
 * how the claim is labelled and what the next stress test starts from.
 */

import { useState } from "react";
import Link from "next/link";
import { usePlan } from "@/lib/usePlan";
import { agentForClaim, canInvestigate, investigateBody, type InvestigateContext } from "@/lib/break/investigate";
import { findCheck, settledStatus, type SavedCheck } from "@/lib/break/claimChecks";
import { CLAIM_STATUS_LABEL, TIER_LABEL, type ClaimStatus } from "@/lib/evidence";
import { Chip, bodyText, smallText } from "@/components/break-my-startup/ui";

const STATUS_COLOR: Record<ClaimStatus, string> = {
  supported: "var(--bm-green)", contradicted: "var(--bm-red)", mixed: "var(--bm-amber)", unverified: "var(--bm-text3)",
};
const AGENT_NAME: Record<string, string> = { competitor: "competitor agent", research: "research agent", validation: "validation agent" };

export function InvestigateClaim({ claim, ctx }: { claim: string; ctx?: InvestigateContext }) {
  const { plan } = usePlan();
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<SavedCheck | null>(null);
  if (!ctx || !canInvestigate(claim, ctx)) return null;
  const check = findCheck(ctx.checks, claim) ?? local;
  const agent = agentForClaim(claim);

  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/agents/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(investigateBody(claim, ctx as InvestigateContext)) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(res.status === 403 ? "Checking a claim needs the Builder plan." : (json?.error ?? "The check did not finish. Try again."));
      if (!json.check) throw new Error("The check finished but could not be saved. Try again.");
      setLocal(json.check as SavedCheck);
      ctx?.onCheck?.(json.check as SavedCheck);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check did not finish. Try again.");
    } finally { setBusy(false); }
  }

  async function review(findingId: string, confirmed: boolean) {
    if (!check) return;
    setReviewing(findingId); setError(null);
    try {
      const res = await fetch("/api/agents/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ findingId, confirmed }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not save your answer. Try again.");
      setLocal((c) => c ? { ...c, findings: c.findings.map((f) => f.id === findingId ? { ...f, confirmed } : f) } : c);
      ctx?.onReview?.(check.runId, findingId, confirmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your answer. Try again.");
    } finally { setReviewing(null); }
  }

  if (plan === "free" && !check) {
    return <Link href="/upgrade" style={{ ...smallText, fontSize: 12.5, color: "var(--bm-accent)" }}>Check this against sources (Builder plan)</Link>;
  }

  const settled = settledStatus(check ?? undefined);
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      {!check && (
        <button type="button" onClick={run} disabled={busy}
          style={{ justifySelf: "start", minHeight: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--bm-accent-bd)", background: "transparent", color: "var(--bm-accent)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Checking against sources. This can take a minute or two." : `Check this with the ${AGENT_NAME[agent]}`}
        </button>
      )}
      {error && <p role="alert" style={{ ...smallText, color: "var(--bm-red)" }}>{error}</p>}
      {check && (
        <div style={{ display: "grid", gap: 8, border: "1px solid var(--bm-border)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Chip color={STATUS_COLOR[check.status]}>{CLAIM_STATUS_LABEL[check.status]}</Chip>
            {settled && <Chip color={STATUS_COLOR[settled]}>You confirmed it</Chip>}
            <span style={{ ...smallText, fontSize: 12 }}>Checked by the {AGENT_NAME[check.agentType] ?? "agent"}. Sources found by search are not proof; talk to customers to settle it.</span>
          </div>
          {check.status === "unverified" && <p style={bodyText}>Nothing solid turned up with enough independent sources. That does not mean the claim is false.</p>}
          {check.findings.slice(0, 4).map((f) => (
            <div key={f.id} style={{ display: "grid", gap: 2 }}>
              <p style={{ ...bodyText, color: "var(--bm-text)", fontSize: 13.5, fontWeight: 600 }}>{f.positive ? "For" : "Against"}: {f.title} <span style={{ ...smallText, fontSize: 11.5 }}>({TIER_LABEL[f.tier]})</span></p>
              <p style={{ ...bodyText, fontSize: 13 }}>{f.evidence}</p>
              {f.counter_evidence && <p style={{ ...smallText, fontSize: 12 }}>Against this: {f.counter_evidence}</p>}
              {f.sources.slice(0, 3).map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ ...smallText, fontSize: 12, color: "var(--bm-accent)", overflowWrap: "anywhere" }}>{u}</a>
              ))}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                {f.confirmed === null ? (
                  <>
                    <button type="button" disabled={reviewing === f.id} onClick={() => review(f.id, true)} style={reviewBtn}>I agree with this</button>
                    <button type="button" disabled={reviewing === f.id} onClick={() => review(f.id, false)} style={reviewBtn}>I do not agree</button>
                  </>
                ) : (
                  <span style={{ ...smallText, fontSize: 12 }}>{f.confirmed ? "You agreed with this." : "You did not agree with this."}</span>
                )}
              </div>
            </div>
          ))}
          {check.findings.some((f) => f.confirmed === null) && <p style={{ ...smallText, fontSize: 12 }}>Only findings you agree with, and that rest on enough sources, change how this claim is labelled.</p>}
        </div>
      )}
    </div>
  );
}

const reviewBtn: React.CSSProperties = { minHeight: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--bm-border2)", background: "transparent", color: "var(--bm-text2)", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" };
