/**
 * lib/leads/map.ts — turn customer_map rows into plain sentences about what works in a country. Pure.
 * Rows only exist when 3+ founders contributed (see the migration), so nothing here names anyone.
 */
export interface MapRow { country: string; lead_kind: string; channel: string; founders: number; contacted: number; replied: number; converted: number }

const KIND: Record<string, string> = { business: "businesses", public_community: "public communities", page: "public pages", association: "associations", event: "events", listing: "listings" };
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", facebook: "Facebook", phone: "phone calls", visit: "visits in person", email: "email", other: "other ways", unknown: "an unrecorded way" };

export function describeRow(r: MapRow): string {
  const pct = r.contacted > 0 ? Math.round((r.replied / r.contacted) * 100) : 0;
  return `${r.founders} founders contacted ${KIND[r.lead_kind] ?? r.lead_kind} by ${CHANNEL[r.channel] ?? r.channel}: ${r.replied} of ${r.contacted} replied (${pct}%)${r.converted ? `, ${r.converted} became customers` : ""}.`;
}

/** Best first: rows with enough contacts, ordered by reply rate, then volume. */
export function rankRows(rows: MapRow[], minContacted = 5): MapRow[] {
  return rows
    .filter((r) => r.contacted >= minContacted)
    .sort((a, b) => b.replied / b.contacted - a.replied / a.contacted || b.contacted - a.contacted);
}
