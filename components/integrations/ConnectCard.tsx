"use client";

import React from "react";
import { parseRepo } from "@/lib/integrations/github";

export type KeyApp = "stripe" | "github";

const COPY: Record<KeyApp, { name: string; who: string; link: { href: string; text: string }; reads: string[]; never: string; steps: string[]; placeholder: string }> = {
  stripe: {
    name: "Stripe",
    who: "Only if you take payments with Stripe. If you do not, skip this.",
    link: { href: "https://dashboard.stripe.com/apikeys/create", text: "Open Stripe's key page" },
    reads: ["Monthly recurring revenue", "Paying subscribers", "Payments in the last 30 days"],
    never: "BuildMind cannot charge, refund or change anything. It accepts only a read-only restricted key.",
    steps: [
      "Open the Stripe page below, and name the key BuildMind.",
      "Set Subscriptions to Read and Charges to Read. Leave everything else as None.",
      "Copy the key. It starts with rk_live_ (or rk_test_ for test mode).",
    ],
    placeholder: "rk_live_...",
  },
  github: {
    name: "GitHub",
    who: "Only if your project's code is on GitHub. If you do not code, skip this.",
    link: { href: "https://github.com/settings/personal-access-tokens/new", text: "Open GitHub's token page" },
    reads: ["Commits in the last 30 days", "Titles of merged pull requests"],
    never: "BuildMind cannot write code, open pull requests or see any other repository.",
    steps: [
      "Open the GitHub page below, and name the token BuildMind. Pick an expiry (90 days is fine).",
      "Under Repository access choose Only select repositories, then pick your project.",
      "Under Permissions set Contents to Read-only and Pull requests to Read-only. Click Generate token, copy it, and paste it below.",
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
      <p style={small}>{c.who}</p>
      <p style={small}>BuildMind reads: {c.reads.join(", ")}. {c.never}</p>
      <ol style={{ margin: 0, paddingLeft: 18, listStyleType: "decimal" }}>{c.steps.map((s) => <li key={s} style={{ ...small, marginBottom: 2 }}>{s}</li>)}</ol>
      <a href={c.link.href} target="_blank" rel="noopener noreferrer" style={{ ...small, color: "var(--bm-accent)", fontWeight: 600, textDecoration: "none" }}>{c.link.text} ↗</a>
      {app === "github" && <input style={input} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="Address of your project, e.g. https://github.com/you/project" aria-label="Repository address" autoComplete="off" spellCheck={false} />}
      <input style={input} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={c.placeholder} aria-label={`${c.name} key`} autoComplete="off" spellCheck={false} />
      <p style={small}>The key is tested first, then stored encrypted. You can remove it any time in Settings.</p>
      {error && <p style={{ ...small, color: "var(--bm-text)" }} role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={btn(true)} disabled={busy || key.trim().length < 10 || (app === "github" && !parseRepo(repo))} onClick={test}>{busy ? "Testing…" : "Test and connect"}</button>
        {onCancel && <button type="button" style={btn()} onClick={onCancel}>Skip for now</button>}
      </div>
    </div>
  );
}
