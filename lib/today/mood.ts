/**
 * lib/today/mood.ts — which "mood" the Today page takes on for a task.
 *
 * The visual values (colour, type scale, density, radius, width) live in CSS under
 * [data-mood="…"] in app/globals.css, so they follow light/dark mode and switch
 * with a transition. Design rule: the atmosphere changes, the controls do not.
 * Navigation, the primary button and the task title stay where they are, so
 * founders never have to relearn the page; colour, rhythm and density tell them
 * what kind of work today is.
 */

export type Mood = "people" | "build" | "publish" | "pricing" | "analyze" | "unblock" | "reset" | "default";

export const MOOD_META: Record<Mood, { label: string; tone: string }> = {
  people:  { label: "Conversation", tone: "Warm and short. Send it today." },
  build:   { label: "Build",        tone: "Dense and quiet. One thing, shipped." },
  publish: { label: "Publish",      tone: "Say one true thing in public." },
  pricing: { label: "Pricing",      tone: "Precise. Put a real number in front of someone." },
  analyze: { label: "Analyze",      tone: "Read the evidence, then decide." },
  unblock: { label: "Unblock",      tone: "Slow down. Only the first 20 minutes." },
  reset:   { label: "Reset",        tone: "Small and calm. One visible win." },
  default: { label: "Today",        tone: "" },
};

const BY_MISSION: Record<string, Mood> = {
  interview: "people", outreach: "people", follow_up: "people",
  build: "build", publish: "publish", pricing: "pricing",
  analyze: "analyze", unblock: "unblock", reset: "reset",
};
const BY_PREP: Record<string, Mood> = {
  outreach: "people", validation_kit: "people", prospects: "people",
  post: "publish", video_script: "publish", seo: "publish", landing: "publish", investor_update: "publish",
  build_plan: "build", launch_plan: "publish", pricing_test: "pricing", competitor_brief: "analyze",
};

export function moodFor(missionKind?: string | null, prepKind?: string | null): Mood {
  if (missionKind && BY_MISSION[missionKind]) return BY_MISSION[missionKind];
  if (prepKind && BY_PREP[prepKind]) return BY_PREP[prepKind];
  return "default";
}
