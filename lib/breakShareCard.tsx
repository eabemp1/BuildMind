/** Satori-safe (flexbox, inline styles only) share card for Break My Startup. */
import React from "react";
import { SEVERITY_HEX, type BreakSharePayload } from "@/lib/breakShare";

export const BREAK_CARD = { w: 1200, h: 630 };

export function BreakCard({ p, logo }: { p: BreakSharePayload; logo?: string }) {
  const col = p.score === null ? "#E8C547" : p.score >= 60 ? "#5CC592" : p.score >= 35 ? "#E8A54A" : "#E8706A";
  const mono = "DM Mono";
  return (
    <div style={{ width: BREAK_CARD.w, height: BREAK_CARD.h, display: "flex", flexDirection: "column", background: "#09090A", color: "#F2EFE6", padding: 48, fontFamily: "Syne" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {logo ? <img src={logo} width={34} height={34} /> : null}
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700 }}>BuildMind</div>
        </div>
        <div style={{ display: "flex", fontFamily: mono, fontSize: 16, color: "#8B8774", letterSpacing: 2 }}>BREAK MY STARTUP</div>
      </div>
      <div style={{ display: "flex", flex: 1, marginTop: 28, gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 300, alignItems: "center", justifyContent: "center", background: "#141413", borderRadius: 24, border: `2px solid ${col}` }}>
          <div style={{ display: "flex", fontSize: 120, fontWeight: 800, color: col, lineHeight: 1 }}>{p.score === null ? "—" : `${p.score}`}</div>
          <div style={{ display: "flex", fontFamily: mono, fontSize: 16, color: "#8B8774", marginTop: 8 }}>SURVIVAL ODDS %</div>
          <div style={{ display: "flex", fontFamily: mono, fontSize: 15, marginTop: 14, padding: "4px 12px", borderRadius: 99, background: SEVERITY_HEX[p.risk] ?? col, color: "#09090A" }}>{p.risk.toUpperCase()} RISK</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 14 }}>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 800, lineHeight: 1.15 }}>{p.idea}</div>
          <div style={{ display: "flex", fontSize: 20, color: "#B9B5A5", lineHeight: 1.35 }}>{p.summary.slice(0, 200)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {p.risks.slice(0, 3).map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: SEVERITY_HEX[r.severity] ?? "#8B8774" }} />
                <div style={{ display: "flex", fontSize: 20, fontWeight: 700 }}>{r.category}</div>
                <div style={{ display: "flex", fontFamily: mono, fontSize: 14, color: "#8B8774" }}>{r.severity}</div>
              </div>
            ))}
          </div>
          {p.pivot ? (
            <div style={{ display: "flex", marginTop: "auto", fontSize: 18, color: "#E8C547" }}>{`Best pivot: ${p.pivot.title}`}</div>
          ) : null}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontFamily: mono, fontSize: 15, color: "#8B8774" }}>
        <div style={{ display: "flex" }}>Stress-test your idea at buildmind.live/break</div>
      </div>
    </div>
  );
}
