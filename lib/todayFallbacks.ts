/**
 * lib/todayFallbacks.ts — the last-resort task when generation fails the
 * quality bar. One bank per mission kind, so a "ship something" day never
 * degrades into a LinkedIn DM template, and none of the text contains a
 * [placeholder] the founder has to fill in.
 */

import type { MissionKind } from "@/lib/todayMission";
import type { Ledger } from "@/lib/today/facts";
import { guardRules } from "@/lib/today/rules";

export interface FallbackInput {
  userType: string;
  problemDesc: string;
  productName: string;
  stage: string;
  /** What the founder said got in the way last time, when yesterday ended blocked. */
  blocker?: string;
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

/** Yesterday ended blocked: today is about that block, not a repeat of the same ask. */
function aroundBlocker(blocker: string): KindFallback {
  const b = blocker.trim().replace(/\s+/g, " ").slice(0, 120).replace(/[."]+$/, "");
  return {
    action: `Yesterday you got stuck on: "${b}". Write 3 ways around it, pick the cheapest, and do its first 10 minutes.`,
    platform: "",
    message: "",
    why: `Repeating the same ask would hit the same wall. Getting around the block is the progress today.`,
    time: "20 minutes",
    done_when: `You have one way around "${b}" and the first step of it is done.`,
    first_step: `Write the 3 ways around it, even rough ones, before you pick.`,
  };
}

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
    ({ productName, blocker }) => blocker ? aroundBlocker(blocker) : ({
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

// More variants per kind, so a founder who lands on a fallback does not see the same task every few days.
// Channels are not assumed: each says where, or leaves the choice to the founder.
const MORE: Partial<Record<MissionKind, Variant[]>> = {
  outreach: [
    ({ userType, problemDesc }) => ({
      action: `Message 5 ${userType} you can reach today, on whichever app you already use with them, and ask for one story about the last time ${problemDesc} cost them something.`,
      platform: "WhatsApp or the app you already use",
      message: `Hi, quick question. When did ${problemDesc} last cause you a problem, and what did you do about it? A one-line answer is enough.`,
      why: `People answer a question about their own week faster than a pitch, and the answers show who has the problem.`,
      time: "25 minutes",
      done_when: `Five messages are sent, and each names a specific person.`,
      first_step: `List the 5 closest ${userType} you can reach today.`,
    }),
  ],
  follow_up: [
    ({ productName }) => ({
      action: `Pick the one person who showed the most interest in ${productName} and send them a message that names the next step and a day to do it.`,
      platform: "Whatever channel you spoke on",
      message: `Thanks for your time earlier. Would Thursday work to show you a first version? If not, tell me what would make it useful.`,
      why: `Interest fades in days. A named next step with a date turns it into a yes or a clear no.`,
      time: "15 minutes",
      done_when: `One message with a next step and a day is sent.`,
      first_step: `Scroll your chats and pick the most interested person.`,
    }),
    ({ userType }) => ({
      action: `Send a thank-you and one new question to the ${userType} you talked to most recently, built on something they said.`,
      platform: "Whatever channel you spoke on",
      message: `You mentioned something I keep thinking about. One more question: what would have to be true for you to try a tool for this?`,
      why: `A second question from the same person shows how serious the problem is, at almost no cost.`,
      time: "15 minutes",
      done_when: `The message is sent and refers to something they said.`,
      first_step: `Re-read your notes from that conversation and pick one thing they said.`,
    }),
  ],
  publish: [
    ({ problemDesc, userType }) => ({
      action: `Write one short post about ${problemDesc} from the point of view of ${userType}, publish it in a group where they already talk, and answer every reply.`,
      platform: "A WhatsApp or Facebook group where they already talk",
      message: `For people dealing with ${problemDesc}: what is the part nobody warns you about? I'm collecting stories.`,
      why: `Posting where the customers already talk costs nothing, and replies are research.`,
      time: "30 minutes",
      done_when: `The post is live and you have replied to every comment.`,
      first_step: `Pick the one group where your customers are most active.`,
    }),
    ({ productName }) => ({
      action: `Post a 30-second screen recording of ${productName} doing one thing, with a single sentence on what it replaces.`,
      platform: "WhatsApp status, Facebook or LinkedIn",
      message: `This is ${productName} doing one thing. It replaces the way you probably do it today. Does this look useful?`,
      why: `Showing it beats describing it, and the reactions tell you if the point lands.`,
      time: "30 minutes",
      done_when: `The recording is posted and you have the link.`,
      first_step: `Record yourself doing the one thing, once, without editing.`,
    }),
  ],
  pricing: [
    ({ productName, userType }) => ({
      action: `Ask 2 ${userType} what they pay today for the thing ${productName} replaces, and what price would feel fair for something better.`,
      platform: "",
      message: `What do you pay now to handle this, in money or time? And what would feel fair for something that does it for you?`,
      why: `What people already pay is a stronger guide than any number you invent.`,
      time: "30 minutes",
      done_when: `Two people have named what they pay now and a fair price.`,
      first_step: `Pick the 2 people you know who deal with this most.`,
    }),
  ],
  analyze: [
    ({ userType }) => ({
      action: `Put every conversation with ${userType} in one list and mark the pain each one named. Circle the pain that came up most.`,
      platform: "",
      message: "",
      why: `One pain mentioned by several people is your first real signal. Seeing it on one page stops you guessing.`,
      time: "30 minutes",
      done_when: `The list exists and one pain is circled with the number of people who named it.`,
      first_step: `Open your notes and copy the pain from each conversation into one list.`,
    }),
  ],
  unblock: [
    ({ blocker }) => blocker ? aroundBlocker(blocker) : ({
      action: `Name the one task you keep moving to tomorrow, write the first sentence or step of it, and send that to one person to hold you to it.`,
      platform: "",
      message: "",
      why: `Saying it to someone makes the first step real, and the first step is the hard part.`,
      time: "15 minutes",
      done_when: `The first step is written and one person has been told.`,
      first_step: `Write the task's name, then the very first thing you would do.`,
    }),
  ],
  reset: [
    ({ productName }) => ({
      action: `Close the oldest unfinished small thing on ${productName} (a reply, a bug, a note) and mark it done.`,
      platform: "",
      message: "",
      why: `Finishing one old thing clears the weight and makes the next task easier to start.`,
      time: "15 minutes",
      done_when: `One old item is finished and crossed off.`,
      first_step: `Pick the oldest item on your list that takes under 15 minutes.`,
    }),
  ],
};
(Object.keys(MORE) as MissionKind[]).forEach((k) => { BANK[k] = [...(BANK[k] ?? []), ...(MORE[k] ?? [])]; });

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Used only when every banked variant contradicts what the founder has said. Names no people, no channel. */
function safeFallback(i: FallbackInput): KindFallback {
  return {
    action: `Write down 3 specific people (names or exact handles) who could have the problem ${i.productName} solves, and where you would reach each one. Do not contact anyone yet.`,
    platform: "",
    message: "",
    why: `Your recent notes rule out the usual channels, so the useful move is a short list of real, reachable people.`,
    time: "20 minutes",
    done_when: `Three names or handles are written down, each with the place you would reach them.`,
    first_step: `Open a blank note and write the first person who comes to mind.`,
  };
}

export function fallbackForKind(kind: MissionKind, input: FallbackInput, seed = "", ledger?: Ledger): KindFallback {
  const variants = BANK[kind] ?? BANK.reset;
  const start = hash(seed || `${kind}:${input.stage}`) % variants.length;
  for (let n = 0; n < variants.length; n++) {
    const v = variants[(start + n) % variants.length](input);
    if (!ledger || guardRules(`${v.action} ${v.first_step}`, ledger, v.message).length === 0) return v;
  }
  return safeFallback(input);
}
