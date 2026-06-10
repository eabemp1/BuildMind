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
  if (explicit.trim()) {
    // Truncate long problem descriptions to a short, usable phrase.
    // If the problem field is a full paragraph (e.g. the product pitch copy),
    // using it raw produces drafts like "Saw you work close to [entire pitch]".
    // Cap at 80 chars and stop at the first sentence boundary.
    const raw = explicit.trim();
    if (raw.length <= 80) return raw;
    const firstSentence = raw.match(/^(.{10,80}?[.!?])\s/);
    if (firstSentence?.[1]) return firstSentence[1].replace(/[.!?]$/, "").trim();
    // No sentence boundary — truncate at last word before 80 chars
    const truncated = raw.slice(0, 80).replace(/\s+\S*$/, "").trim();
    return truncated || raw.slice(0, 60).trim();
  }
  const about = action.match(/\b(?:about|around|with)\s+(.+?)(?:[.,]|\s+[,-]|\s+today|\s+before|\s+after|$)/i);
  if (about?.[1]?.trim()) return about[1].trim();
  return title.trim() ? `${title.trim()} and the workflow it improves` : "this workflow";
}

function personalizeTemplate(template: string, context: DraftContext, audience: string, topic: string): string {
  const product = context.title.trim() || "what I am building";
  const targetRole = audience || "people in your target segment";
  const replacements: Array<[RegExp, string]> = [
    [/\[Name\]|\{name\}/gi, "[Name]"],
    [/\[product\]|\[ProductName\]|\[your product\]|\{product\}|\{product_name\}/gi, product],
    [/\[target users\]|\[target_role\]|\{target_users\}|\{target_role\}/gi, targetRole],
    [/\[workflow\/problem\]|\[problem\/workflow\]|\[problem_area\]|\[problem\]|\[your problem area\]|\{problem\}|\{problem_area\}/gi, topic],
    [/\[role\]|\{role\}/gi, targetRole],
    [/\[company\]|\{company\}/gi, "your team"],
    [/\[relevant_trigger\]|\{relevant_trigger\}/gi, `dealing with ${topic}`],
    [/\[shared_context\]|\{shared_context\}/gi, `close to ${topic}`],
  ];

  return replacements.reduce((draft, [pattern, value]) => draft.replace(pattern, value), template);
}

export function buildPersonalizedTodayDraft(action: string, fallback: TodayAction, context: DraftContext): string {
  const audience = inferAudience(action, context.targetUsers);
  const topic = inferTopic(action, context.problem, context.title);
  const product = context.title.trim() || "what I am building";
  const templateMatch = context.knowledgeMatches?.find((match) => match.draft_template);
  if (templateMatch?.draft_template) {
    return clean(personalizeTemplate(templateMatch.draft_template, context, audience, topic), fallback.message);
  }

  const seed = action.length + product.length + topic.length;
  const variants = [
    `Saw you work close to ${topic}. Quick question: how do you currently handle this today? I am building ${product} for ${audience}, but I am trying to learn whether it is actually painful before I build more.`,
    `Noticed your work seems connected to ${topic}. I am testing ${product} with ${audience} and want to understand how this lands on your side. Worth a quick 10 minute chat?`,
    `15 minutes this week? I am building for ${audience} dealing with ${topic}, and I want to hear how you think about it before I build the wrong thing.`,
    `We are both close to ${topic}. I am working on ${product}, but I am not ready to demo yet. I just want to talk to someone who gets the space. 10 minutes?`,
    `You are probably already handling ${topic} somehow. I would love to understand your current approach before assuming it needs fixing. Could you walk me through what you do today?`,
  ];

  const selected = variants[seed % variants.length];
  return clean(selected, fallback.message);
}
