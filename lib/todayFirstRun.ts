/**
 * lib/todayFirstRun.ts — the first task a new founder sees.
 *
 * Free-form generation is least reliable on day one: there is no history, no contact list and no
 * reflection to ground it, and a bad first task is what decides whether someone comes back. So until a
 * founder has finished something (or been shown three tasks), the task comes from this small, hand-written
 * bank instead. Every entry:
 *   - needs no email address, no existing user and no contact list,
 *   - can be started in two minutes and finished in about 10 to 15,
 *   - is checked against the fact ledger like any other task, so one that clashes with something the
 *     founder said is skipped.
 * After the first finished task, normal generation takes over.
 */

import type { FallbackInput, KindFallback } from "@/lib/todayFallbacks";
import type { Ledger } from "@/lib/today/facts";
import { guardRules } from "@/lib/today/rules";
import { stageBand, type RecentTask } from "@/lib/todayMission";

const DONE = new Set(["completed", "partial", "learned"]);

/** True until the founder has finished a task or been shown three. */
export function isFirstRun(recent: RecentTask[]): boolean {
  return recent.length < 3 && !recent.some((t) => DONE.has(t.outcome ?? ""));
}

type Band = ReturnType<typeof stageBand>;
type Variant = (i: FallbackInput) => KindFallback;

const BANK: Record<Band, Variant[]> = {
  idea: [
    ({ productName }) => ({
      action: `Write down 3 specific people, or 3 specific places online, where someone with the problem ${productName} solves would be found.`,
      platform: "",
      message: "",
      why: `You can't talk to anyone until you know who and where. Three real names or places beat a vague audience.`,
      time: "10 minutes",
      done_when: `Three people or three named places are written down.`,
      first_step: `Open your notes and write the first person or place that comes to mind.`,
    }),
    ({ productName }) => ({
      action: `Finish this sentence in writing: "${productName} helps ___ stop ___." Then say it out loud to someone near you and write down their first question.`,
      platform: "In person or by voice note",
      message: "",
      why: `If someone can't repeat it back, a stranger won't understand it either. Their first question shows what is unclear.`,
      time: "10 minutes",
      done_when: `The sentence is written and you have one reaction or question noted down.`,
      first_step: `Type the sentence now, even badly, then improve it once.`,
    }),
  ],
  validation: [
    ({ productName }) => ({
      action: `Post one honest question in a group or community you're already in, asking how people deal with the problem ${productName} is meant to solve, and note the first 3 replies.`,
      platform: "A group you're already in",
      message: `Quick question for the group: how do you currently deal with this problem? I'm trying to learn what actually works. I'm not selling anything.`,
      why: `You don't need anyone's email to start. People in a group you already belong to will answer a plain question.`,
      time: "15 minutes",
      done_when: `The question is posted and the first replies are pasted into your notes.`,
      first_step: `Open the group where this problem comes up most often.`,
    }),
    ({ productName }) => ({
      action: `Write down every way people solve the problem ${productName} addresses today, including doing nothing, and one thing each way gets wrong.`,
      platform: "",
      message: "",
      why: `What people already do is the clearest sign of how much the problem hurts, and where you can be better.`,
      time: "15 minutes",
      done_when: `At least three current solutions are listed, each with one weakness.`,
      first_step: `Write down what you would do yourself if ${productName} did not exist.`,
    }),
  ],
  building: [
    ({ productName }) => ({
      action: `Open ${productName} in a private window as a stranger and write down the first 3 things that confuse you.`,
      platform: "",
      message: "",
      why: `You know your product too well to see it. A stranger's first two minutes decide whether anyone stays.`,
      time: "10 minutes",
      done_when: `Three confusing moments are written down, in the order you hit them.`,
      first_step: `Open a private or incognito window and go to your product's first page.`,
    }),
    ({ productName }) => ({
      action: `Ask one person in a group or chat you're already in to try ${productName} for 5 minutes and tell you where they got stuck.`,
      platform: "A group or chat you're already in",
      message: `I built something and need one honest tester. Would you try it for 5 minutes and tell me the first place you got stuck? No pressure.`,
      why: `One person using it teaches you more than another day of polishing, and you can ask them in a place you already are.`,
      time: "15 minutes",
      done_when: `The request is sent to one person and you have their reply or are waiting on it.`,
      first_step: `Pick the one group or chat where people are most likely to have this problem.`,
    }),
  ],
  launch: [
    ({ productName }) => ({
      action: `Write one sentence that says what ${productName} does and who it is for, and post it in one community you're already in.`,
      platform: "A community you're already in",
      message: `I built ${productName}. It's for people who deal with this problem every week. If that's you, I'd love your honest reaction.`,
      why: `Being seen once, clearly, tells you more than another week of preparing.`,
      time: "15 minutes",
      done_when: `The post is live and you have noted the first reaction.`,
      first_step: `Write the sentence in your notes first, then paste it into the post.`,
    }),
    ({ productName }) => ({
      action: `Send the link to ${productName} to 3 people you know and ask each one: "What would you use this for?"`,
      platform: "WhatsApp",
      message: `I just put something live. What's the first thing you think you'd use it for? One honest line is enough.`,
      why: `People who know you will answer fast, and their answer shows what the product looks like from outside.`,
      time: "15 minutes",
      done_when: `Three people have been asked and their answers are written down.`,
      first_step: `Pick 3 people from your chats who might care about this.`,
    }),
  ],
  growth: [
    ({ productName }) => ({
      action: `Look at where your last 5 users of ${productName} came from and write down which source brought the most.`,
      platform: "",
      message: "",
      why: `Put your effort where people are already arriving before you try anywhere new.`,
      time: "10 minutes",
      done_when: `You have a written count of sources for your last 5 users.`,
      first_step: `Open your list of users or sign-ups and check how each one found you.`,
    }),
    ({ productName }) => ({
      action: `Ask the most recent person who used ${productName} what almost stopped them from trying it, and write down their exact words.`,
      platform: "Whatever channel they replied on",
      message: `Thanks for trying it. What almost stopped you from signing up? One honest line helps me a lot.`,
      why: `The thing that almost stopped one person is likely stopping many who never reached you.`,
      time: "10 minutes",
      done_when: `You asked one person and saved their answer.`,
      first_step: `Open your last conversation with a user and send the question.`,
    }),
  ],
};

/**
 * The curated first task for this founder, or null when none fits (then normal generation runs).
 * `excludeAction` is the task they just replaced, so Replace never shows the same one back.
 */
export function firstRunTask(stage: string, input: FallbackInput, seed: string, ledger?: Ledger, excludeAction?: string): KindFallback | null {
  const band = stageBand(stage || "");
  // Every growth-stage task here starts from existing users. If the founder has none, normal generation (which reads the ledger) runs instead.
  if (band === "growth" && ledger?.facts.some((f) => f.kind === "no_users")) return null;
  const variants = BANK[band].map((v) => v(input)).filter((v) => v.action !== excludeAction);
  if (variants.length === 0) return null;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let n = 0; n < variants.length; n++) {
    const v = variants[(h + n) % variants.length];
    if (!ledger || guardRules(`${v.action} ${v.first_step}`, ledger, v.message).length === 0) return v;
  }
  return null;
}
