/**
 * lib/coachActions/chips.ts
 *
 * One-tap entry points shown on the coach page. Chips send a structured
 * {id, params} straight to the server (no matching, no tokens); the server
 * still validates it against the action's own schema, so a tampered request
 * can't do anything a typed one couldn't.
 */

import type { CoachActionId } from "./types";

export interface CoachActionChip {
  id: CoachActionId;
  /** Shown on the button AND as the user's chat bubble when tapped. */
  label: string;
  params: Record<string, unknown>;
}

export const COACH_ACTION_CHIPS: CoachActionChip[] = [
  { id: "list_backlog", label: "Show my open tasks", params: {} },
  { id: "export_intelligence", label: "Export my intelligence data", params: {} },
];
