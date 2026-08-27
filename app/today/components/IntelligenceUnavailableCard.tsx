"use client";

/**
 * app/today/components/IntelligenceUnavailableCard.tsx
 *
 * Shown only when aiFetchFailed is true — i.e. both the SSE stream and the
 * JSON fallback in the Today generation effect genuinely failed to
 * produce a real action. Before this, that failure was completely silent:
 * actionData quietly fell back to STATIC_ACTIONS with isAI:false, and the
 * only visible trace was a small italic "Baseline objective" label. This
 * makes the failure visible and gives the founder three real options,
 * none of them invented:
 *   - Retry connection    → re-runs the same generation effect
 *   - Use last recommendation → only rendered if a real (isAI:true) action
 *     actually succeeded earlier this session (lastGoodActionRef); no
 *     fabricated fallback data
 *   - Continue with today's baseline task → dismisses this card and shows
 *     the same static fallback task that was always the safety net
 */

interface Props {
  lastSuccessAt: number | null; // ms epoch, from bm_today_action_cache_ts_* — real, not invented
  hasLastRecommendation: boolean;
  onRetry: () => void;
  onUseLastRecommendation: () => void;
  onContinueBaseline: () => void;
  projectId?: string;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function IntelligenceUnavailableCard({
  lastSuccessAt,
  hasLastRecommendation,
  onRetry,
  onUseLastRecommendation,
  onContinueBaseline,
  projectId,
}: Props) {
  return (
    <div
      style={{
        background: "var(--bm-bg2)",
        border: "1px solid var(--bm-border)",
        borderRadius: "var(--r-xl)",
        padding: "40px 24px",
        textAlign: "center",
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 10 }}>⚠️</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 8px" }}>
        Intelligence temporarily unavailable
      </h3>
      <p style={{ fontSize: 12.5, color: "var(--bm-text3)", maxWidth: 360, margin: "0 auto 6px", lineHeight: 1.6 }}>
        BuildMind couldn&apos;t generate today&apos;s recommendation. Your data and progress are safe.
      </p>
      {lastSuccessAt && (
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, color: "var(--bm-text4)", margin: "0 0 18px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Last successful recommendation: {timeAgo(lastSuccessAt)}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 22, flexWrap: "wrap" }}>
        <button
          onClick={onRetry}
          style={{
            padding: "8px 16px", borderRadius: "var(--r-lg)", border: "none",
            background: "var(--bm-accent)", color: "#151109", fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Retry connection
        </button>
        {hasLastRecommendation && (
          <button
            onClick={onUseLastRecommendation}
            style={{
              padding: "8px 16px", borderRadius: "var(--r-lg)", border: "1px solid var(--bm-border2)",
              background: "transparent", color: "var(--bm-text2)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Use last recommendation
          </button>
        )}
      </div>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
        While intelligence is unavailable, you can:
      </p>
      <div style={{ maxWidth: 300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={onContinueBaseline}
          style={{
            textAlign: "left", padding: "9px 12px", borderRadius: "var(--r-lg)",
            border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", color: "var(--bm-text2)",
            fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          🎯 Continue with today&apos;s baseline task
        </button>
        <a
          href="/progress"
          style={{
            textAlign: "left", padding: "9px 12px", borderRadius: "var(--r-lg)",
            border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", color: "var(--bm-text2)",
            fontSize: 11.5, textDecoration: "none",
          }}
        >
          📈 Review recent outcomes
        </a>
        {projectId && (
          <a
            href={`/projects/${projectId}`}
            style={{
              textAlign: "left", padding: "9px 12px", borderRadius: "var(--r-lg)",
              border: "1px solid var(--bm-border)", background: "var(--bm-bg3)", color: "var(--bm-text2)",
              fontSize: 11.5, textDecoration: "none",
            }}
          >
            📎 Update project context
          </a>
        )}
      </div>
    </div>
  );
}
