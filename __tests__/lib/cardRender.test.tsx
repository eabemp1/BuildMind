import React from "react";
import { describe, it, expect } from "vitest";
import { ImageResponse } from "next/og";
import { BreakCard, BREAK_CARD } from "@/lib/breakShareCard";
import { VisualPoster, POSTER } from "@/lib/visuals/posterCard";
import { buildSharePayload } from "@/lib/breakShare";
import { buildProgressVisual } from "@/lib/visuals/intelligenceVisual";
import { loadCardFonts } from "@/lib/shareCard";

describe("Satori renders the new cards to real PNGs", () => {
  it("break share card", async () => {
    const p = buildSharePayload({ overallRisk: "High", summary: "Crowded market, unclear buyer.", survival_probability: 38, risks: [{ category: "Demand", severity: "High", description: "d", mitigation: "m" }], pivots: [{ title: "Niche down", why_better: "w" }] } as any, "Invoice tool for freelancers");
    const fonts = await loadCardFonts();
    const buf = await new ImageResponse(<BreakCard p={p} />, { width: BREAK_CARD.w, height: BREAK_CARD.h, fonts: fonts.length ? fonts : undefined }).arrayBuffer();
    expect(new Uint8Array(buf).slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
  }, 30000);
  it("execution poster", async () => {
    const spec = { title: "T", panels: [{ type: "gauge", title: "Momentum", value: 62, max: 100, tone: "good" }, { type: "bars", title: "B", items: [{ label: "a", value: 3, max: 5 }] }] } as any;
    const fonts = await loadCardFonts();
    const buf = await new ImageResponse(<VisualPoster spec={spec} />, { width: POSTER.w, height: POSTER.h, fonts: fonts.length ? fonts : undefined }).arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(2000);
  }, 30000);
});
