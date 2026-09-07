"use client";

import { useEffect, useState } from "react";

interface Diagnostics {
  configured: Record<"groq" | "cerebras" | "openrouter" | "gemini" | "mistral", boolean>;
  missingEnv: string[];
  chains: { fast: number; reasoning: number; fallback: number };
  note: string;
}

interface ProviderHealth {
  provider: string;
  model: string;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

/**
 * app/admin/ai-provider-status/page.tsx
 *
 * The UI checkAllProviders() (lib/ai-providers.ts) never had. Two
 * questions, kept visually separate because they're different questions:
 * "configured" (an env var is set) loads instantly and free on mount.
 * "actually reachable right now" (checkAllProviders) costs a handful of
 * real tokens per provider, so it's a manual button, not automatic —
 * same reasoning the API route's own header gives for making ?live=true
 * opt-in rather than the default.
 */
export default function AIProviderStatusPage() {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [live, setLive] = useState<ProviderHealth[] | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/ai-provider-status")
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed to load");
        setDiagnostics(json);
      })
      .catch((err) => setError(err.message));
  }, []);

  function runLiveCheck() {
    setLoadingLive(true);
    setError("");
    fetch("/api/admin/ai-provider-status?live=true")
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Failed to load");
        setDiagnostics(json);
        setLive(json.live);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingLive(false));
  }

  if (error) return <div style={{ padding: 24, color: "#e24b4a" }}>{error}</div>;
  if (!diagnostics) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", fontFamily: "monospace", fontSize: 13, color: "#e8eaf0", background: "#0a0e1a", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>AI provider status</h1>
      <p style={{ color: "#8b93a8", marginBottom: 24 }}>
        Configured loads free on mount. Live costs real tokens — run it on demand, not automatically.
      </p>

      <div style={{ borderBottom: "1px solid #232a3d", padding: "14px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Chains (role → provider count)</span>
        </div>
        <pre style={{ marginTop: 6, color: "#8b93a8", whiteSpace: "pre-wrap" }}>
          {JSON.stringify(diagnostics.chains, null, 2)}
        </pre>
        {diagnostics.chains.reasoning < 2 && (
          <p style={{ color: "#fb923c", marginTop: 4 }}>{diagnostics.note}</p>
        )}
      </div>

      {Object.entries(diagnostics.configured).map(([name, isConfigured]) => {
        const liveResult = live?.find((p) => p.provider === name);
        return (
          <div key={name} style={{ borderBottom: "1px solid #232a3d", padding: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span>{name}</span>
              {!isConfigured && <span style={{ color: "#8b93a8" }}>not configured</span>}
              {isConfigured && !live && <span style={{ color: "#8b93a8" }}>configured — reachability unknown</span>}
              {isConfigured && liveResult?.ok && <span style={{ color: "#4ade80" }}>reachable ({liveResult.latencyMs}ms)</span>}
              {isConfigured && live && liveResult && !liveResult.ok && <span style={{ color: "#e24b4a" }}>unreachable</span>}
            </div>
            {liveResult?.error && (
              <pre style={{ marginTop: 6, color: "#e24b4a", whiteSpace: "pre-wrap" }}>{liveResult.error}</pre>
            )}
          </div>
        );
      })}

      {diagnostics.missingEnv.length > 0 && (
        <p style={{ color: "#8b93a8", marginTop: 16 }}>
          Not configured: {diagnostics.missingEnv.join(", ")}
        </p>
      )}

      <button
        onClick={runLiveCheck}
        disabled={loadingLive}
        style={{
          marginTop: 20, padding: "10px 16px", fontFamily: "monospace", fontSize: 13,
          background: loadingLive ? "#1a1f2e" : "#1e293b", color: "#e8eaf0",
          border: "1px solid #334155", borderRadius: 6, cursor: loadingLive ? "default" : "pointer",
        }}
      >
        {loadingLive ? "Pinging every provider…" : live ? "Re-run live check" : "Run live check"}
      </button>
    </div>
  );
}
