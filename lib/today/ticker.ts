/**
 * lib/today/ticker.ts: the status updates on Today (milestone, market, risk, welcome-back, radar, progress)
 * as one list for a single moving headline. Pure and client-safe. Nothing is invented here: every item is a fact
 * the server or Radar already reported, and a quiet day gives an empty list (so no ticker at all).
 */
import { SLOT_ORDER, DISMISS_DAYS, type SlotCandidate, type SlotKind } from "@/lib/today/slot";

export type TickerKind = SlotKind | "radar" | "progress";
export interface TickerItem { id: string; kind: TickerKind; text: string; href?: string; cta?: string; dismissible: boolean }

export interface TickerInputs {
  candidates: SlotCandidate[];
  dismissed: Record<string, string>;
  /** statusLine(): "Evidence for X 2/4 · PMF signs 1/6" */
  progress: string;
  /** Radar's line when it has nothing urgent: watching, or empty. Urgent Radar keeps its own bar. */
  radar?: { text: string; href: string; cta: string } | null;
  now?: Date;
}

export const MAX_TICKER_ITEMS = 6;

export function tickerItems(i: TickerInputs): TickerItem[] {
  const now = (i.now ?? new Date()).getTime();
  const hidden = (id: string) => {
    const at = Date.parse(i.dismissed[id] ?? "");
    return Number.isFinite(at) && now - at < DISMISS_DAYS * 86_400_000;
  };
  const out: TickerItem[] = [];
  for (const kind of SLOT_ORDER) {
    for (const c of i.candidates) if (c.kind === kind && !hidden(c.id)) out.push({ id: c.id, kind, text: c.text, href: c.href, cta: c.cta, dismissible: true });
  }
  if (i.radar?.text) out.push({ id: "radar:quiet", kind: "radar", text: i.radar.text, href: i.radar.href, cta: i.radar.cta, dismissible: false });
  if (i.progress) out.push({ id: "progress", kind: "progress", text: i.progress, dismissible: false });
  return out.slice(0, MAX_TICKER_ITEMS);
}

/** Next index, wrapping. Pure so the rotation can be tested. */
export const nextIndex = (cur: number, len: number): number => (len <= 1 ? 0 : (cur + 1) % len);
