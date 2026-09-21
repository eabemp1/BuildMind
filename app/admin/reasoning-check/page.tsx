"use client";

import { useState } from "react";

/**
 * app/admin/reasoning-check/page.tsx
 *
 * A mobile-usable way to hit the pre-existing /api/ai/provider-test route
 * (POST-only, so it was previously only triggerable via dev console or
 * curl — unusable from a phone). That route already tests the exact
 * "reasoning" chain role Today's action generation depends on, with a
 * realistic 120-token budget — unlike lib/ai-providers.ts's own
 * checkAllProviders(), which used an 8-token budget and produced false
 * negatives on reasoning-capable models. This page adds nothing new
 * server-side; it's purely a tappable front end for a route that already
 * existed. Auth is enforced by that route itself (401/403 if not an
 * admin), so this page doesn't duplicate that check.
 */
export default function ReasoningCheckPage() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function run() {
    setLoading(true);
    setError("");
    setResult(null);
    fetch("/api/ai/provider-test", { method: "POST" })
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? "Request failed");
        setResult(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", fontFamily: "monospace", fontSize: 13, color: "#e8eaf0", background: "#0a0e1a", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>Reasoning chain check</h1>
      <p style={{ color: "#8b93a8", marginBottom: 24 }}>
        Tests the exact chain Today's action generation uses, with a realistic token budget (120) — not the 8-token
        health check, which can false-negative on reasoning models.
      </p>

      <button
        onClick={run}
        disabled={loading}
        style={{
          padding: "10px 16px", fontFamily: "monospace", fontSize: 13,
          background: loading ? "#1a1f2e" : "#1e293b", color: "#e8eaf0",
          border: "1px solid #334155", borderRadius: 6, cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Testing…" : "Test reasoning chain"}
      </button>

      {error && <p style={{ color: "#e24b4a", marginTop: 16 }}>{error}</p>}

      {result && (
        <pre style={{ marginTop: 16, color: "#8b93a8", whiteSpace: "pre-wrap", background: "#111827", padding: 12, borderRadius: 6 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
