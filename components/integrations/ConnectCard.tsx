"use client";

import React from "react";

export type KeyApp = "stripe" | "github";

const COPY: Record<KeyApp, { name: string; reads: string[]; never: string; steps: string[]; placeholder: string }> = {
  stripe: {
    name: "Stripe",
    reads: ["Monthly recurring revenue", "Paying subscribers", "Payments in the last 30 days"],
    never: "BuildMind cannot charge, refund or change anything. It accepts only a read-only restricted key.",
    steps: [
      "In Stripe, open Developers, then API keys, then Create restricted key.",
      "Set Subscriptions to Read and Charges to Read. Leave everything else as None.",
      "Copy the key. It starts with rk_live_ (or rk_test_ for test mode).",
    ],
    placeholder: "rk_live_...",
  },
  github: {
    name: "GitHub",
    reads: ["Commits in the last 30 days", "Titles of merged pull requests"],
    never: "BuildMind cannot write code, open pull requests or see any other repository.",
    steps: [
      "In GitHub, open Settings, Developer settings, Fine-grained tokens, Generate new token.",
      "Choose Only select repositories and pick the one repository.",
      "Set Contents to Read and Pull requests to Read. Copy the token (starts with github_pat_).",
    ],
    placeholder: "github_pat_...",
  },
};

const label: React.CSSProperties = { fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--bm-text3)" };
const small: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--bm-text3)", lineHeight: "var(--leading-normal)", margin: 0 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 10px", color: "var(--bm-text)", fontFamily: "inherit", fontSize: "var(--text-sm)" };
const btn = (primary = false): React.CSSProperties => ({ fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "6px 12px", border: `1px solid ${primary ? "var(--bm-text)" : "var(--bm-border2)"}`, background: primary ? "var(--bm-text)" : "transparent", color: primary ? "var(--bm-bg)" : "var(--bm-text2)" });

interface Props { app: KeyApp; onConnected: () => void; onCancel?: () => void }

/**
 * Connect a read-only app without leaving the page. States the exact access,
 * tests the key against the real service, and shows what was found before
 * anything is relied on.
 */
export default function ConnectCard({ app, onConnected, onCancel }: Props) {
  const c = COPY[app];
  const [key, setKey] = React.useState("");
  const [repo, setRepo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [found, setFound] = React.useState<Array<{ label: string; value: string }> | null>(null);

  async function test() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/integrations/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: app, key, repo: app === "github" ? repo : undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) setError(j.error ?? "Could not connect.");
      else { setKey(""); setFound(j.found ?? []); }
    } catch { setError("Could not reach BuildMind."); }
    setBusy(false);
  }

  if (found) {
    return (
      <div style={{ display: "grid", gap: 8, border: "1px solid var(--bm-border)", borderRadius: 10, padding: "10px 12px" }}>
        <div style={label}>{c.name} connected. This is what BuildMind found:</div>
        {found.map((f) => <div key={f.label} style={{ fontSize: "var(--text-sm)", color: "var(--bm-text)" }}>{f.label}: <strong>{f.value}</strong></div>)}
        <div><button type="button" style={btn(true)} onClick={onConnected}>Rewrite my draft with this</button></div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, border: "1px solid var(--bm-border)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={label}>Connect {c.name}, read-only</div>
      <p style={small}>BuildMind reads: {c.reads.join(", ")}. {c.never}</p>
      <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 2 }}>{c.steps.map((s) => <li key={s} style={small}>{s}</li>)}</ol>
      {app === "github" && <input style={input} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repository" aria-label="Repository" autoComplete="off" spellCheck={false} />}
      <input style={input} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={c.placeholder} aria-label={`${c.name} key`} autoComplete="off" spellCheck={false} />
      <p style={small}>The key is tested first, then stored encrypted. You can remove it any time in Settings.</p>
      {error && <p style={{ ...small, color: "var(--bm-text)" }} role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={btn(true)} disabled={busy || key.trim().length < 10 || (app === "github" && !repo.includes("/"))} onClick={test}>{busy ? "Testing…" : "Test and connect"}</button>
        {onCancel && <button type="button" style={btn()} onClick={onCancel}>Not now</button>}
      </div>
    </div>
  );
}
