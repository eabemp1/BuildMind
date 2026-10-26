/**
 * What BuildMind does for each kind of task, and what is left for the founder.
 *
 * BuildMind cannot do work inside other tools (design, video editing, coding, ads, sending email). Saying so up front
 * is better than a task that implies otherwise. Every kind gets the same three parts: what BuildMind prepares, what
 * the founder does, and how the result gets counted or recorded. The planner prompt uses the same facts, so what a
 * task asks for and what the app can support stay in step.
 */
import type { PrepKind } from "@/lib/prep/kinds";

export interface Capability {
  /** counted: BuildMind measures the result itself. recorded: the founder reports it in one line. */
  level: "counted" | "recorded";
  prepares: string;
  you: string;
  result: string;
}

const MAP: Record<PrepKind, Capability> = {
  landing: { level: "counted", prepares: "the copy and a live signup page", you: "share the link where your audience is", result: "visits and signups per channel, counted by BuildMind" },
  outreach: { level: "recorded", prepares: "the message and a follow-up", you: "send it yourself", result: "replies you log, with a follow-up reminder in 3 days" },
  post: { level: "recorded", prepares: "the post drafts", you: "publish it", result: "how it did, asked tomorrow; add a tracked link to count clicks" },
  launch_plan: { level: "recorded", prepares: "titles, first comment and timing", you: "post it and stay for the first hour", result: "comments and visits, asked tomorrow" },
  seo: { level: "recorded", prepares: "a brief from your own search data", you: "write and publish the page", result: "your Search Console numbers over the next weeks" },
  investor_update: { level: "recorded", prepares: "an update from your real numbers", you: "review and send it", result: "replies you log" },
  video_script: { level: "recorded", prepares: "the script and shot list", you: "record and edit it in your own tools", result: "views and replies you log" },
  competitor_brief: { level: "recorded", prepares: "a brief with sources", you: "read it and decide what it changes", result: "the decision you log in one line" },
  validation_kit: { level: "recorded", prepares: "the questions and a message to book people", you: "run the conversations", result: "what you heard, logged in one line" },
  pricing_test: { level: "recorded", prepares: "a price test you can run this week", you: "show the price to real people", result: "what they said or paid, logged in one line" },
  prospects: { level: "recorded", prepares: "where your first conversations are", you: "reach out to them", result: "who answered, logged" },
  build_plan: { level: "recorded", prepares: "the smallest useful version to build", you: "build it in your own tools", result: "shipped or blocked, logged in one line" },
  action_plan: { level: "recorded", prepares: "your first two concrete moves", you: "do them", result: "what happened, logged in one line" },
};

export function capabilityFor(kind: PrepKind): Capability {
  return MAP[kind];
}

export function capabilityLine(kind: PrepKind): string {
  const c = MAP[kind];
  return `BuildMind prepares ${c.prepares}. You ${c.you}. Result: ${c.result}.`;
}

/** Rules for the planner, so a recommended task is one the app can prepare, follow up and close. */
export function capabilityBlock(): string {
  return `
WHAT BUILDMIND CAN AND CANNOT DO (the task must fit this):
- BuildMind CAN: draft copy, messages, scripts, plans and briefs; publish a signup page and count its visits and signups; count clicks through tracked links; set follow-up reminders; log the founder's result in one line.
- BuildMind CANNOT: work inside other tools (design, video editing, coding, ads), send messages or post for the founder, or measure results that happen outside it unless the founder reports them.
- So every task must name ONE finished thing the founder can produce today, and ONE result that can be counted or reported in a single line (replies, signups, a decision, shipped or blocked).
- Prefer a task whose result BuildMind can count itself (signups on its page, replies logged, payments) over one nobody can check.
- If the task needs an outside tool, name that tool in the task, and make the deliverable something BuildMind can prepare first (the script, the copy, the checklist).`;
}
