/**
 * lib/visuals/exportResponses.tsx
 *
 * HTTP responses for the visual exports. Lives in a .tsx module so route.ts
 * files can stay plain TypeScript and just hand over a VisualSpec.
 */

import React from "react";
import { ImageResponse } from "next/og";
import { loadCardFonts } from "@/lib/shareCard";
import { renderVisualReportHtml } from "./reportHtml";
import { VisualPoster, POSTER } from "./posterCard";
import type { VisualSpec } from "./spec";

export function visualReportResponse(spec: VisualSpec, filename: string): Response {
  return new Response(renderVisualReportHtml(spec), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function posterResponse(spec: VisualSpec, filename: string): Promise<Response> {
  const fonts = await loadCardFonts();
  const res = new ImageResponse(<VisualPoster spec={spec} />, { width: POSTER.w, height: POSTER.h, fonts: fonts.length ? fonts : undefined });
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  return res;
}
