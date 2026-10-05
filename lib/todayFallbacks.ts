/**
 * lib/todayFallbacks.ts — the last-resort task when generation fails the
 * quality bar. One bank per mission kind, so a "ship something" day never
 * degrades into a LinkedIn DM template, and none of the text contains a
 * [placeholder] the founder has to fill in.
 */

import type { MissionKind } from "@/lib/todayMission";

export interface FallbackInput {
  userType: string;
  problemDesc: string;
  productName: string;
  stage: string;
}

export interface KindFallback {
  action: string;
  platform: string;
  /** Empty string when the kind has no paste-ready draft. */
  message: string;
  why: string;
  time: string;
  done_when: string;
  first_step: string;
}

type Variant = (i: FallbackInput) => KindFallback;

const BANK: Record<MissionKind, Variant[]> = {
  interview: [
    ({ userType, problemDesc }) => ({
      action: `Book or hold 2 twenty-minute conversations with ${userType} about the last time ${problemDesc} cost them time or money.`,
      platform: "Phone call",
      message: `Hi, I'm researching how people deal with ${problemDesc}. Could I ask you three questions about the last time it happened? 15 minutes, no pitch.`,
      why: `Stories about what someone did last time are more reliable than opinions about what they would do.`,
      time: "40 minutes",
      done_when: `Two conversations are held or on the calendar, and each has three lines of notes.`,
      first_step: `Open your contacts and pick the 2 people who most recently dealt with ${problemDesc}.`,
    }),
    ({ userType, problemDesc }) => ({
      action: `Ask 3 ${userType} to walk you through how they handle ${problemDesc} today, step by step, and write down every workaround they mention.`,
      platform: "Video call",
      message: `Could you show me how you currently handle ${problemDesc}? I just want to watch and ask why at each step. 15 minutes.`,
      why: `Workarounds are the clearest evidence that a problem is real and painful enough to pay for.`,
      time: "45 minutes",
      done_when: `You have a written list of the workarounds from 3 people.`,
      first_step: `Message the first of the 3 people with the request above.`,
    }),
  ],
  outreach: [
    ({ userType, problemDesc }) => ({
      action: `Send 5 personal messages to ${userType} on LinkedIn that ask about ${problemDesc} and mention one specific detail from each person's profile.`,
      platform: "LinkedIn",
      message: `Hi, I saw your work and wanted to ask: how do you handle ${problemDesc} right now? I'm not selling anything, I'm trying to learn what actually works.`,
      why: `Five specific messages beat fifty generic ones, and replies tell you who feels this problem.`,
      time: "30 minutes",
      done_when: `Five messages are sent, each with a profile-specific first line.`,
      first_step: `Search LinkedIn for ${userType} and open the first 5 profiles in tabs.`,
    }),
    ({ userType, problemDesc }) => ({
      action: `Send 3 WhatsApp messages to people you know who match ${userType}, asking what they did the last time ${problemDesc} came up.`,
      platform: "WhatsApp",
      message: `Quick one: last time ${problemDesc} came up for you, what did you actually do? Trying to understand how people cope with it.`,
      why: `People you know answer fast, so you learn something today instead of waiting on strangers.`,
      time: "20 minutes",
      done_when: `Three messages are sent and any replies are pasted into your notes.`,
      first_step: `Scroll your WhatsApp chats and pick the 3 closest matches.`,
    }),
  ],
  follow_up: [
    ({ productName }) => ({
      action: `Go back to the 3 people who replied or tried ${productName} most recently and ask each one a single yes/no question that moves them to a next step.`,
      platform: "Whatever channel they replied on",
      message: `Thanks again for your time. Would it be useful if I set this up for you this week? A yes or no is all I need, either answer helps.`,
      why: `People who already engaged are your warmest evidence. A clear question turns "maybe" into a real answer.`,
      time: "20 minutes",
      done_when: `Each of the 3 people has been asked a yes/no question and the answers are in your notes.`,
      first_step: `Open your last replies and list the 3 names.`,
    }),
  ],
  build: [
    ({ productName, problemDesc }) => ({
      action: `Ship the smallest working version of the one screen or flow in ${productName} that solves ${problemDesc}, then use it yourself end to end once.`,
      platform: "",
      message: "",
      why: `A thing someone can use beats a plan. Using it yourself end to end exposes the first real gap.`,
      time: "60 minutes",
      done_when: `It is deployed or runnable, and you have completed the flow once without help.`,
      first_step: `Write the single sentence that describes what the user does on this screen, then build only that.`,
    }),
    ({ productName }) => ({
      action: `Fix the single most embarrassing rough edge in ${productName} that a first-time user would hit in their first 2 minutes.`,
      platform: "",
      message: "",
      why: `First-minute friction decides whether anyone ever sees the value, and it is usually a small fix.`,
      time: "45 minutes",
      done_when: `A fresh signup can get through the first 2 minutes without hitting the issue.`,
      first_step: `Sign up as a new user in a private window and note the first thing that feels wrong.`,
    }),
  ],
  publish: [
    ({ productName, problemDesc, userType }) => ({
      action: `Publish one post on LinkedIn that describes a specific thing you learned about ${problemDesc} this week and ends with a question for ${userType}.`,
      platform: "LinkedIn",
      message: `This week I learned something specific about ${problemDesc} while building ${productName}. Here's what surprised me, and I'd like to know if you've seen the same thing.`,
      why: `A specific lesson attracts the right people, and the replies are free research.`,
      time: "30 minutes",
      done_when: `The post is live and you have the link.`,
      first_step: `Write the one surprising thing in a single sentence, then build the post around it.`,
    }),
  ],
  pricing: [
    ({ productName, userType }) => ({
      action: `Write the price and the exact offer for ${productName} in one place, then show it to 1 person from ${userType} and ask whether they would pay it today.`,
      platform: "",
      message: `${productName} would be a paid plan. If I offered it at that price, would you sign up this week? Honest answer please, a no helps me as much as a yes.`,
      why: `Nobody can tell you what they would pay until you show them a real number.`,
      time: "30 minutes",
      done_when: `A price is written down and one person has reacted to it.`,
      first_step: `Write your price and what it includes in two lines.`,
    }),
  ],
  analyze: [
    ({ productName }) => ({
      action: `Re-read every reply, note and analytics number you have for ${productName} and write a 3-line decision: what you saw, what you will do next, and what you will stop doing.`,
      platform: "",
      message: "",
      why: `You already have more evidence than you have acted on. Writing the decision forces the next move.`,
      time: "30 minutes",
      done_when: `Three lines are written down and pinned where you will see them tomorrow.`,
      first_step: `Open your notes and copy every real reply and number into one page.`,
    }),
  ],
  unblock: [
    ({ productName }) => ({
      action: `Pick the one thing you have been putting off on ${productName} and do only its first 20 minutes, rough is fine.`,
      platform: "",
      message: "",
      why: `Avoidance grows with delay. A rough start makes the rest ordinary work.`,
      time: "20 minutes",
      done_when: `A rough first version of that thing exists and you can show it.`,
      first_step: `Write the task name at the top of a blank page and set a 20 minute timer.`,
    }),
  ],
  reset: [
    ({ productName }) => ({
      action: `Make one small, visible improvement to ${productName} (a sentence on the landing page, a screenshot, a fixed typo) and send it to one person.`,
      platform: "",
      message: "",
      why: `After a rough stretch, a finished small thing rebuilds the habit faster than a big task.`,
      time: "15 minutes",
      done_when: `The change is live and one person has seen it.`,
      first_step: `Open ${productName} and pick the first small thing you notice.`,
    }),
  ],
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function fallbackForKind(kind: MissionKind, input: FallbackInput, seed = ""): KindFallback {
  const variants = BANK[kind] ?? BANK.reset;
  return variants[hash(seed || `${kind}:${input.stage}`) % variants.length](input);
}
