"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RadarItemCard from "@/components/radar/RadarItemCard";
import type { RadarView } from "@/lib/radar/store";

export default function RadarToday({ projectId }: { projectId?: string | null }) {
  const [items, setItems] = useState<RadarView[] | null>(null);
  const [setup, setSetup] = useState(false);
  const load = useCallback(() => {
    let where = ""; try { where = localStorage.getItem("bm_radar_where") ?? ""; } catch { /* ignore */ }
    const q = new URLSearchParams({ today: "1", ...(projectId ? { projectId } : {}), ...(where ? { where } : {}) });
    fetch(`/api/radar?${q}`).then((r) => r.json()).then((b) => { setItems(b.items ?? []); setSetup(b.reason === "setup"); }).catch(() => setItems([]));
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (items === null) return null;
  const head = { fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--bm-accent)", margin: 0 } as const;
  if (!items.length) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", border: "1px dashed var(--bm-border2)", borderRadius: "var(--mood-radius, 10px)" }}>
        <p style={{ ...head, color: "var(--bm-text2)", fontWeight: 600 }}>{setup ? "Radar needs the latest database migration." : "Radar: nothing worth your time this week."}</p>
        <Link href="/radar" style={{ marginLeft: "auto", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--bm-accent)", textDecoration: "none" }}>Add a hackathon, grant, event or person →</Link>
      </div>
    );
  }
  return (
    <section style={{ display: "grid", gap: 8 }} aria-label="Worth your time">
      <div style={{ display: "flex", alignItems: "center" }}><p style={head}>Worth your time</p><Link href="/radar" style={{ marginLeft: "auto", fontSize: "var(--text-sm)", color: "var(--bm-text3)", textDecoration: "none" }}>All of Radar →</Link></div>
      {items.map((i) => <RadarItemCard key={i.id} item={i} compact onChange={load} />)}
    </section>
  );
}
