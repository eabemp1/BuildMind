/**
 * lib/taxonomy/taskTaxonomy.ts
 *
 * ONE task classifier for the whole app. It replaces four separate
 * first-regex-wins keyword lists (actionClassification, outcomeCorrelation,
 * founderIntelligence.actionCategory, temporalCoherence) that disagreed with
 * each other and collapsed most work into "other", "content creation" and
 * "direct outreach".
 *
 * How it works (deterministic, dependency-free, runs in the browser too):
 *   1. A task is tokenised and stemmed, so "messaged", "messaging" and
 *      "messages" are the same word.
 *   2. Every one of ~90 activity types ("leaves") is scored against ALL of its
 *      weighted phrases at once. Multi-word phrases outweigh single words, and
 *      words near the start of the task (usually the verb) outweigh later ones.
 *      The best score wins, but the margin to the runner-up is kept, so the
 *      result carries a real confidence and its alternates.
 *   3. Separate detectors read the CHANNEL (LinkedIn, WhatsApp, Figma, ...) and
 *      the AUDIENCE ("founders", "beta users", ...), so a label can say
 *      "Cold outreach · LinkedIn" and "founders" without a bucket per combination.
 *   4. Low-confidence results are never forced into a catch-all. They come back
 *      with `confident: false`, and callers skip them when learning patterns
 *      instead of recording "avoids other".
 *
 * An optional semantic second opinion for low-confidence tasks lives in
 * lib/taxonomy/semanticClassifier.ts (server only, uses embeddings).
 */

export type Purpose =
  | "evidence"      // learns something from outside the founder's head
  | "distribution"  // gets the product in front of people
  | "revenue"       // moves money
  | "build"         // makes the product
  | "plan"          // decides what to do
  | "ops"           // keeps the business running
  | "capital"       // raises or manages money
  | "people";       // hiring, partners, community

export type Domain =
  | "Customer discovery"
  | "Outreach & sales"
  | "Content & distribution"
  | "Launch & growth"
  | "Product engineering"
  | "Design & UX"
  | "Pricing & revenue"
  | "Research & strategy"
  | "Operations & admin"
  | "Fundraising & finance"
  | "Team & community"
  | "Learning & reflection";

export interface Leaf {
  id: string;
  label: string;
  domain: Domain;
  purpose: Purpose;
  /** 0-100: how much real-world evidence a completed task of this kind usually produces. */
  evidenceValue: number;
  /** Weighted phrases, pipe-separated. Prefix "!" marks a phrase that must NOT appear. */
  terms: string;
}

// prettier-ignore
export const LEAVES: Leaf[] = [
  // ── Customer discovery ──────────────────────────────────────────────────
  { id: "problem_interviews", label: "Problem interviews", domain: "Customer discovery", purpose: "evidence", evidenceValue: 100,
    terms: "customer discovery|problem interview|user interview|customer interview|interview users|interview customers|mom test|talk to users|talk to customers|talk to people who|speak with users|conversation with|ask them about|ask what they did|last time this problem|discovery conversation|15 minute chat|coffee chat|^interview" },
  { id: "churn_interviews", label: "Churn & exit interviews", domain: "Customer discovery", purpose: "evidence", evidenceValue: 95,
    terms: "^churned|why they left|why did they leave|cancel reason|exit interview|lost customer|stopped using|win back interview|reason for cancel" },
  { id: "usability_sessions", label: "Usability sessions", domain: "Customer discovery", purpose: "evidence", evidenceValue: 90,
    terms: "^usability|user test|user testing|watch them use|think aloud|walkthrough with user|prototype feedback|test session|observe a user|screen share session|guerrilla test" },
  { id: "feedback_collection", label: "Feedback & surveys", domain: "Customer discovery", purpose: "evidence", evidenceValue: 80,
    terms: "^survey|questionnaire|feedback form|collect feedback|gather feedback|google form|typeform|nps|poll|ask for feedback|user feedback|beta feedback|feedback from" },
  { id: "beta_onboarding", label: "Beta user onboarding", domain: "Customer discovery", purpose: "evidence", evidenceValue: 85,
    terms: "onboard beta|beta user|beta founder|beta tester|first beta|pilot user|pilot customer|early adopter|first ten users|first 10 users|welcome email|invite users|design partner" },
  { id: "customer_support", label: "Customer support", domain: "Customer discovery", purpose: "evidence", evidenceValue: 60,
    terms: "support ticket|support request|help a user|help user|respond to customer|reply to customer|troubleshoot|user bug report|answer questions from|support inbox|live chat" },
  { id: "testimonials", label: "Testimonials & case studies", domain: "Customer discovery", purpose: "distribution", evidenceValue: 55,
    terms: "^testimonial|case study|customer story|success story|review request|ask for a review|social proof|quote from customer" },
  { id: "customer_followup", label: "Customer follow-ups", domain: "Customer discovery", purpose: "evidence", evidenceValue: 75,
    terms: "check in with customer|check in with user|follow up with user|follow up with customer|ask for a referral|ask for referrals|how is it going with|usage check" },

  // ── Outreach & sales ────────────────────────────────────────────────────
  { id: "cold_outreach", label: "Cold outreach", domain: "Outreach & sales", purpose: "evidence", evidenceValue: 70,
    terms: "cold dm|cold email|cold message|cold call|cold outreach|prospecting|prospect list|message founders|message 3|message 5|message 10|dm founders|reach out to|send a dm|send dms|send messages to|personalized message|personalised message|message|outreach|dm" },
  { id: "warm_intros", label: "Warm intros & referrals", domain: "Outreach & sales", purpose: "evidence", evidenceValue: 75,
    terms: "warm intro|introduction to|introduce me|ask a friend to|^referral|network|mutual connection|intro request|ask your network" },
  { id: "sales_calls", label: "Sales calls & demos", domain: "Outreach & sales", purpose: "revenue", evidenceValue: 90,
    terms: "sales call|demo call|book a demo|schedule a demo|run a demo|pitch call|closing call|discovery call|negotiat|proposal|quote for|close the deal|close a deal|calendly" },
  { id: "follow_ups", label: "Follow-up sequences", domain: "Outreach & sales", purpose: "evidence", evidenceValue: 60,
    terms: "follow up|follow-up|nudge|reminder email|drip|email sequence|chase|second message|bump the thread|check back with" },
  { id: "waitlist_leads", label: "Waitlist & lead capture", domain: "Outreach & sales", purpose: "evidence", evidenceValue: 70,
    terms: "^waitlist|email capture|lead magnet|lead list|signup form|sign up form|capture emails|collect emails|early access list|lead generation|build a list" },
  { id: "partnerships", label: "Partnerships", domain: "Team & community", purpose: "people", evidenceValue: 60,
    terms: "partnership|partner with|co-market|co market|affiliate|reseller|integration partner|joint webinar|collaborate with|collab" },
  { id: "creator_outreach", label: "Creator & influencer outreach", domain: "Outreach & sales", purpose: "distribution", evidenceValue: 55,
    terms: "^influencer|^creator|micro-influencer|^youtuber|^podcaster|newsletter owner|^sponsor|ambassador|guest post pitch|podcast guest" },

  // ── Content & distribution ──────────────────────────────────────────────
  { id: "social_posts", label: "Social posts", domain: "Content & distribution", purpose: "distribution", evidenceValue: 40,
    terms: "linkedin post|post on linkedin|tweet|twitter post|post on x|instagram post|^tiktok|social post|share on social|post a update|post an update|post three|schedule two tweets|facebook post|status update post|post in|share a post" },
  { id: "long_threads", label: "Threads & long-form posts", domain: "Content & distribution", purpose: "distribution", evidenceValue: 40,
    terms: "thread|long-form|longform|linkedin article|twitter thread|x thread|storytelling post|build in public" },
  { id: "blog_articles", label: "Blog & articles", domain: "Content & distribution", purpose: "distribution", evidenceValue: 35,
    terms: "blog post|blog|article|write a post|medium post|guest post|essay|write up|writeup|publish an|publish a|content creation|create content|content calendar|content piece" },
  { id: "newsletter", label: "Newsletter", domain: "Content & distribution", purpose: "distribution", evidenceValue: 45,
    terms: "^newsletter|^substack|email digest|weekly update email|send the issue|issue #|email campaign|mailchimp|beehiiv|convertkit" },
  { id: "video_demos", label: "Video & demos", domain: "Content & distribution", purpose: "distribution", evidenceValue: 45,
    terms: "video|loom|screencast|record a|walkthrough video|demo video|demo clip|reel|youtube|short form|shorts|screen recording|voiceover" },
  { id: "landing_copy", label: "Landing page & copy", domain: "Content & distribution", purpose: "distribution", evidenceValue: 50,
    terms: "landing page|headline|value proposition|hero section|copywriting|sales copy|carrd|website copy|call to action|cta|one-page|one page site|homepage" },
  { id: "positioning", label: "Positioning & messaging", domain: "Content & distribution", purpose: "plan", evidenceValue: 40,
    terms: "positioning|tagline|messaging|brand voice|one-liner|elevator pitch|narrative|brand|differentiat|unique selling|usp" },
  { id: "seo", label: "SEO & search", domain: "Content & distribution", purpose: "distribution", evidenceValue: 35,
    terms: "^seo|keyword|search ranking|^backlink|meta description|search console|sitemap|organic traffic|programmatic page" },
  { id: "paid_ads", label: "Paid acquisition", domain: "Launch & growth", purpose: "distribution", evidenceValue: 65,
    terms: "paid ad|ad campaign|google ads|facebook ads|meta ads|linkedin ads|cpc|retarget|ad spend|ad creative|boost a post|sponsored" },
  { id: "launch_listing", label: "Launch listings", domain: "Launch & growth", purpose: "distribution", evidenceValue: 60,
    terms: "product hunt|show hn|hacker news|betalist|directory submission|launch day|launch plan|launch checklist|submit to|listing on|indie hackers launch|appsumo|press kit launch" },
  { id: "community_posting", label: "Community participation", domain: "Team & community", purpose: "distribution", evidenceValue: 65,
    terms: "subreddit|reddit|discord|slack group|facebook group|whatsapp group|telegram group|forum|join a community|community where|answer questions in|comment on|reply to the thread|engage with|indie hackers|founder group|community" },
  { id: "events_webinars", label: "Events & webinars", domain: "Team & community", purpose: "distribution", evidenceValue: 55,
    terms: "^webinar|meetup|host a|workshop|ama|livestream|live session|conference|networking event|pitch night|demo day|speak at" },
  { id: "press_pr", label: "Press & PR", domain: "Launch & growth", purpose: "distribution", evidenceValue: 40,
    terms: "press release|journalist|media kit|press|reporter|feature story|pr outreach|tech blog pitch" },
  { id: "referral_growth", label: "Referral & viral loops", domain: "Launch & growth", purpose: "distribution", evidenceValue: 55,
    terms: "referral program|referral loop|invite a friend|viral|share link|word of mouth|growth loop|affiliate program" },

  // ── Product engineering ─────────────────────────────────────────────────
  { id: "core_feature", label: "Core feature building", domain: "Product engineering", purpose: "build", evidenceValue: 30,
    terms: "build|implement|develop|code|feature|mvp|backend|endpoint|ship the|add support for|create the|logic for|algorithm" },
  { id: "frontend", label: "Interface building", domain: "Product engineering", purpose: "build", evidenceValue: 25,
    terms: "frontend|front-end|component|react|css|responsive|dashboard page|settings page|page layout|tailwind|navbar|modal|form ui" },
  { id: "no_code_build", label: "No-code build", domain: "Product engineering", purpose: "build", evidenceValue: 35,
    terms: "no-code|nocode|no code|^airtable|softr|bubble|zapier|glide|webflow|notion template|make.com|automation workflow|google sheet" },
  { id: "bug_fixing", label: "Bug fixing", domain: "Product engineering", purpose: "build", evidenceValue: 20,
    terms: "^bug|fix the|fix an|hotfix|crash|regression|broken|error message|patch|issue #" },
  { id: "integrations", label: "Integrations & APIs", domain: "Product engineering", purpose: "build", evidenceValue: 25,
    terms: "api|^webhook|integrate|integration|oauth|third-party|sdk|connect to|zapier integration|plugin" },
  { id: "infrastructure", label: "Infrastructure & deployment", domain: "Product engineering", purpose: "build", evidenceValue: 20,
    terms: "deploy|hosting|ci/cd|docker|database|migration|scaling|performance|monitoring|vercel|supabase|server|uptime|backup|caching|latency" },
  { id: "onboarding_flow", label: "Onboarding & activation flow", domain: "Product engineering", purpose: "build", evidenceValue: 45,
    terms: "onboarding flow|signup flow|activation|first-run|first run|welcome screen|empty state|tutorial flow|product tour|checklist for new users" },
  { id: "testing_qa", label: "Testing & QA", domain: "Product engineering", purpose: "build", evidenceValue: 20,
    terms: "unit test|e2e|qa|test coverage|write tests|regression test|verify that|smoke test the build|manual test|test plan" },
  { id: "analytics_tracking", label: "Analytics & tracking", domain: "Product engineering", purpose: "plan", evidenceValue: 50,
    terms: "^analytics|event tracking|^posthog|mixpanel|ga4|google analytics|^funnel|instrument|track events|metrics dashboard|conversion tracking|utm" },
  { id: "ai_data_work", label: "AI & data work", domain: "Product engineering", purpose: "build", evidenceValue: 30,
    terms: "prompt|llm|embedding|fine-tune|fine tune|dataset|rag|model eval|training data|vector|classifier|ml pipeline" },
  { id: "refactor", label: "Refactoring & tech debt", domain: "Product engineering", purpose: "build", evidenceValue: 10,
    terms: "^refactor|clean up the code|tech debt|rewrite|optimi[sz]e the code|restructure|dead code|lint|types for" },
  { id: "security_privacy", label: "Security & privacy", domain: "Product engineering", purpose: "build", evidenceValue: 15,
    terms: "security|auth|permissions|encryption|rate limit|vulnerability|2fa|password reset|data protection|rls" },

  // ── Design & UX ─────────────────────────────────────────────────────────
  { id: "wireframes_prototypes", label: "Wireframes & prototypes", domain: "Design & UX", purpose: "build", evidenceValue: 40,
    terms: "^wireframe|^figma|^prototype|mockup|mock-up|user flow|sketch the|clickable|low-fidelity|lo-fi|storyboard" },
  { id: "visual_design", label: "Visual design & branding", domain: "Design & UX", purpose: "build", evidenceValue: 25,
    terms: "logo|color palette|colour palette|typography|brand identity|design system|icon set|illustration|visual identity|brand kit|style guide" },
  { id: "ux_research", label: "UX improvement", domain: "Design & UX", purpose: "build", evidenceValue: 40,
    terms: "ux|usability fix|friction|simplify the flow|accessibility|a11y|improve the layout|information architecture" },

  // ── Pricing & revenue ───────────────────────────────────────────────────
  { id: "pricing_design", label: "Pricing design", domain: "Pricing & revenue", purpose: "revenue", evidenceValue: 70,
    terms: "^pricing|price point|pricing tier|tiers|packaging|willingness to pay|^wtp|what to charge|price test|freemium|free trial length|plan limits" },
  { id: "ask_to_pay", label: "Asking for payment", domain: "Pricing & revenue", purpose: "revenue", evidenceValue: 100,
    terms: "ask to pay|ask them to pay|pre-order|^preorder|pre order|charge a|paid pilot|invoice a|first paying|first customer|close the first|take payment|collect payment|letter of intent|loi|commitment from" },
  { id: "billing_setup", label: "Billing & payments setup", domain: "Pricing & revenue", purpose: "build", evidenceValue: 30,
    terms: "billing|checkout|payment flow|payment integration|subscription|paystack|stripe|polar|payment gateway|refund policy|invoice template|webhook for payments" },
  { id: "revenue_tracking", label: "Revenue & unit economics", domain: "Pricing & revenue", purpose: "plan", evidenceValue: 50,
    terms: "^mrr|arr|revenue report|churn rate|unit economics|ltv|cac|margin|^cohort|payback|revenue goal|track revenue" },
  { id: "retention_upsell", label: "Retention & upsell", domain: "Pricing & revenue", purpose: "revenue", evidenceValue: 70,
    terms: "retention|upsell|upgrade offer|win back|win-back|reactivation|churn reduction|loyalty|annual plan offer|cross-sell|dunning" },

  // ── Research & strategy ─────────────────────────────────────────────────
  { id: "competitor_research", label: "Competitor research", domain: "Research & strategy", purpose: "plan", evidenceValue: 40,
    terms: "^competitor|alternatives to|competitive|benchmark against|compare with|similar products|swot|feature comparison|market map" },
  { id: "market_sizing", label: "Market sizing", domain: "Research & strategy", purpose: "plan", evidenceValue: 35,
    terms: "market size|tam|sam|som|industry report|segment size|addressable|market research|market trends|market analysis" },
  { id: "icp_definition", label: "Ideal customer definition", domain: "Research & strategy", purpose: "plan", evidenceValue: 55,
    terms: "^icp|ideal customer|^persona|target user|target customer|customer segment|niche down|define who|jobs to be done|jtbd|buyer profile" },
  { id: "experiments", label: "Experiments & hypotheses", domain: "Research & strategy", purpose: "evidence", evidenceValue: 85,
    terms: "^hypothesis|^experiment|a/b test|ab test|split test|test whether|validate the assumption|validate assumption|fake door|smoke test|concierge|wizard of oz|pretotype|riskiest assumption" },
  { id: "desk_research", label: "Desk research", domain: "Research & strategy", purpose: "plan", evidenceValue: 30,
    terms: "analyse pricing|analyze pricing|research pricing|compare pricing|study pricing|analyse|analyze|research|read about|look up|investigate|find out|study|explore|learn about|collect data on|gather information|deep dive" },
  { id: "roadmap_planning", label: "Roadmap & prioritisation", domain: "Research & strategy", purpose: "plan", evidenceValue: 20,
    terms: "^roadmap|prioriti[sz]e|plan the week|plan next|okr|goal setting|milestone plan|backlog grooming|scope the|define the scope|sprint plan|decide what to" },
  { id: "pivot_decisions", label: "Pivot decisions", domain: "Research & strategy", purpose: "plan", evidenceValue: 70,
    terms: "pivot|niche down|change direction|reposition|kill the idea|narrow down|different market|change target|new angle|shift focus" },
  { id: "validation_synthesis", label: "Validation write-ups", domain: "Research & strategy", purpose: "plan", evidenceValue: 50,
    terms: "summari[sz]e findings|synthesis|go/no-go|go no go|learnings doc|validation report|compile a|findings report|report summari|lessons learned" },

  // ── Operations & admin ──────────────────────────────────────────────────
  { id: "reviews_retros", label: "Reviews & retros", domain: "Learning & reflection", purpose: "plan", evidenceValue: 20,
    terms: "weekly review|^retro|reflect|journal|postmortem|post-mortem|review the week|review my|what worked|end of week" },
  { id: "admin_ops", label: "Admin & operations", domain: "Operations & admin", purpose: "ops", evidenceValue: 10,
    terms: "admin|paperwork|inbox|organi[sz]e|bookkeeping|tool setup|set up a|process doc|sop|automate|calendar|schedule|tidy|spreadsheet for|cleanup" },
  { id: "legal_compliance", label: "Legal & compliance", domain: "Operations & admin", purpose: "ops", evidenceValue: 10,
    terms: "^legal|contract|terms of service|privacy policy|compliance|^trademark|incorporat|register the business|gdpr|nda|company registration|licen[cs]e|tax id" },
  { id: "finance_runway", label: "Finance & runway", domain: "Fundraising & finance", purpose: "capital", evidenceValue: 20,
    terms: "^budget|^runway|expenses|financial model|forecast|tax|bank account|cash flow|burn|accounting|bookkeeper" },
  { id: "investor_outreach", label: "Investor outreach", domain: "Fundraising & finance", purpose: "capital", evidenceValue: 60,
    terms: "^investor|vc|angel|fundrais|email investor|message investor|send the deck to|reach out to investor|accelerator|incubator|grant application|seed round|pre-seed|y combinator|apply to" },
  { id: "investor_materials", label: "Investor materials", domain: "Fundraising & finance", purpose: "capital", evidenceValue: 25,
    terms: "pitch deck|one-pager|data room|investor update|financial projections|cap table|executive summary" },
  { id: "hiring", label: "Hiring & contractors", domain: "Team & community", purpose: "people", evidenceValue: 30,
    terms: "^hire|^hiring|contractor|freelancer|job post|job description|candidate|cofounder|co-founder search|recruit|onboard a teammate|upwork" },
  { id: "learning_upskill", label: "Learning & upskilling", domain: "Learning & reflection", purpose: "plan", evidenceValue: 10,
    terms: "course|tutorial|read the book|read a book|practice|lecture|learn how to|learn to|upskill|study guide|watch a talk|certification" },
  { id: "focus_routine", label: "Focus & routines", domain: "Learning & reflection", purpose: "ops", evidenceValue: 5,
    terms: "routine|deep work|time block|morning block|sleep|rest day|break from|schedule focus|habit|pomodoro|energy" },
];

// ── Channels (where the work happens) ───────────────────────────────────────

// prettier-ignore
export const CHANNELS: Array<{ id: string; label: string; terms: string; kind?: "tool" }> = [
  { id: "linkedin", label: "LinkedIn", terms: "linkedin" },
  { id: "whatsapp", label: "WhatsApp", terms: "whatsapp|wa group" },
  { id: "twitter", label: "X / Twitter", terms: "twitter|tweet|x.com|post on x|on x " },
  { id: "email", label: "Email", terms: "email|gmail|inbox|e-mail|mailchimp" },
  { id: "reddit", label: "Reddit", terms: "reddit|subreddit" },
  { id: "instagram", label: "Instagram", terms: "instagram|insta " },
  { id: "tiktok", label: "TikTok", terms: "tiktok" },
  { id: "youtube", label: "YouTube", terms: "youtube" },
  { id: "facebook", label: "Facebook", terms: "facebook|fb group" },
  { id: "discord", label: "Discord", terms: "discord" },
  { id: "slack", label: "Slack", terms: "slack" },
  { id: "telegram", label: "Telegram", terms: "telegram" },
  { id: "product_hunt", label: "Product Hunt", terms: "product hunt|producthunt" },
  { id: "hacker_news", label: "Hacker News", terms: "hacker news|show hn" },
  { id: "indie_hackers", label: "Indie Hackers", terms: "indie hackers|indiehackers" },
  { id: "substack", label: "Substack", terms: "substack" },
  { id: "medium", label: "Medium", terms: "medium.com|on medium" },
  { id: "github", kind: "tool", label: "GitHub", terms: "github|pull request" },
  { id: "figma", kind: "tool", label: "Figma", terms: "figma" },
  { id: "notion", kind: "tool", label: "Notion", terms: "notion" },
  { id: "airtable", kind: "tool", label: "Airtable", terms: "airtable" },
  { id: "carrd", kind: "tool", label: "Carrd", terms: "carrd" },
  { id: "google_forms", kind: "tool", label: "Google Forms", terms: "google form|typeform" },
  { id: "stripe", kind: "tool", label: "Stripe / Paystack", terms: "stripe|paystack|polar" },
  { id: "zoom", label: "Video call", terms: "zoom|google meet|video call|teams call" },
  { id: "phone", label: "Phone", terms: "phone call|call them|ring |by phone|cold call" },
  { id: "in_person", label: "In person", terms: "in person|in-person|face to face|meet up|coffee" },
  { id: "loom", kind: "tool", label: "Loom", terms: "loom" },
];

// ── Audience (who it is for) ────────────────────────────────────────────────

// prettier-ignore
const AUDIENCES: Array<{ label: string; terms: string }> = [
  { label: "founders", terms: "founder|founders|startup owner|entrepreneur" },
  { label: "beta users", terms: "beta user|beta tester|beta founder|pilot user" },
  { label: "existing customers", terms: "customer|customers|paying user|subscriber" },
  { label: "prospects", terms: "prospect|lead|leads|potential user|potential customer" },
  { label: "investors", terms: "investor|angel|vc " },
  { label: "creators", terms: "creator|influencer|youtuber|podcaster" },
  { label: "students", terms: "student|students|university|campus" },
  { label: "small businesses", terms: "smes|small business|shop owner|merchant|restaurant" },
  { label: "developers", terms: "developer|engineer|dev community" },
  { label: "marketers", terms: "marketer|digital marketer|growth marketer" },
  { label: "teammates", terms: "teammate|cofounder|co-founder|contractor|freelancer" },
];

// ── Text helpers ────────────────────────────────────────────────────────────

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "with", "your", "my", "our", "is", "it", "that", "this", "at", "by", "as", "be", "you", "i"]);

/** Light stemmer: enough to make message/messaged/messaging/messages equal. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("ly") && w.length > 5) w = w.slice(0, -2);
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9+#/\s.-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.]+|[.]+$/g, ""))
    .filter((t) => t.length > 0);
}

interface CompiledTerm { stems: string[]; raw: string; strong: boolean; }
interface CompiledLeaf extends Leaf { compiled: CompiledTerm[]; }

function compileTerms(terms: string): CompiledTerm[] {
  return terms.split("|").map((raw) => raw.trim()).filter(Boolean).map((raw0) => {
    const strong = raw0.startsWith("^");
    const raw = strong ? raw0.slice(1) : raw0;
    return { raw, strong, stems: tokenize(raw).filter((t) => !STOP.has(t)).map(stem) };
  }).filter((t) => t.stems.length > 0);
}

let COMPILED: CompiledLeaf[] | null = null;
function compiled(): CompiledLeaf[] {
  if (!COMPILED) COMPILED = LEAVES.map((l) => ({ ...l, compiled: compileTerms(l.terms) }));
  return COMPILED;
}

/** Finds a phrase (as stems) in the token stems. Returns the index of the first match or -1. */
function findPhrase(hay: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > hay.length) return -1;
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

// ── Classification ──────────────────────────────────────────────────────────

export interface TaskClassification {
  leafId: string | null;
  label: string;                 // "Cold outreach"
  domain: Domain | null;
  purpose: Purpose | null;
  evidenceValue: number;
  channel: { id: string; label: string } | null;
  audience: string | null;
  /** "Cold outreach · LinkedIn" */
  displayLabel: string;
  /** 0-1. Margin-aware: a clear winner is high, a toss-up is low. */
  confidence: number;
  /** False when nothing scored well enough; callers should not learn patterns from it. */
  confident: boolean;
  alternates: Array<{ leafId: string; label: string; score: number }>;
}

const MIN_SCORE = 2.5;
const CONFIDENT_AT = 0.34;

export const UNCLASSIFIED_LABEL = "Unclassified work";

function scoreLeaf(leaf: CompiledLeaf, stems: string[]): number {
  let score = 0;
  for (const term of leaf.compiled) {
    const at = findPhrase(stems, term.stems);
    if (at < 0) continue;
    // Phrase length matters most: "customer discovery" beats "talk".
    let w = term.stems.length === 1 ? (term.strong ? 3.4 : 1.6) : 2.4 + term.stems.length * 0.9;
    // Words near the start are usually the verb ("Message 3 founders ...").
    if (at <= 3) w *= 1.25;
    // Very short generic words are weak on their own.
    if (term.stems.length === 1 && term.stems[0].length <= 3) w *= 0.7;
    score += w;
  }
  return score;
}

const COMMUNICATION_DOMAINS = new Set<Domain>(["Customer discovery", "Outreach & sales", "Content & distribution", "Launch & growth", "Team & community"]);

export function detectChannel(text: string, domain: Domain | null = null): { id: string; label: string } | null {
  const padded = ` ${text.toLowerCase()} `;
  let best: { id: string; label: string; at: number } | null = null;
  for (const c of CHANNELS) {
    // A messaging channel only describes communication work: "email capture form" in a
    // landing-page task is a feature, not the place the work happens.
    if (c.kind !== "tool" && domain !== null && !COMMUNICATION_DOMAINS.has(domain)) continue;
    for (const t of c.terms.split("|")) {
      const idx = padded.indexOf(t.toLowerCase());
      if (idx >= 0 && (best === null || idx < best.at)) best = { id: c.id, label: c.label, at: idx };
    }
  }
  return best ? { id: best.id, label: best.label } : null;
}

export function detectAudience(text: string): string | null {
  const padded = ` ${text.toLowerCase()} `;
  for (const a of AUDIENCES) {
    for (const t of a.terms.split("|")) {
      if (padded.includes(t.toLowerCase())) return a.label;
    }
  }
  return null;
}

export function classifyTask(text: string): TaskClassification {
  const clean = String(text ?? "").trim();
  const stems = tokenize(clean).filter((t) => !STOP.has(t)).map(stem);
  const audience = detectAudience(clean);

  const scored = compiled()
    .map((leaf) => ({ leaf, score: scoreLeaf(leaf, stems) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < MIN_SCORE) {
    const channel = detectChannel(clean, null);
    return {
      leafId: null, label: UNCLASSIFIED_LABEL, domain: null, purpose: null, evidenceValue: 0,
      channel, audience, displayLabel: UNCLASSIFIED_LABEL, confidence: 0, confident: false,
      alternates: scored.slice(0, 3).map((s) => ({ leafId: s.leaf.id, label: s.leaf.label, score: round(s.score) })),
    };
  }
  const channel = detectChannel(clean, top.leaf.domain);
  const second = scored[1]?.score ?? 0;
  const confidence = round(Math.min(1, (top.score - second * 0.6) / (top.score + 2.5)));
  return {
    leafId: top.leaf.id,
    label: top.leaf.label,
    domain: top.leaf.domain,
    purpose: top.leaf.purpose,
    evidenceValue: top.leaf.evidenceValue,
    channel,
    audience,
    displayLabel: channel && !top.leaf.label.toLowerCase().includes(channel.label.toLowerCase()) ? `${top.leaf.label} · ${channel.label}` : top.leaf.label,
    confidence,
    confident: confidence >= CONFIDENT_AT,
    alternates: scored.slice(1, 4).map((s) => ({ leafId: s.leaf.id, label: s.leaf.label, score: round(s.score) })),
  };
}

function round(n: number): number { return Math.round(n * 100) / 100; }

// ── Lookups & legacy bridging ───────────────────────────────────────────────

const BY_ID = new Map(LEAVES.map((l) => [l.id, l]));
export function getLeaf(id: string): Leaf | undefined { return BY_ID.get(id); }

/** Old broad labels that already live in founder_memory, mapped to the domain they belonged to. */
const LEGACY_DOMAIN: Record<string, Domain | null> = {
  "content creation": "Content & distribution",
  "direct outreach": "Outreach & sales",
  "cold outreach": "Outreach & sales",
  "warm intros": "Outreach & sales",
  "outreach": "Outreach & sales",
  "user interviews": "Customer discovery",
  "customer interviews": "Customer discovery",
  "churn interviews": "Customer discovery",
  "building/shipping": "Product engineering",
  "core feature building": "Product engineering",
  "build": "Product engineering",
  "pricing conversations": "Pricing & revenue",
  "pricing decisions": "Pricing & revenue",
  "pricing": "Pricing & revenue",
  "research": "Research & strategy",
  "pivoting": "Research & strategy",
  "content": "Content & distribution",
  "user_interview": "Customer discovery",
  "other tasks": null,
  "other": null,
};

function stripChannelSuffix(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*·\s*[^·]+$/, "").trim();
}

/**
 * The domain a stored label (old or new vocabulary) belongs to, or null when
 * it is meaningless ("other tasks", a bare platform name like "linkedin").
 */
export function domainOfLabel(label: string): Domain | null {
  const base = stripChannelSuffix(label).toLowerCase();
  if (base in LEGACY_DOMAIN) return LEGACY_DOMAIN[base];
  const leaf = LEAVES.find((l) => l.label.toLowerCase() === base);
  if (leaf) return leaf.domain;
  return null;
}

/** True when a stored label carries no information and must not be shown or learned from. */
export function isMeaninglessLabel(label: string): boolean {
  const base = stripChannelSuffix(label).toLowerCase().trim();
  if (!base) return true;
  if (base === "other" || base === "other tasks" || base === UNCLASSIFIED_LABEL.toLowerCase()) return true;
  if (CHANNELS.some((c) => c.label.toLowerCase() === base || c.id === base)) return true; // "linkedin", "email"
  return false;
}

/** Same thing in the old and new vocabulary? Used to catch strength-vs-avoidance clashes across eras. */
export function sameWorkArea(a: string, b: string): boolean {
  const da = domainOfLabel(a);
  const db = domainOfLabel(b);
  if (!da || !db) return stripChannelSuffix(a).toLowerCase() === stripChannelSuffix(b).toLowerCase();
  if (da !== db) return false;
  // Same domain: compare at leaf level when both sides are specific new-vocabulary labels.
  const la = LEAVES.find((l) => l.label.toLowerCase() === stripChannelSuffix(a).toLowerCase());
  const lb = LEAVES.find((l) => l.label.toLowerCase() === stripChannelSuffix(b).toLowerCase());
  if (la && lb) return la.id === lb.id;
  return true; // one side is a legacy broad label for this whole domain
}

/** The label stored in founder memory for a task. Never returns a catch-all. */
export function categoryLabelFor(text: string): string | null {
  const c = classifyTask(text);
  return c.confident ? c.displayLabel : null;
}
