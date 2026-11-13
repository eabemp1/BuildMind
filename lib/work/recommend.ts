/**
 * lib/work/recommend.ts: the two or three Work jobs to show first. Chosen from the project's
 * stage, skipping jobs the founder has already made. Pure, so it can be tested without the UI.
 */
import { stageBand } from "@/lib/stages";

export interface Recommendation { id: string; reason: string }

const BY_BAND: Record<string, Recommendation[]> = {
  idea: [
    { id: "existing:prospects", reason: "You need real people to talk to before anything else." },
    { id: "existing:validation_kit", reason: "Questions that ask what they did, not what they would do." },
    { id: "existing:outreach", reason: "A short, honest first message to book a conversation." },
  ],
  validation: [
    { id: "existing:validation_kit", reason: "Questions that ask what they did, not what they would do." },
    { id: "existing:outreach", reason: "A short, honest first message to book a conversation." },
    { id: "existing:prospects", reason: "Places where your customers already talk." },
  ],
  building: [
    { id: "existing:build_plan", reason: "Decide the smallest useful version before you build more." },
    { id: "existing:validation_kit", reason: "Check what you are building is wanted, with a few real people." },
    { id: "existing:outreach", reason: "Line up people to try it as soon as it works." },
  ],
  launch: [
    { id: "existing:landing", reason: "Give first users one page to land on." },
    { id: "existing:post", reason: "A first post that tells people it exists." },
    { id: "existing:outreach", reason: "Ask the people you have spoken to to try it." },
  ],
  growth: [
    { id: "existing:pricing_test", reason: "Learn what people will pay before you change prices." },
    { id: "existing:post", reason: "Keep something going out each week." },
    { id: "existing:seo", reason: "A page brief grounded in what ranks now." },
  ],
};

/** Up to three jobs for this stage that are not already in the library. `madeKinds` are library kinds. */
export function recommendedFor(stage: string | null | undefined, madeKinds: string[] = [], limit = 3): Recommendation[] {
  const band = stageBand(stage);
  const list = BY_BAND[band] ?? BY_BAND.validation;
  const made = new Set(madeKinds);
  const fresh = list.filter((r) => !made.has(r.id.replace("existing:", "")));
  return (fresh.length ? fresh : list).slice(0, limit);
}
