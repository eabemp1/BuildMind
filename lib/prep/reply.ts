/** Guards for the reply helper. Only what can be trusted from the model survives. */
import { cleanText, variantProblems } from "@/lib/distribution/engine";
import type { Platform } from "@/lib/distribution/textSignals";

export const READS = ["interested", "question", "objection", "decline", "unclear"] as const;
export interface ReplyAssist { read: (typeof READS)[number]; summary: string; quote: string; reply: string; nextStep: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** The quote must appear in what the other person wrote, and the reply must pass the same draft guards as first messages. */
export function guardReply(raw: unknown, theirText: string, platform: Platform): ReplyAssist {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const read = (READS as readonly string[]).includes(o.read as string) ? (o.read as ReplyAssist["read"]) : "unclear";
  let quote = s(o.quote, 240);
  if (!quote || !theirText || !norm(theirText).includes(norm(quote))) quote = "";
  let reply = cleanText(s(o.reply, 900));
  if (variantProblems("outreach", reply, platform).length) reply = "";
  return { read, summary: s(o.summary, 220), quote, reply, nextStep: s(o.nextStep, 200) };
}
