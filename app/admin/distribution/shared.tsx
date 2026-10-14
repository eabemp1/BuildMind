"use client";
import React from "react";
import { C } from "@/app/admin/components/ui";

export type Kind = "drafts" | "conversations" | "experiments";

export async function api<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown): Promise<T & { ok: boolean; error?: string }> {
  try {
    const r = await fetch(`/api/admin/distribution/${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    return await r.json();
  } catch {
    return { ok: false, error: "Network error" } as never;
  }
}

export const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "7px 9px", background: C.bg3, border: `1px solid ${C.b}`, borderRadius: C.rMd, color: C.t, font: "inherit", fontSize: 13 };

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 11, color: C.t3, marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 10.5, color: C.t4, marginTop: 3 }}>{hint}</span>}
    </label>
  );
}

export function Btn({ children, onClick, disabled, kind = "ghost", small }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; kind?: "primary" | "ghost" | "danger"; small?: boolean }) {
  const col = kind === "primary" ? C.bg : kind === "danger" ? C.red : C.t2;
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: small ? "4px 9px" : "7px 13px", fontSize: small ? 11.5 : 12.5, fontWeight: 600, fontFamily: "inherit", borderRadius: C.rMd, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, color: col, background: kind === "primary" ? C.a : "transparent", border: `1px solid ${kind === "primary" ? C.a : kind === "danger" ? C.red : C.b2}` }}>{children}</button>
  );
}

export function Chip({ children, color = C.t3 }: { children: React.ReactNode; color?: string }) {
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color, border: `1px solid ${color}`, borderRadius: 4, padding: "0 5px", whiteSpace: "nowrap" }}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: C.t3, padding: "10px 0", lineHeight: 1.55 }}>{children}</div>;
}

export function Copy({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return <Btn small onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }}>{done ? "Copied" : "Copy"}</Btn>;
}

export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
