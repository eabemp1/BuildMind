/** Public read-only view of a shared Break My Startup result. */
import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { readSharePayload, SEVERITY_HEX, shareHeadline } from "@/lib/breakShare";

export const dynamic = "force-dynamic";
const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

async function load(token: string) {
  const t = token.replace(/[^a-f0-9]/gi, "").slice(0, 32);
  if (!t) return null;
  const { data } = await createAdminClient().from("break_shares").select("payload,revoked_at").eq("token", t).maybeSingle();
  return data && !data.revoked_at ? readSharePayload(data.payload) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const p = await load(token);
  if (!p) return { title: "Break My Startup", robots: { index: false } };
  const img = `${base}/api/card/break?token=${token}`;
  return {
    title: `${p.idea} · Break My Startup`, description: shareHeadline(p), robots: { index: false },
    openGraph: { title: shareHeadline(p), description: p.summary, images: [img] },
    twitter: { card: "summary_large_image", title: shareHeadline(p), images: [img] },
  };
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await load(token);
  if (!p) notFound();
  const col = p.score === null ? "#E8C547" : p.score >= 60 ? "#5CC592" : p.score >= 35 ? "#E8A54A" : "#E8706A";
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px", color: "#F2EFE6", background: "#09090A", minHeight: "100vh" }}>
      <p style={{ fontSize: 12, letterSpacing: 2, color: "#8B8774" }}>BREAK MY STARTUP</p>
      <h1 style={{ fontSize: 28, margin: "8px 0 16px" }}>{p.idea}</h1>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 64, fontWeight: 800, color: col }}>{p.score ?? "—"}{p.score !== null ? "%" : ""}</span>
        <span style={{ color: "#8B8774" }}>survival odds · {p.risk} risk</span>
      </div>
      <p style={{ color: "#B9B5A5", lineHeight: 1.6 }}>{p.summary}</p>
      {p.signals.length > 0 && (
        <section style={{ margin: "20px 0" }}>
          {p.signals.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0", fontSize: 13 }}>
              <span style={{ width: 110, color: "#8B8774" }}>{s.label}</span>
              <div style={{ flex: 1, height: 8, background: "#1c1c1a", borderRadius: 4 }}><div style={{ width: `${s.value}%`, height: 8, borderRadius: 4, background: col }} /></div>
              <span style={{ width: 28, textAlign: "right" }}>{s.value}</span>
            </div>
          ))}
        </section>
      )}
      <h2 style={{ fontSize: 16 }}>Top risks</h2>
      {p.risks.map((r, i) => (
        <div key={i} style={{ borderLeft: `3px solid ${SEVERITY_HEX[r.severity] ?? "#8B8774"}`, padding: "4px 12px", margin: "10px 0" }}>
          <strong>{r.category}</strong> <span style={{ color: "#8B8774", fontSize: 12 }}>{r.severity}</span>
          <div style={{ color: "#B9B5A5", fontSize: 14 }}>{r.text}</div>
        </div>
      ))}
      {p.pivot && <p style={{ color: "#E8C547" }}>Best pivot: <strong>{p.pivot.title}</strong> — {p.pivot.why}</p>}
      <a href="/break" style={{ display: "inline-block", marginTop: 24, padding: "12px 20px", borderRadius: 10, background: "#E8C547", color: "#09090A", fontWeight: 700, textDecoration: "none" }}>Break your own idea</a>
    </main>
  );
}
