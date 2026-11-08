/**
 * lib/work/registry.ts — everything BuildMind can prepare, as data.
 *
 * Two families share one catalogue:
 *  - SPECS: new kinds prepared by the general work engine (lib/work/engine.ts). A kind is a small declaration
 *    (the form to fill in, the shape of the result, the rules for the writer), so adding one is data, not code.
 *  - EXISTING: the original prepared-work kinds (outreach, landing copy, SEO, investor update and so on). They keep
 *    their own richer panel; the catalogue opens them with a task sentence that is checked by a test to select the
 *    right kind.
 * Pure and client-safe. Nothing here sends or posts anything for the founder.
 */
import type { PrepKind } from "@/lib/prep/kinds";

export type WorkGroup = "reach" | "validate" | "publish" | "raise" | "build";

export const GROUP_LABEL: Record<WorkGroup, { label: string; blurb: string }> = {
  reach: { label: "Reach people", blurb: "Messages, emails and pitches to the people you need" },
  validate: { label: "Check it's wanted", blurb: "Learn what people really think and do" },
  publish: { label: "Publish and sell", blurb: "Pages, posts and emails that explain and sell" },
  raise: { label: "Pitch and apply", blurb: "Investors, programs and grants" },
  build: { label: "Plan and build", blurb: "Specs, hiring and a content plan" },
};
export const GROUP_ORDER: WorkGroup[] = ["reach", "validate", "publish", "raise", "build"];

export type FieldType = "short" | "long" | "choice";
export interface WorkField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  optional?: boolean;
  max?: number;
}

export interface WorkSpec {
  id: string;
  group: WorkGroup;
  label: string;
  blurb: string;
  fields: WorkField[];
  /** variants: alternative versions of one text. sections: a structured document. */
  shape: "variants" | "sections";
  /** For variants: how many to write. */
  count?: number;
  /** What to write and how, in the writer's terms. */
  instruction: string;
  /** The part that stays with the founder. */
  you: string;
  /** Result contains figures the founder gave or must supply, so every number is checked. */
  claims?: boolean;
}

const short = (key: string, label: string, placeholder?: string, optional = false): WorkField => ({ key, label, type: "short", placeholder, optional, max: 200 });
const long = (key: string, label: string, placeholder?: string, optional = false): WorkField => ({ key, label, type: "long", placeholder, optional, max: 1500 });

export const WORK_SPECS: WorkSpec[] = [
  {
    id: "whatsapp_message", group: "reach", label: "WhatsApp message", blurb: "A natural first message, and a follow-up if they go quiet",
    fields: [short("who", "Who is it for?", "e.g. a final-year student I met at the hub"), short("goal", "What do you want them to do?", "e.g. try it for 5 minutes and tell me what confused them"), long("context", "What do they already know about you?", "Optional", true)],
    shape: "variants", count: 3,
    instruction: "Write 3 WhatsApp messages: (1) a short first message, (2) a first message that uses the context, (3) a gentle follow-up for when they have not replied after two days. Each under 70 words, conversational, no formal letter style, no greetings like 'Dear', one clear and easy ask. Do not include links unless the founder gave one.",
    you: "Send it yourself, from your own number.",
  },
  {
    id: "email_sequence", group: "reach", label: "Email sequence", blurb: "Three emails: first touch, a follow-up and a last nudge",
    fields: [short("audience", "Who are these emails for?", "e.g. clinic managers in Accra"), short("goal", "What should they do?", "e.g. book a 15-minute call"), long("offer", "What are you offering, in your own words?", "Optional", true)],
    shape: "variants", count: 3,
    instruction: "Write a 3-email sequence. Email 1: first touch. Email 2: follow-up for day 3, adds one new useful point. Email 3: last nudge for day 7, short and easy to say no to. Each starts with 'Subject: ...' on its own line, then the body. Under 120 words each. One ask per email. No fake urgency, no claims about results the founder has not stated.",
    you: "Send them from your own email, on the days suggested.",
  },
  {
    id: "partner_pitch", group: "reach", label: "Partner or community message", blurb: "Ask a group admin, partner or influencer for a favour",
    fields: [short("who", "Who are you writing to?", "e.g. the admin of the Accra Founders WhatsApp group"), short("benefit", "What is in it for them or their members?", "e.g. a free tool their members would use"), short("ask", "What are you asking for?", "e.g. permission to share a short post")],
    shape: "variants", count: 2,
    instruction: "Write 2 versions of a message asking this person for a favour. Lead with what is in it for them or their members, then the ask, then make it easy to say no. Under 110 words. No flattery, no pressure, no invented facts about them.",
    you: "Send it, and respect their answer.",
  },
  {
    id: "survey", group: "validate", label: "Short survey", blurb: "Questions that reveal what people actually do",
    fields: [short("learn", "What do you need to find out?", "e.g. how students currently find part-time work"), short("audience", "Who will answer it?", "e.g. university students")],
    shape: "sections",
    instruction: "Write a short survey as sections: 'Questions' (at most 8, each about what the person did or does today, never about what they would do in future; mix 2 multiple-choice with options written out and the rest open), 'How to run it' (where to share it and how many answers are enough to learn something), and 'What the answers mean' (how to read answers that support the idea and answers that do not). Do not ask leading questions.",
    you: "Build the form in your own tool and share it.",
  },
  {
    id: "moat_canvas", group: "validate", label: "Competitive edge check", blurb: "Grade each claimed edge, and see where you sit among competitors",
    fields: [
      long("edges", "What do you say makes you different? One per line", "e.g. Works offline\nPays out in mobile money\nBuilt for market traders", false),
      short("competitors", "Who do people use today? Names, separated by commas", "e.g. Excel, a WhatsApp group, Acme", false),
      long("proof", "What have customers actually said or done about these?", "Real quotes or actions only. Leave blank if none.", true),
    ],
    shape: "sections",
    instruction: "Write a competitive edge check as sections. Section 'Edge check': one bullet per edge the founder listed, in the form 'Edge: grade. Reason.' where grade is exactly one of 'Backed by what customers did', 'Plausible, not yet tested' or 'Easy to copy'. Use 'Backed by what customers did' ONLY when the founder's proof field shows customers saying or doing something that supports that edge; otherwise choose between the other two and say why in one sentence. Section 'Hardest to copy': name the one edge that would take a competitor longest to match and why, or say none of them yet. Section 'Our read: where you sit': describe, in plain sentences, how the founder's product differs from each named competitor on the two things that matter most to this audience (say which two). Start this section with 'This is our read from what you told us, not measured data.' Only discuss competitors the founder named; do not invent competitor features, prices or customers. Section 'Test this week': one cheap way to check the weakest edge with real customers.",
    you: "Ask real customers about the edges marked untested, and correct anything here that is wrong.",
  },
  {
    id: "objection_sheet", group: "validate", label: "Objection answers", blurb: "What people will push back on, and honest replies",
    fields: [long("offer", "What are you asking people to do or buy?", "e.g. pay GHS 50 a month for weekly business reports", true), short("audience", "Who will push back?", "e.g. small shop owners")],
    shape: "sections",
    instruction: "Write the 6 most likely objections this audience would raise, as sections. Each section's heading is the objection in the customer's own words; the body gives an honest reply that does not dodge, and one question to ask back to learn the real reason. Never promise results. If an objection is valid, say so and say what would change it.",
    you: "Practise the replies out loud, then use them in real conversations.",
  },
  {
    id: "one_pager", group: "publish", label: "One-page overview", blurb: "A clear page that says what it is, for whom and why",
    fields: [short("audience", "Who is it for?", "e.g. freelance designers"), long("offer", "What does it do, in plain words?", "", false), long("proof", "Any real proof you have?", "e.g. 12 people on the waitlist (only things that are true)", true)],
    shape: "sections", claims: true,
    instruction: "Write a one-page overview as sections: 'Headline' (one sentence a stranger understands), 'The problem', 'What it does', 'How it works' (3 steps), 'Proof' (only what the founder gave; otherwise write [add: your first real result]), and 'Call to action'. Plain words, no buzzwords, no invented numbers or customers.",
    you: "Put it on a page or share it as a document.",
  },
  {
    id: "faq", group: "publish", label: "FAQ", blurb: "The questions people will ask, answered plainly",
    fields: [short("audience", "Who will read it?", "e.g. first-time users"), long("topics", "Anything specific to cover?", "Optional", true)],
    shape: "sections",
    instruction: "Write an FAQ of 8 questions as sections; each heading is the question, each body a 1-3 sentence plain answer. Cover what it is, who it is for, how it works, what it costs (write [add: price] if unknown), how to get started, what data it uses, what it cannot do, and how to get help. Do not invent features, prices or policies.",
    you: "Check each answer is true, then publish it.",
  },
  {
    id: "pricing_page", group: "publish", label: "Pricing page copy", blurb: "Plans, headline and the questions people have about paying",
    fields: [long("plans", "What do people get, and what are the plans?", "Say what you plan to charge, or leave blank", true), short("audience", "Who pays?", "e.g. small businesses")],
    shape: "sections", claims: true,
    instruction: "Write pricing page copy as sections: 'Headline', one section per plan (name, who it is for, what is included, price exactly as the founder gave it or [add: price]), 'Questions about paying' (refunds, how to pay, cancelling; mark anything the founder has not decided with [add: ...]), and 'Reassurance' (one honest line). Never invent a price, a discount or a guarantee.",
    you: "Decide the real prices and publish the page.",
  },
  {
    id: "onboarding_email", group: "publish", label: "Welcome emails", blurb: "A welcome message and a nudge that get people to a first win",
    fields: [short("firstWin", "What is a new user's first win?", "e.g. uploading their first invoice"), short("audience", "Who signs up?", "e.g. freelancers")],
    shape: "variants", count: 2,
    instruction: "Write 2 emails: (1) a welcome email sent right after signup and (2) a nudge sent on day 2 to people who have not reached the first win. Each starts with 'Subject: ...', under 110 words, one clear next step, plain and warm. Do not promise features the founder did not mention.",
    you: "Set them up in your email tool or send them by hand.",
  },
  {
    id: "announcement", group: "publish", label: "Announcement", blurb: "Tell people what is new, as a short post and a longer one",
    fields: [short("what", "What is new?", "e.g. you can now pay with mobile money"), short("audience", "Who should care?", "e.g. current users and people on the waitlist")],
    shape: "variants", count: 3,
    instruction: "Write 3 versions of an announcement: a short post (under 60 words), a longer post (under 150 words) and an email (with 'Subject: ...' first line, under 150 words). Lead with what changes for the reader. No hype words, no claims beyond what the founder said.",
    you: "Post or send it where your audience already is.",
  },
  {
    id: "pitch_outline", group: "raise", label: "Pitch outline", blurb: "A 10-slide outline with what to say on each",
    fields: [long("traction", "What traction or proof do you have?", "Only real things. Leave blank if none yet.", true), short("ask", "What are you asking for?", "e.g. a GHS 100,000 pre-seed, or feedback", true)],
    shape: "sections", claims: true,
    instruction: "Write a 10-slide pitch outline as sections, one per slide, heading 'Slide N: title'. Each body has 2-3 short bullets of what goes on the slide and one 'Say:' line. Slides: problem, who has it, solution, how it works, why now, traction (only what the founder gave, else [add: your first real result]), market (no invented market sizes; write [add: your own sizing]), business model, team, the ask. Never invent numbers.",
    you: "Build the slides in your own tool and rehearse.",
  },
  {
    id: "application", group: "raise", label: "Program or grant application", blurb: "Draft answers to the questions you were asked",
    fields: [short("program", "Which program or grant?", "e.g. a local accelerator"), long("questions", "Paste the questions", "One per line", false)],
    shape: "sections", claims: true,
    instruction: "Answer each pasted question as its own section; the heading is the question. Write from the project facts given. Where the answer needs a fact, number or story the founder has not given, write [add: ...] saying exactly what is needed instead of inventing it. Plain, specific, no buzzwords. If a question asks for a number you do not have, say so in the section.",
    you: "Fill every [add: ...], check the facts and submit it yourself.",
  },
  {
    id: "investor_intro", group: "raise", label: "Investor intro", blurb: "A short email to an investor, and a shorter message version",
    fields: [short("investor", "Who is the investor, and why them?", "e.g. a partner who invests in African fintech"), long("traction", "Real traction to mention", "Only true things", true)],
    shape: "variants", count: 2, claims: true,
    instruction: "Write 2 versions: a cold email ('Subject: ...' first line, under 130 words) and a shorter LinkedIn message (under 70 words). Lead with the one reason this investor should care, then what the startup does in one sentence, then real traction only as given (else [add: your first real result]), then a small ask (a 15-minute call). No hype, no invented numbers or names.",
    you: "Send it yourself. Personalise the first line.",
  },
  {
    id: "prd", group: "build", label: "One-page spec", blurb: "What to build, for whom, and what to leave out",
    fields: [short("feature", "What do you want to build?", "e.g. a way for users to invite a teammate"), short("user", "Who needs it?", "e.g. team leads")],
    shape: "sections",
    instruction: "Write a one-page product spec as sections: 'Problem', 'Who it is for', 'User stories' (3-5, 'As a ..., I want ..., so that ...'), 'In scope', 'Not now' (things to leave out on purpose), 'How we will know it works' (a measurable check the founder can run; no invented targets), and 'Open questions'. Keep it small enough to build in days.",
    you: "Build it in your own tools.",
  },
  {
    id: "job_post", group: "build", label: "Freelancer or hire brief", blurb: "A clear brief for the first person who helps you",
    fields: [short("role", "What role or task?", "e.g. a part-time designer for the app"), long("tasks", "What will they do?", "A few lines"), short("budget", "Budget or pay, if decided", "Leave blank if not", true)],
    shape: "variants", count: 2,
    instruction: "Write 2 versions: a full brief (what the project is, what the person will do, what a good result looks like, how to apply, pay as given or [add: pay]) and a short DM version (under 70 words) to send to someone directly. No invented company facts, no inflated requirements.",
    you: "Post it or send it, and choose who to work with.",
  },
  {
    id: "content_calendar", group: "build", label: "Two-week content plan", blurb: "What to post and when, tied to one goal",
    fields: [short("channels", "Which channels?", "e.g. LinkedIn and WhatsApp status"), short("goal", "What is the goal?", "e.g. 20 people on the waitlist")],
    shape: "sections",
    instruction: "Write a two-week content plan as two sections, 'Week 1' and 'Week 2', each with up to 7 bullets of the form 'Day N: channel: the post or message itself, ready to paste (under 50 words)'. Write the real words, not a topic. Give every day a different angle: a lesson from the founder's own experience, a mistake and what it taught, a question that invites replies, a short teardown, a small useful tip. Never repeat an angle, and never say 'behind-the-scenes' twice. Use plain, everyday words and no startup jargon. For public communities such as Reddit or forums, give value only and no link; at most one soft line such as 'I built a tool for this, it is in my profile if you want to try it', and never in the first week. For WhatsApp or direct messages, write one-to-one notes to a single person, never a broadcast. Use only facts the founder gave. No invented results, numbers or customers; mark anything missing as [add: ...].",
    you: "Write and post each item yourself.",
  },
];

export const SPEC_BY_ID: Record<string, WorkSpec> = Object.fromEntries(WORK_SPECS.map((s) => [s.id, s]));

export interface ExistingEntry { kind: PrepKind; group: WorkGroup; label: string; blurb: string; task: string }

/** The original prepared-work kinds, each opened with a sentence that selects it (checked by a test). */
export const EXISTING: ExistingEntry[] = [
  { kind: "outreach", group: "reach", label: "Outreach messages", blurb: "Three tailored messages and a follow-up", task: "Write outreach messages to reach my first users" },
  { kind: "prospects", group: "reach", label: "Where to find people", blurb: "Real places and live conversations", task: "Find 10 founders to talk to" },
  { kind: "validation_kit", group: "validate", label: "Interview kit", blurb: "Questions and a message to book people", task: "Prepare customer interviews to validate my idea" },
  { kind: "competitor_brief", group: "validate", label: "Competitor brief", blurb: "Who else exists, with sources", task: "Research my competitors" },
  { kind: "pricing_test", group: "validate", label: "Pricing test", blurb: "A way to learn what people will pay", task: "Design a pricing test" },
  { kind: "landing", group: "publish", label: "Landing page", blurb: "Copy and a live signup page", task: "Write the landing page copy" },
  { kind: "post", group: "publish", label: "Post draft", blurb: "A first draft ready to post", task: "Write a post to publish" },
  { kind: "launch_plan", group: "publish", label: "Launch plan", blurb: "Titles, first comment and timing", task: "Plan my Product Hunt launch" },
  { kind: "seo", group: "publish", label: "SEO brief", blurb: "A page brief grounded in what ranks now", task: "Write an SEO brief" },
  { kind: "video_script", group: "publish", label: "Video script", blurb: "A script and shot list", task: "Write a short demo video script" },
  { kind: "investor_update", group: "raise", label: "Investor update", blurb: "An update from your real record", task: "Draft an investor update" },
  { kind: "build_plan", group: "build", label: "Build plan", blurb: "The smallest useful version to build", task: "Plan what to build next for my MVP" },
  { kind: "action_plan", group: "build", label: "Action plan", blurb: "Your next move, broken into steps", task: "Break my first move into small steps" },
];

/** Pictures drawn from the founder's own record. No model writes them, so there is no form to fill in. */
export interface VisualEntry { id: string; group: WorkGroup; label: string; blurb: string; kind: "stress" | "pmf" | "market" | "investor" }
export const VISUALS: VisualEntry[] = [
  { id: "visual:stress", group: "build", label: "Milestone stress test", blurb: "Which target dates you will miss at your real pace", kind: "stress" },
  { id: "visual:pmf", group: "build", label: "PMF evidence", blurb: "Six signs of fit, observed or not, no score", kind: "pmf" },
  { id: "visual:market", group: "publish", label: "Market Watch", blurb: "Weekly changes in competitor prices, pages and threads (Builder)", kind: "market" },
  { id: "visual:investor", group: "raise", label: "Investor snapshot", blurb: "One page of real traction numbers, nothing estimated", kind: "investor" },
];

/** Small interactive tools that are not a form-then-document flow. */
export interface ToolEntry { id: string; group: WorkGroup; label: string; blurb: string; kind: "screenshot" }
export const TOOLS: ToolEntry[] = [
  { id: "tool:screenshot", group: "publish", label: "Screenshot review", blurb: "Upload a landing page or app screen and get specific fixes (Builder)", kind: "screenshot" },
];

export interface CatalogEntry { id: string; group: WorkGroup; label: string; blurb: string; source: "spec" | "existing" | "visual" | "tool" }

export function catalog(): CatalogEntry[] {
  return [
    ...WORK_SPECS.map((s) => ({ id: s.id, group: s.group, label: s.label, blurb: s.blurb, source: "spec" as const })),
    ...EXISTING.map((e) => ({ id: `existing:${e.kind}`, group: e.group, label: e.label, blurb: e.blurb, source: "existing" as const })),
    ...VISUALS.map((v) => ({ id: v.id, group: v.group, label: v.label, blurb: v.blurb, source: "visual" as const })),
    ...TOOLS.map((t) => ({ id: t.id, group: t.group, label: t.label, blurb: t.blurb, source: "tool" as const })),
  ];
}

/** Case-insensitive match on label and blurb. */
export function searchCatalog(entries: CatalogEntry[], q: string): CatalogEntry[] {
  const t = q.trim().toLowerCase();
  if (!t) return entries;
  return entries.filter((e) => `${e.label} ${e.blurb}`.toLowerCase().includes(t));
}
