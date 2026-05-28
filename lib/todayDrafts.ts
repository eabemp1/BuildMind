import { sanitizeModelOutput } from "@/lib/ai-providers";
import type { FounderKnowledgeMatch } from "@/lib/founderKnowledgeBase";

type TodayAction = {
  action: string;
  platform: string;
  target_user: string;
  message: string;
  why: string;
  time: string;
};

type DraftContext = {
  title: string;
  targetUsers: string;
  problem: string;
  stage?: string;
  archetypeStyle?: string;
  knowledgeMatches?: FounderKnowledgeMatch[];
};

function clean(value: string | undefined, fallback: string): string {
  const output = sanitizeModelOutput(value ?? "");
  return output || fallback;
}

function inferAudience(action: string, explicit: string): string {
  if (explicit.trim()) return explicit.trim();
  const match = action.match(/\b(?:to|with)\s+(?:\d+\s+)?(.+?)(?:\s+(?:on|via|today|who|and|while|before|after)|\s+[,-]|[.,]|$)/i);
  return match?.[1]?.trim() || "people in your target segment";
}

function inferTopic(action: string, explicit: string, title: string): string {
  if (explicit.trim()) return explicit.trim();
  const about = action.match(/\b(?:about|around|with)\s+(.+?)(?:[.,]|\s+[,-]|\s+today|\s+before|\s+after|$)/i);
  if (about?.[1]?.trim()) return about[1].trim();
  return title.trim() ? `${title.trim()} and the workflow it improves` : "this workflow";
}

function ensureLongEnough(draft: string, context: { audience: string; topic: string; product: string; stage: string }): string {
  if (draft.length >= 500) return draft;
  return `${draft}

For context, I'm not looking for encouragement or a polished testimonial. I'm trying to understand the real workflow: what you do now, where it gets annoying, what you ignore because it feels normal, and what would make you switch from the current workaround. If this is not your area, a referral to one person who deals with ${context.topic} would help too.

Two quick questions:
1. What do you currently do when ${context.topic} comes up?
2. If you could change one frustrating part of that process this week, what would it be?

If a call is too much, reply with a voice note or three bullets. I can work with messy context.`.trim();
}

export function buildLongTodayDraft(action: string, fallback: TodayAction, context: DraftContext): string {
  const audience = inferAudience(action, context.targetUsers);
  const topic = inferTopic(action, context.problem, context.title);
  const product = context.title.trim() || "what I am building";
  const stage = context.stage || "early";
  const precedent = context.knowledgeMatches?.[0];
  const precedentLine = precedent
    ? `A similar ${precedent.company_type} founder stalled when they ${precedent.what_stalled_them.toLowerCase()}, so I am trying to test the risky part directly instead of polishing in private.`
    : `I am trying to test the risky part directly instead of polishing in private.`;

  const seed = action.length + product.length + topic.length;
  const variants = [
    `Hi [Name], quick question. I'm working on ${product} for ${audience}, and today's focus is ${topic}. ${precedentLine}

Would you be open to giving me blunt context on how this works for you right now? I am not asking you to try a product yet, and I am not looking for a nice answer. I want to know what you currently do, what feels slow or annoying, and what you would never bother changing because the pain is not strong enough.

The specific thing I am trying to learn is whether ${topic} is an urgent enough problem for ${audience} to care about. If the answer is no, that is useful. If the answer is yes, I would love to understand the exact moment it becomes painful.

Could you reply with either:
- the workaround you use today
- the most frustrating part of that workaround
- whether a 10 minute call or voice note would be easier

No pitch. I am using your answer to decide what to cut, what to build, and what to stop assuming.`,
    `Hi [Name], I am doing a focused round of founder research today around ${topic}. I am building ${product}, but I am deliberately trying not to sell it yet because I need the truth from ${audience} before I decide what deserves more work.

Here is the narrow ask: when this problem shows up for you, what happens next? Who handles it, what tool or process do you use, where does it break down, and what do you usually tolerate because fixing it feels like too much effort?

${precedentLine} That is the trap I am trying to avoid here. A short honest reply is more valuable than a polite "sounds cool."

If you have 10 minutes, I would love to ask a few questions. If not, a reply with three bullets is perfect:
1. what you do today
2. what part wastes the most time or trust
3. what would make you care enough to change it

If you are not the right person, who should I ask instead?`,
    `Hi [Name], I am reaching out because you are close to the kind of ${audience} I need to learn from. I am working on ${product}, and the current question is not "do you like this idea?" The question is whether ${topic} is a real enough pain that someone would change behavior for it.

Could you help me pressure-test that? I am looking for the unpolished version: the messy workaround, the spreadsheet, the group chat, the manual process, the thing everyone complains about but still accepts. ${precedentLine}

The best response would be one of these:
- "We already solve this with X, and it is fine"
- "This is annoying because X, but not urgent"
- "This is painful enough that I would try something better"

If a quick chat is easier, I can work around your schedule today. If text is easier, just send a few bullets. I will not pitch unless you ask; I mainly want to understand the current behavior and the real switching trigger.`,
  ];

  const selected = variants[seed % variants.length];
  return ensureLongEnough(clean(selected, fallback.message), { audience, topic, product, stage });
}
