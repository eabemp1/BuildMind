"use client";

import { useEffect, useState } from "react";

interface Check {
  label: string;
  healthy?: boolean | null;
  note?: string | null;
  [key: string]: unknown;
}

export default function HealthCheckPage() {
  const [data, setData] = useState<{ generatedAt: string; checks: Record<string, Check> } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/health-check")
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error ?? "Failed to load");
        setData(json);
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div style={{ padding: 24, color: "#e24b4a" }}>{error}</div>;
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", fontFamily: "monospace", fontSize: 13, color: "#e8eaf0", background: "#0a0e1a", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>Core loop health check</h1>
      <p style={{ color: "#8b93a8", marginBottom: 24 }}>Generated {new Date(data.generatedAt).toLocaleString()}</p>

      {Object.entries(data.checks).map(([key, check]) => (
        <div key={key} style={{ borderBottom: "1px solid #232a3d", padding: "14px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span>{check.label}</span>
            {check.healthy === true && <span style={{ color: "#4ade80" }}>healthy</span>}
            {check.healthy === false && <span style={{ color: "#e24b4a" }}>needs attention</span>}
            {check.healthy == null && <span style={{ color: "#8b93a8" }}>no data yet</span>}
          </div>
          <pre style={{ marginTop: 6, color: "#8b93a8", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(
              Object.fromEntries(Object.entries(check).filter(([k]) => !["label", "healthy", "note"].includes(k))),
              null, 2,
            )}
          </pre>
          {check.note && <p style={{ color: "#fb923c", marginTop: 4 }}>{check.note}</p>}
        </div>
      ))}
    </div>
  );
                                    }
