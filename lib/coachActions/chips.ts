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
  { id: "get_signals", label: "What signals are you seeing?", params: {} },
  { id: "get_decision_reasoning", label: "Why did you recommend that?", params: {} },
  { id: "get_beliefs", label: "What do you believe about me?", params: {} },
  { id: "get_momentum", label: "What's my momentum?", params: {} },
  { id: "list_milestones", label: "Show my milestones", params: {} },
  { id: "get_execution_log", label: "Show my execution log", params: {} },
  { id: "export_intelligence", label: "Export my intelligence data", params: {} },
];
