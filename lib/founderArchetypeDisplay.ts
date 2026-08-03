/**
 * lib/founderArchetypeDisplay.ts
 *
 * Founder-facing copy for the 5 founder archetypes classified by
 * lib/founderArchetype.ts. Deliberately has zero server-only imports
 * (no Supabase admin client, no AI calls) so it's safe to import from
 * client components (WeeklyPulseCard, /memory, /today, etc.) without
 * pulling server code into the browser bundle.
 *
 * lib/founderArchetype.ts owns classification + the internal AI tone
 * directives (ARCHETYPE_TONE / ARCHETYPE_WATCH — written for the model).
 * This file owns what a founder actually sees — written for a human.
 */

export type FounderArchetype =
  | "technical-overbuilder"
  | "vision-heavy-executor"
  | "validation-avoider"
  | "chaotic-high-energy"
  | "methodical-slow-mover";

export interface ArchetypeDisplay {
  name: string;
  icon: string;
  tagline: string;
  description: string;
  watchFor: string;
}

export const ARCHETYPE_DISPLAY: Record<FounderArchetype, ArchetypeDisplay> = {
  "technical-overbuilder": {
    name: "The Overbuilder",
    icon: "🛠️",
    tagline: "You'd rather perfect the product than talk to a user.",
    description:
      "You gravitate toward building and polishing before validating. Confidence comes from what you've shipped, not what a customer has confirmed. BuildMind will keep steering you toward real conversations, even mid-build.",
    watchFor: "Building features nobody has asked for yet.",
  },
  "vision-heavy-executor": {
    name: "The Visionary",
    icon: "🧭",
    tagline: "The big picture is clear. The next 48 hours keep slipping.",
    description:
      "You think in destinations, not steps — a strength for direction, a risk for momentum. BuildMind will keep forcing the vision down into one concrete deliverable at a time.",
    watchFor: "Jumping between ideas instead of finishing the one already in motion.",
  },
  "validation-avoider": {
    name: "The Validator-Avoider",
    icon: "🙈",
    tagline: "You'll build twice before you'll ask once.",
    description:
      "Customer conversations feel high-stakes, so they keep getting deferred. BuildMind will make the next one low-stakes and hard to put off.",
    watchFor: "Delaying the conversation that would settle your biggest open question.",
  },
  "chaotic-high-energy": {
    name: "The Sprinter",
    icon: "⚡",
    tagline: "Full speed, several directions at once.",
    description:
      "You've got the energy most founders wish they had — the challenge is holding it in one lane long enough to finish. BuildMind will hold you to one priority at a time.",
    watchFor: "Starting the next thing before the current one is actually done.",
  },
  "methodical-slow-mover": {
    name: "The Architect",
    icon: "🏛️",
    tagline: "You'd rather plan it right than ship it rough.",
    description:
      "Thoroughness is your instinct, but early-stage speed rewards rough-and-shipped over polished-and-late. BuildMind will keep compressing your timelines.",
    watchFor: "Refining the plan instead of shipping something learnable.",
  },
};

/** Confidence below this threshold is treated as unclassified elsewhere in the app (lib/founderArchetype.ts) — mirrored here for display gating. */
export const ARCHETYPE_CONFIDENCE_THRESHOLD = 0.65;

function isKnownArchetype(value: string): value is FounderArchetype {
  return value in ARCHETYPE_DISPLAY;
}

/**
 * Extracts the classified archetype from a founder_memory.personality_tags
 * array (which stores it as a raw "archetype:<value>" tag) and returns its
 * display metadata, or null if unclassified/not yet run.
 */
export function getArchetypeDisplay(personalityTags: string[] = []): ArchetypeDisplay | null {
  const tag = personalityTags.find((t) => t.startsWith("archetype:"));
  if (!tag || tag === "archetype:unclassified") return null;
  const value = tag.replace("archetype:", "");
  return isKnownArchetype(value) ? ARCHETYPE_DISPLAY[value] : null;
}

/** Friendly display name for a raw archetype string (e.g. from an API that already stripped the "archetype:" prefix), falling back to a readable version of the raw value. */
export function formatArchetypeLabel(archetype: string | null | undefined): string {
  if (!archetype) return "";
  return isKnownArchetype(archetype) ? ARCHETYPE_DISPLAY[archetype].name : archetype.replace(/-/g, " ");
}
