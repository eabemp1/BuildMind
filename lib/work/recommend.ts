/**
 * lib/work/recommend.ts: the two or three Work jobs to show first. Chosen from the project's
 * stage, skipping jobs the founder has already made. Pure, so it can be tested without the UI.
 */
import { stageBand } from "@/lib/stages";
import { kindOfTask } from "@/lib/todayMission";

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

const BY_TASK: Record<string, Recommendation[]> = {
  interview: [
    { id: "existing:validation_kit", reason: "Today's task is a conversation. These are the questions to ask." },
    { id: "existing:outreach", reason: "A short first message to book it." },
    { id: "existing:prospects", reason: "Places to find the right people." },
  ],
  outreach: [
    { id: "existing:outreach", reason: "Today's task is first messages. This drafts them." },
    { id: "existing:prospects", reason: "Who to send them to." },
  ],
  follow_up: [
    { id: "existing:outreach", reason: "Today's task is a follow-up. This drafts one that gets an answer." },
    { id: "existing:validation_kit", reason: "What to ask once they reply." },
  ],
  publish: [
    { id: "existing:post", reason: "Today's task is to publish. This drafts the post." },
    { id: "existing:landing", reason: "A page for people to land on." },
  ],
  pricing: [
    { id: "existing:pricing_test", reason: "Today's task is a price ask. This sets up the test." },
    { id: "existing:validation_kit", reason: "Questions about what they pay for now." },
  ],
  build: [
    { id: "existing:build_plan", reason: "Today's task is building. Decide the smallest useful slice first." },
  ],
};

/** Jobs that fit today's task when it is recognisable; otherwise the stage picks. */
export function recommendedForTask(task: string | null | undefined, stage: string | null | undefined, madeKinds: string[] = [], limit = 3): Recommendation[] {
  const kind = task ? kindOfTask(task) : null;
  const list = kind ? BY_TASK[kind] : undefined;
  if (!list) return recommendedFor(stage, madeKinds, limit);
  const rest = recommendedFor(stage, madeKinds, limit).filter((r) => !list.some((l) => l.id === r.id));
  return [...list, ...rest].slice(0, limit);
}
