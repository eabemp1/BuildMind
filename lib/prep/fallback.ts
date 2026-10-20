/**
 * When a full draft cannot be generated (model down, guards rejected
 * everything, no search), the founder still gets a useful, honest structure
 * built from their own task. It says plainly that it is a starting point.
 */
import { PREP_META, normalizePrepared, type PrepKind, type Prepared } from "@/lib/prep/kinds";

const HOW: Record<PrepKind, { heading: string; bullets: string[] }> = {
  outreach: { heading: "How to write it", bullets: ["Open with something about them, not your product.", "Ask one question about what they did the last time this came up.", "Keep it under 70 words and name one real detail from their profile or post."] },
  post: { heading: "How to write it", bullets: ["Start with a specific moment, not a lesson.", "Say what you actually saw, with a number if you have one.", "End with one question people can answer in a sentence."] },
  landing: { heading: "What the page needs", bullets: ["A headline that names the outcome the reader wants.", "Three benefits, each tied to the problem you solve.", "One call to action.", "Real proof you still need to add: a number, a quote or a screenshot."] },
  seo: { heading: "What the brief needs", bullets: ["One primary keyword and three related phrases.", "A title of 60 characters or fewer and a meta description of 155 or fewer.", "An outline of the questions the page must answer.", "The gap the pages that rank today leave open."] },
  investor_update: { heading: "What the update needs", bullets: ["What you did, with real numbers.", "What you learned.", "One specific ask.", "Mark any missing number as [add: ...] instead of guessing."] },
  competitor_brief: { heading: "What the brief needs", bullets: ["Three to five real alternatives, each with a source link.", "What each does and where it falls short, as hypotheses to check.", "One angle where you could differ."] },
  validation_kit: { heading: "What the kit needs", bullets: ["Five to ten people who really have the problem.", "Questions about what they did last time, never what they would do.", "What counts as real evidence, decided before you talk."] },
  video_script: { heading: "What the script needs", bullets: ["Open on the viewer's problem, not the logo.", "Show one real screen doing one real thing.", "On-screen captions of eight words or fewer.", "An end card with one line and the link."] },
  build_plan: { heading: "How to cut it down", bullets: ["Decide the smallest version that still teaches you something.", "Write what you will leave out.", "Break it into steps that each take under an hour.", "Say how you will know it is done without asking anyone."] },
  launch_plan: { heading: "What the launch needs", bullets: ["Three plain titles, no hype, 80 characters or fewer.", "A first comment from you: who built it, why, and one thing you want feedback on.", "Reply to every comment in the first hour.", "Never ask for upvotes."] },
  pricing_test: { heading: "How to test a price", bullets: ["Ask what they pay today for the problem and what they tried before.", "Show one price and watch what they say, not what they promise.", "A real signal is a card, a deposit or a booked follow-up."] },
  prospects: { heading: "How to find them", bullets: ["Pick one place where your users already talk about the problem.", "Read the last month of posts and note who describes it in their own words.", "Message one person at a time, about what they wrote."] },
  action_plan: { heading: "How to start", bullets: ["Do the first move below before anything else.", "Work in one block of 25 minutes, then stop and note what happened.", "Write down one thing you can see that proves it is done."] },
};

export function fallbackPrep(kind: PrepKind, task: string, firstStep?: string): Prepared {
  const how = HOW[kind] ?? HOW.action_plan;
  const sections = [
    ...(firstStep ? [{ heading: "First move", body: firstStep.slice(0, 300) }] : []),
    { heading: how.heading, bullets: how.bullets },
    { heading: "Done when", bullets: ["You can point to one thing that now exists or has changed, and say what you learned."] },
  ];
  return {
    ...normalizePrepared({ title: PREP_META[kind].label, summary: `A starting structure for: ${task.slice(0, 140)}`, sections }, kind, {
      needs: [{ label: "A full draft was not available just now", why: "This is a starting structure built from your task. Press Redo to try the full draft." }],
    }),
    degraded: true,
  };
}
