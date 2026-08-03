/**
 * lib/cardLogo.ts
 *
 * Loads the real BuildMind logo mark (public/logo/buildmind-mark.svg) as a
 * base64 data URI, for use in server-rendered PNG cards (next/og's
 * ImageResponse). Replaces the placeholder "B"-in-a-colored-box that was
 * standing in for the actual brand mark on the weekly-pulse and
 * weekly-report cards.
 *
 * Read from disk + base64-encoded rather than referencing a relative URL —
 * ImageResponse/Satori resolves <img> sources over the network, not the
 * filesystem, so a relative path like "/logo/buildmind-mark.svg" would only
 * work if the route knew its own deployed origin. A data URI works
 * anywhere, no origin assumptions needed.
 *
 * Cached in-memory after first read — this file rarely changes, and these
 * card routes may render frequently.
 */

import { readFile } from "fs/promises";
import path from "path";

let cachedLogoDataUri: string | null = null;

export async function getLogoDataUri(): Promise<string> {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const svgPath = path.join(process.cwd(), "public", "logo", "buildmind-mark.svg");
    const svg = await readFile(svgPath, "utf-8");
    const base64 = Buffer.from(svg).toString("base64");
    cachedLogoDataUri = `data:image/svg+xml;base64,${base64}`;
    return cachedLogoDataUri;
  } catch {
    // Non-fatal — cards should still render if the logo file is ever
    // missing/moved. Callers should fall back to the text mark.
    return "";
  }
}
