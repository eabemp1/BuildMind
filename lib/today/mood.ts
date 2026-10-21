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

export type Mood = "people" | "build" | "publish" | "pricing" | "analyze" | "unblock" | "reset" | "radar" | "default";

export const MOOD_META: Record<Mood, { label: string; tone: string }> = {
  people:  { label: "Conversation", tone: "Warm and short. Send it today." },
  build:   { label: "Build",        tone: "Dense and quiet. One thing, shipped." },
  publish: { label: "Publish",      tone: "Say one true thing in public." },
  pricing: { label: "Pricing",      tone: "Precise. Put a real number in front of someone." },
  analyze: { label: "Analyze",      tone: "Read the evidence, then decide." },
  unblock: { label: "Unblock",      tone: "Slow down. Only the first 20 minutes." },
  reset:   { label: "Reset",        tone: "Small and calm. One visible win." },
  radar:   { label: "Radar",        tone: "Time-boxed. This one does not wait." },
  default: { label: "Today",        tone: "" },
};

const BY_MISSION: Record<string, Mood> = {
  interview: "people", outreach: "people", follow_up: "people",
  build: "build", publish: "publish", pricing: "pricing",
  analyze: "analyze", unblock: "unblock", reset: "reset", radar: "radar",
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

/**
 * What a mood DOES to the page, beyond colour. Colour and density say what kind of day it is;
 * this says how the page behaves for it.
 *   calm      the extras (why-panel, radar list, notes) fold away; only the task and its first move stay
 *   engages   the page dims everything but the task while the founder is in a focus block
 */
export interface MoodBehavior { calm: boolean; focusVerb: string; engagedNote: string }

export const MOOD_BEHAVIOR: Record<Mood, MoodBehavior> = {
  people:  { calm: false, focusVerb: "Focus on the message", engagedNote: "Writing. Send it before you polish it." },
  build:   { calm: false, focusVerb: "Focus on the build",   engagedNote: "Heads down. One thing, shipped." },
  publish: { calm: false, focusVerb: "Focus on the post",    engagedNote: "One true thing. Publish it." },
  pricing: { calm: false, focusVerb: "Focus on the number",  engagedNote: "Put a real number in front of someone." },
  analyze: { calm: false, focusVerb: "Focus on the evidence", engagedNote: "Read it, then decide. No new tabs." },
  unblock: { calm: true,  focusVerb: "Start the first 20 minutes", engagedNote: "Only the first step. Nothing else counts." },
  reset:   { calm: true,  focusVerb: "Take the small win",   engagedNote: "Small and calm. One visible win." },
  radar:   { calm: false, focusVerb: "Focus on the deadline", engagedNote: "This one does not wait." },
  default: { calm: false, focusVerb: "Focus",                engagedNote: "Heads down." },
};

/** Whether secondary sections are hidden right now (calm moods, unless the founder asked to see everything). */
export function isCalm(mood: Mood, showAll: boolean): boolean {
  return MOOD_BEHAVIOR[mood].calm && !showAll;
}

/** Entrance animation alternates between two identical keyframe names so it replays on every mood change without remounting the page. */
export function nextTick(prev: number): number { return (prev + 1) % 2; }
