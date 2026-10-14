import { z } from "zod";
import { CONV_STATUSES } from "./overview";

export const KINDS = ["drafts", "conversations", "experiments"] as const;
export type Kind = (typeof KINDS)[number];
export const TABLE: Record<Kind, string> = { drafts: "dist_drafts", conversations: "dist_conversations", experiments: "dist_experiments" };

const txt = (n: number) => z.string().max(n).nullable().optional();
const count = z.number().int().min(0).max(1_000_000_000).nullable().optional();
const platform = z.enum(["linkedin", "x", "reddit", "hn", "other"]);

export const SCHEMAS: Record<Kind, z.ZodObject<z.ZodRawShape>> = {
  drafts: z.object({ platform: platform.optional(), audience: txt(300), outcome: txt(300), context: txt(2000), body: z.string().min(1).max(8000), diagnosis: z.unknown().optional() }),
  conversations: z.object({
    platform: z.string().max(40).optional(), url: txt(600), excerpt: txt(3000), segment: txt(120), relevance: txt(600),
    suggested_reply: txt(3000), status: z.enum(CONV_STATUSES as [string, ...string[]]).optional(), next_action: txt(300), notes: txt(2000),
    last_contacted_at: z.string().datetime().nullable().optional(),
  }),
  experiments: z.object({
    draft_id: z.string().uuid().nullable().optional(), hypothesis: z.string().min(1).max(600), segment: txt(120), platform: z.string().max(40).optional(),
    variant: txt(3000), run_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), status: z.enum(["planned", "running", "done"]).optional(),
    impressions: count, replies: count, meaningful_exchanges: count, profile_visits: count, qualified_founders: count, signups: count, activations: count, paid: count,
    observations: txt(3000), ai_interpretation: txt(3000), learning: txt(2000), next_experiment: txt(1000),
  }),
};

const METRIC_KEYS = ["impressions", "replies", "meaningful_exchanges", "profile_visits", "qualified_founders", "signups", "activations", "paid"];

/** Stamps when metrics were last entered, so every number carries a date. */
export function withMetricsStamp(kind: Kind, data: Record<string, unknown>, now = new Date()): Record<string, unknown> {
  if (kind === "experiments" && METRIC_KEYS.some((k) => k in data)) return { ...data, metrics_as_of: now.toISOString() };
  return data;
}
