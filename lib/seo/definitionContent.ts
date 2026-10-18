/**
 * Extra, genuinely useful content for the four definition pages. Written for
 * founders anywhere (plain international English, no region-specific idioms).
 * Kept as data so the pages stay small and the FAQ JSON-LD always matches the
 * visible text.
 */
export interface Extras {
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
  faq: Array<{ q: string; a: string }>;
}

export const EXTRAS: Record<"founder-drift" | "startup-cognitive-load" | "execution-memory" | "founder-execution-intelligence", Extras> = {
  "founder-drift": {
    sections: [
      {
        heading: "What drift looks like in practice",
        paragraphs: [
          "Drift rarely announces itself. It shows up as small, reasonable-sounding changes in how you work. You still think about the startup every day, but the thinking stops turning into output.",
        ],
        bullets: [
          "The gap between work sessions grows from one day to three, then to a week.",
          "You keep \"researching\" or \"planning\" instead of shipping, because planning never feels like failing.",
          "The same kind of task, such as talking to users or posting publicly, keeps moving to tomorrow.",
          "Opening the project feels heavier each time, because you have to rebuild the context first.",
          "You start a new side idea because it feels lighter than the one you are avoiding.",
        ],
      },
      {
        heading: "A simple way to catch it early",
        paragraphs: [
          "Look at the last two weeks and write down three numbers: how many days you did real work on the startup, how many of those produced something another person could see (a message sent, a page published, a feature shipped), and what kind of work you have not touched at all.",
          "If the first number is falling, or the third list keeps containing the same item, that is drift. It is information, not a character flaw. In most cases the cause is an unclear next step or a task that feels too big, not a lack of motivation.",
        ],
      },
      {
        heading: "How to restart without a big reset",
        paragraphs: [
          "The instinct after a gap is to make a grand plan. That usually makes drift worse, because a big plan raises the cost of starting. What works better is a deliberately small restart: one task, ten to twenty minutes, with a visible result, done today.",
          "Pick the smallest action that moves the part of the startup you have been avoiding. Send one message to one potential user. Publish one rough paragraph. Fix one blocking bug. The goal is not progress on the whole project. It is to prove to yourself that starting is cheap again.",
        ],
      },
    ],
    faq: [
      { q: "What is founder drift?", a: "Founder drift is a gradual loss of execution rhythm. There is no single decision to quit, but the gaps between work sessions keep getting longer until the startup is quietly not being worked on." },
      { q: "Is founder drift the same as burnout?", a: "No. Burnout is acute exhaustion that a founder can usually name. Drift is ambient: you may still have energy, but you have lost the routine that turned it into shipped work." },
      { q: "How do I stop drifting on my startup?", a: "Make the restart small. Choose one task you can finish in ten to twenty minutes that produces something visible, do it today, and repeat it tomorrow. Avoid rebuilding a large plan first." },
      { q: "How long does drift usually last before it becomes a problem?", a: "There is no fixed number, but two or more weeks with no visible output, or one category of work avoided repeatedly, is a good signal to act rather than wait." },
    ],
  },

  "startup-cognitive-load": {
    sections: [
      {
        heading: "Where the load comes from",
        paragraphs: [
          "A solo founder makes hundreds of small decisions that an employee never sees: what to work on first, whether a task is worth doing, what to ignore, and whether last week's plan still makes sense. None of these are the work itself, yet each one spends the same limited attention the work needs.",
        ],
        bullets: [
          "Choosing between many reasonable tasks with no one to say which comes first.",
          "Re-deciding priorities every morning because yesterday's plan went stale.",
          "Tracking context across tools, notes and half-finished threads.",
          "Judging your own progress with no outside reference point.",
        ],
      },
      {
        heading: "How to reduce it without doing less",
        paragraphs: [
          "The aim is not to work less. It is to spend fewer decisions on what to work on, so more attention reaches the work. A few habits help most.",
        ],
        bullets: [
          "Decide tomorrow's first task before you stop today, so the morning starts with an action, not a choice.",
          "Limit yourself to one primary task per day. Everything else is optional.",
          "Write down why you chose a task. When you doubt it later, you can check the reason instead of deciding again.",
          "Batch similar decisions, such as pricing or positioning, into one scheduled session instead of letting them interrupt you daily.",
          "Keep one place where the current state of the project lives.",
        ],
      },
      {
        heading: "Cognitive load and big decisions",
        paragraphs: [
          "High load makes people worse at exactly the decisions that matter most. When you are tired or overloaded, irreversible choices such as pivoting, quitting or changing the product feel more urgent than they are. A good rule is to postpone any large, hard-to-undo decision until you have slept and the load has dropped, and to use the low-energy time for small tasks that keep momentum.",
        ],
      },
    ],
    faq: [
      { q: "What is startup cognitive load?", a: "It is the mental overhead of deciding what to work on and keeping the whole project in your head, separate from the effort of the work itself." },
      { q: "Why do solo founders feel decision fatigue?", a: "Because every prioritisation, trade-off and judgement call falls on one person. With no team to share them, the volume of small decisions adds up quickly." },
      { q: "How can I lower decision fatigue as a founder?", a: "Pick the next day's first task in advance, limit yourself to one main task per day, record why you chose it, and batch recurring strategic decisions into a single scheduled session." },
      { q: "Should I make big decisions when I am exhausted?", a: "It is better not to. Postpone irreversible decisions until you have rested, and use low-energy time for small, finishable tasks." },
    ],
  },

  "execution-memory": {
    sections: [
      {
        heading: "Execution memory versus notes and task lists",
        paragraphs: [
          "A task list records what you intended to do. Notes record what you thought. Execution memory records what actually happened and what it implies: which kinds of tasks you finish, which you keep postponing, what usually precedes a productive day, and which advice you ignored.",
          "That difference matters because intentions and behaviour often diverge. A founder may plan outreach every week and complete it twice in two months. A task list shows a long list of unfinished items. Execution memory shows a pattern: outreach is the avoided category, and it gets done only when the task is small and specific.",
        ],
      },
      {
        heading: "What a useful execution memory contains",
        paragraphs: ["Keep it factual and short. The most useful entries are:"],
        bullets: [
          "Outcomes: what you tried, whether you finished it, and what happened.",
          "Avoidance: the categories of work that keep slipping, with counts, not guesses.",
          "Conditions: the time of day, task size or context in which you tend to finish things.",
          "Decisions: what you chose, why, and what would change your mind.",
        ],
      },
      {
        heading: "Why starting from zero every session is expensive",
        paragraphs: [
          "Without a record, every planning session restarts from your current mood. You repeat advice you already tried, rediscover blockers you already hit, and overestimate how much you can do. With a record, the next step can account for your real track record, which is a far better predictor than your intentions.",
        ],
      },
    ],
    faq: [
      { q: "What is execution memory?", a: "A persistent record of how a founder actually works: outcomes, avoided categories of work and the conditions in which progress happens, carried forward between sessions." },
      { q: "How is execution memory different from a to-do list?", a: "A to-do list shows what you planned. Execution memory shows what you actually did, which patterns repeat, and what that suggests for your next task." },
      { q: "How can I start building one by hand?", a: "At the end of each working day, write one line on what you tried, whether you finished it, and what got in the way. After two weeks, read the lines back and look for repeated blockers." },
      { q: "Does an AI tool need execution memory to be useful?", a: "It helps a great deal. Advice based on your recorded behaviour is more specific and more realistic than generic advice, because it reflects what you actually do." },
    ],
  },

  "founder-execution-intelligence": {
    sections: [
      {
        heading: "The problem it solves",
        paragraphs: [
          "Most founders do not lack ideas or information. They lack a reliable answer to one question: what is the most valuable thing I can do next, given where the startup is and what I am actually able to do today? General productivity tools help organise work but do not answer it.",
          "Founder execution intelligence is the practice, and the software category, of answering that question from evidence: your stage, your recent outcomes, the work you avoid, and your current capacity, instead of from a generic template.",
        ],
      },
      {
        heading: "What separates it from a planner or a chatbot",
        paragraphs: [],
        bullets: [
          "It decides, rather than presenting a list to choose from.",
          "It remembers outcomes, so tomorrow's task reflects what happened today.",
          "It names patterns such as drift and avoidance instead of leaving you to notice them.",
          "It respects capacity: a tired founder gets a smaller version of an important task, not busywork, and big decisions are held until you are rested.",
          "It asks for observable progress, such as a message sent or a page published, instead of vague activity.",
        ],
      },
      {
        heading: "Who it is for",
        paragraphs: [
          "It is built for solo and early-stage founders anywhere who are building alone, do not have a manager or advisor to set priorities, and tend to lose days to deciding what to do. If you can already name your next task every morning and finish it, you do not need it. If you often sit down unsure where to start, it is aimed at you.",
        ],
      },
    ],
    faq: [
      { q: "What is founder execution intelligence?", a: "A system that decides the highest-value next action for a founder from evidence about their stage, recent outcomes, avoided work and current capacity." },
      { q: "How is it different from a to-do app or project manager?", a: "A to-do app stores tasks you write. An execution intelligence system chooses the next task for you, learns from the result, and adjusts when you are tired or avoiding something." },
      { q: "Is it only for solo founders?", a: "It is designed for solo and very early teams, where one person carries every decision. Larger teams usually have others to help set priorities." },
      { q: "Can I test my startup idea before using it?", a: "Yes. The free Break My Startup tool gives a scored stress test of an idea in about 30 seconds, without an account." },
    ],
  },
};
