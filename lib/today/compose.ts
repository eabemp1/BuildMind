/**
 * lib/today/compose.ts — makes sure an outreach-shaped task names one channel and one number.
 * Moved out of the stream route so it can be tested. Behaviour: a channel already named in the task sentence wins; the
 * platform field and the WhatsApp default are used only when the sentence names none.
 */
import type { Mission } from "@/lib/todayMission";
import { namedPlatform } from "@/lib/today/platformInText";

export const ALLOWED_PLATFORMS = ["LinkedIn", "WhatsApp", "email", "Twitter", "phone", "in person", "Slack", "Telegram", "Instagram", "Reddit", "Product Hunt", "Indie Hackers"];

export function normalizePlatform(raw: string | undefined): string {
  const found = ALLOWED_PLATFORMS.find((p) => (raw ?? "").toLowerCase().includes(p.toLowerCase()));
  return found ?? "WhatsApp"; // safe, always-valid default — never leave platform empty
}

export interface StructuredAction {
  kind?: string;
  platform?: string;
  count?: number;
  user_type?: string;
  task: string;
  rationale: string;
  draft?: string;
  done_when?: string;
  first_step?: string;
  minutes?: number;
}

// Structural guarantee, not a hope: if the model's own `task` sentence
// already names the platform and a number, leave it untouched. If it
// doesn't, splice them in deterministically rather than throwing the whole
// generation away and falling back to the generic template. This is what
// turns has_platform/has_number from "usually true, we grade it after" into
// "always true by construction."
export function composeConcreteTask(structured: StructuredAction, mission?: Mission): { task: string; platform: string; count: number } {
  // Only outreach-shaped missions need platform/number spliced in. A build,
  // analyze or pricing task is left exactly as written.
  if (mission && !mission.requires.platform && !mission.requires.number) {
    return { task: (structured.task ?? "").trim(), platform: "", count: 0 };
  }
  let task = (structured.task ?? "").trim();
  // A channel the sentence already names wins over the separate field, so a task is never given a second channel.
  const inTask = namedPlatform(task, ALLOWED_PLATFORMS);
  const platform = inTask ? (ALLOWED_PLATFORMS.find((p) => p.toLowerCase() === inTask.toLowerCase()) ?? inTask) : normalizePlatform(structured.platform);
  const count = Number.isFinite(structured.count) && (structured.count as number) >= 1 ? Math.round(structured.count as number) : 3;
  const hasPlatform = Boolean(inTask);
  const hasNumber = /\b\d+\b/.test(task);
  if (!task) {
    task = `Advance today's goal with ${count} ${structured.user_type || "people"} on ${platform}.`;
  } else if (!hasPlatform || !hasNumber) {
    const missing = [!hasNumber ? `${count} ${structured.user_type || "people"}` : null, !hasPlatform ? `on ${platform}` : null]
      .filter(Boolean)
      .join(" ");
    task = `${task.replace(/[.!?]\s*$/, "")} — ${missing}.`;
  }
  return { task, platform, count };
}
