/**
 * lib/coachActions/types.ts
 *
 * Shared, client-safe types for Coach Actions — the closed set of things
 * the AI Coach can DO (not just talk about). Imported by both the server
 * (registry/handlers) and the client (result card, chips), so nothing in
 * here may pull in server-only modules.
 *
 * Design rule that shapes this whole folder: an action's RESULT is data
 * the UI renders (stats, rows, download links) — it is never text a model
 * wrote. That keeps results exact (no invented numbers), exempt from the
 * coach persona's 180-word cap, and immune to prompt injection through
 * stored task titles or reflections.
 */

export type CoachActionId = "export_intelligence" | "list_backlog";

export interface CoachActionDownload {
  label: string;
  /** Same-origin API path only — the card refuses to render anything else. */
  href: string;
}

export interface CoachActionRow {
  primary: string;
  secondary?: string;
  badge?: string;
}

export interface CoachActionResult {
  actionId: CoachActionId;
  title: string;
  /** Deterministic, server-written one-liner shown as the chat bubble text. */
  summary: string;
  stats?: Array<{ label: string; value: string }>;
  rows?: CoachActionRow[];
  downloads?: CoachActionDownload[];
  /** Truncation / not-found / caveat text, shown small under the card body. */
  note?: string;
}

export interface CoachActionMatch {
  id: CoachActionId;
  /** Untrusted until parsed by the action's own zod schema server-side. */
  params: Record<string, unknown>;
}
