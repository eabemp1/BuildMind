/**
 * Seeds founder_knowledge_base with the 3b/3c draft coverage from the
 * implementation prompt.
 *
 * The knowledge base may eventually hold 500+ founder situations. Per 3c,
 * the draft work starts with ~21 high-quality templates covering the common
 * early-stage channel/intent combinations. The key requirement is structural
 * variety: different openings, not just synonym swaps.
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type DraftChannel = "cold_email" | "linkedin_dm" | "whatsapp" | "twitter" | "in_person" | "phone";
type DraftIntent = "discovery_call" | "first_sale" | "beta_invite" | "warm_followup" | "reactivation" | "partnership";
type DraftStyle = "direct" | "curious" | "warm" | "observation-led" | "peer" | "referral";
type Stage = "Idea" | "Validation" | "MVP" | "Launch" | "Growth";

type SeedRow = {
  id: string;
  stage: Stage;
  company_type: string;
  founder_archetype: string;
  what_stalled_them: string;
  what_broke_the_stall: string;
  first_10_days_advice: string;
  draft_template: string;
  draft_channel: DraftChannel;
  draft_intent: DraftIntent;
  draft_style: DraftStyle;
  embedding?: number[];
};

const scenarios = [
  {
    stage: "Validation" as const,
    company_type: "B2B SaaS",
    founder_archetype: "technical-overbuilder",
    stalled: "built internal workflow features before learning how teams currently solve the problem",
    broke: "ran direct operator interviews and found the painful handoff nobody had instrumented",
    advice: "Map the manual workflow with five target users before writing another feature.",
  },
  {
    stage: "Idea" as const,
    company_type: "AI workflow tool",
    founder_archetype: "validation-avoider",
    stalled: "kept improving demos instead of checking whether the workflow happened weekly",
    broke: "asked target users to describe the last real incident and found one urgent use case",
    advice: "Ask for current behaviour and switching triggers before pitching an AI solution.",
  },
  {
    stage: "MVP" as const,
    company_type: "Marketplace",
    founder_archetype: "vision-heavy-executor",
    stalled: "tried to recruit both sides of the market at once",
    broke: "manually supplied one side and validated demand with a narrow buyer segment",
    advice: "Pick the constrained side, serve it manually, and prove one transaction path.",
  },
  {
    stage: "Launch" as const,
    company_type: "Consumer community",
    founder_archetype: "chaotic-high-energy",
    stalled: "changed launch channels repeatedly instead of learning from one concentrated community",
    broke: "posted one clear promise and followed up with every reply manually",
    advice: "Commit to one channel for the week and extract objections before expanding.",
  },
  {
    stage: "Validation" as const,
    company_type: "Fintech operations",
    founder_archetype: "methodical-slow-mover",
    stalled: "treated compliance uncertainty as a reason to delay discovery",
    broke: "validated the workflow and pain before touching regulated transaction flows",
    advice: "Separate discovery from compliance-heavy implementation and talk to operators first.",
  },
];

const draftSpecs: Array<{
  key: string;
  channel: DraftChannel;
  intent: DraftIntent;
  style: DraftStyle;
  pattern: "A" | "B" | "C" | "D" | "E";
  template: string;
}> = [
  {
    key: "cold-discovery-a",
    channel: "cold_email",
    intent: "discovery_call",
    style: "curious",
    pattern: "A",
    template: "Subject: Quick question about {problem_area}\n\nSaw you're {role} at {company}. Quick question: how does your team currently handle {problem_area}? I'm trying to understand if this is actually painful or just mildly annoying before I build anything. Open to 15 minutes this week?",
  },
  {
    key: "cold-discovery-b",
    channel: "cold_email",
    intent: "discovery_call",
    style: "observation-led",
    pattern: "B",
    template: "Subject: Noticed {relevant_trigger}\n\nNoticed {company} recently {relevant_trigger}. I'm researching {problem_area} for {target_role} and wondered whether that created any operational pain on your side. Worth a quick chat?",
  },
  {
    key: "cold-discovery-c",
    channel: "cold_email",
    intent: "discovery_call",
    style: "direct",
    pattern: "C",
    template: "Subject: 15 minutes?\n\n15 minutes this week? I'm building for {target_role} dealing with {problem_area} and want to hear how you think about it before I build the wrong thing. No pitch; just trying to understand the workflow.",
  },
  {
    key: "cold-discovery-d",
    channel: "cold_email",
    intent: "discovery_call",
    style: "peer",
    pattern: "D",
    template: "Subject: Fellow {shared_context} question\n\nWe're both close to {shared_context}. I'm working on {problem_area}; not ready to demo anything yet, just want to talk to someone who understands the space. Would 10 minutes be unreasonable?",
  },
  {
    key: "cold-discovery-e",
    channel: "cold_email",
    intent: "discovery_call",
    style: "warm",
    pattern: "E",
    template: "Subject: How are you handling {problem_area} today?\n\nYou're probably already handling {problem_area} somehow. I'd love to understand how before assuming it needs fixing. Would you walk me through your current approach?",
  },
  {
    key: "linkedin-discovery-a",
    channel: "linkedin_dm",
    intent: "discovery_call",
    style: "curious",
    pattern: "A",
    template: "Saw you're {role} at {company}. Quick question: how does your team currently handle {problem_area}? Trying to learn whether this is real pain before I build around assumptions.",
  },
  {
    key: "linkedin-discovery-b",
    channel: "linkedin_dm",
    intent: "discovery_call",
    style: "observation-led",
    pattern: "B",
    template: "Noticed {company} recently {relevant_trigger}. I'm looking at {problem_area} for {target_role}; curious if that changed anything in your workflow. Open to a quick chat?",
  },
  {
    key: "linkedin-discovery-c",
    channel: "linkedin_dm",
    intent: "discovery_call",
    style: "direct",
    pattern: "C",
    template: "15 mins this week? Building for {target_role} dealing with {problem_area} and want to hear how you think about it before I build the wrong thing.",
  },
  {
    key: "linkedin-discovery-d",
    channel: "linkedin_dm",
    intent: "discovery_call",
    style: "peer",
    pattern: "D",
    template: "We're both in {shared_context}. I'm exploring {problem_area}; not pitching yet, just trying to talk to someone who gets the workflow. 10 minutes?",
  },
  {
    key: "linkedin-discovery-e",
    channel: "linkedin_dm",
    intent: "discovery_call",
    style: "referral",
    pattern: "E",
    template: "You're probably already handling {problem_area} somehow. I'd love to understand the current approach before assuming it needs a product. Are you the right person to ask?",
  },
  {
    key: "whatsapp-discovery-a",
    channel: "whatsapp",
    intent: "discovery_call",
    style: "warm",
    pattern: "A",
    template: "Quick one: how do you currently handle {problem_area}? Trying to learn if it's genuinely painful before I build anything around it.",
  },
  {
    key: "whatsapp-discovery-c",
    channel: "whatsapp",
    intent: "discovery_call",
    style: "direct",
    pattern: "C",
    template: "10 mins today? Need your honest view on {problem_area} before I build the wrong thing. No pitch.",
  },
  {
    key: "whatsapp-discovery-e",
    channel: "whatsapp",
    intent: "discovery_call",
    style: "peer",
    pattern: "E",
    template: "You probably already solve {problem_area} somehow. Can you walk me through how you handle it now? Voice note is fine.",
  },
  {
    key: "cold-sale-a",
    channel: "cold_email",
    intent: "first_sale",
    style: "direct",
    pattern: "A",
    template: "Subject: Fixing {problem_area}\n\nIf {problem_area} is costing your team time right now, I can help with a small concierge version of {product}. It is intentionally manual for now so we can prove the result before pretending it is scalable. Worth discussing?",
  },
  {
    key: "cold-sale-b",
    channel: "cold_email",
    intent: "first_sale",
    style: "observation-led",
    pattern: "B",
    template: "Subject: Saw {relevant_trigger}\n\nNoticed {company} recently {relevant_trigger}. Teams at that point often feel {problem_area} more sharply. I have a rough paid pilot for {target_role}; should I send details?",
  },
  {
    key: "cold-sale-e",
    channel: "cold_email",
    intent: "first_sale",
    style: "warm",
    pattern: "E",
    template: "Subject: Before I suggest anything\n\nYou may already have a decent workaround for {problem_area}. If not, I'm offering a small paid pilot of {product} for {target_role}. Happy to first understand your current approach and only share it if useful.",
  },
  {
    key: "linkedin-beta-a",
    channel: "linkedin_dm",
    intent: "beta_invite",
    style: "curious",
    pattern: "A",
    template: "I'm opening a small beta around {problem_area} for {target_role}. Before I add more features, I need people who will tell me where it breaks. Interested in trying it?",
  },
  {
    key: "linkedin-beta-b",
    channel: "linkedin_dm",
    intent: "beta_invite",
    style: "observation-led",
    pattern: "B",
    template: "Saw {company} {relevant_trigger}. That made me think you might have opinions on {problem_area}. I'm letting a few {target_role} try {product}; want access?",
  },
  {
    key: "linkedin-beta-d",
    channel: "linkedin_dm",
    intent: "beta_invite",
    style: "peer",
    pattern: "D",
    template: "We're both close to {shared_context}. I built a rough beta for {problem_area}; not polished, but useful enough to test. Want to try it and tell me what's wrong?",
  },
  {
    key: "cold-followup-b",
    channel: "cold_email",
    intent: "warm_followup",
    style: "observation-led",
    pattern: "B",
    template: "Subject: Following up on {problem_area}\n\nI kept thinking about what you said around {problem_area}, especially the part about {specific_detail}. I made the next version around that. Would you be open to a quick look?",
  },
  {
    key: "cold-followup-e",
    channel: "cold_email",
    intent: "warm_followup",
    style: "referral",
    pattern: "E",
    template: "Subject: Right person for {problem_area}?\n\nYou may not be the person closest to {problem_area}, but your earlier context was useful. Is there someone on your team who owns this workflow and would be open to a short conversation?",
  },
];

function deterministicUuid(input: string): string {
  const hex = createHash("sha1").update(input).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function buildRows(): SeedRow[] {
  return draftSpecs.map((draft, index) => {
    const scenario = scenarios[index % scenarios.length];
    return {
      id: deterministicUuid(`founder-kb-draft:${draft.key}`),
      stage: scenario.stage,
      company_type: scenario.company_type,
      founder_archetype: scenario.founder_archetype,
      what_stalled_them: scenario.stalled,
      what_broke_the_stall: scenario.broke,
      first_10_days_advice: scenario.advice,
      draft_template: draft.template,
      draft_channel: draft.channel,
      draft_intent: draft.intent,
      draft_style: draft.style,
    };
  });
}

function assertCoverage(rows: SeedRow[]) {
  if (rows.length !== 21) throw new Error(`Expected 21 draft seed rows, got ${rows.length}`);
  const required = new Map<string, number>([
    ["cold_email:discovery_call", 5],
    ["linkedin_dm:discovery_call", 5],
    ["whatsapp:discovery_call", 3],
    ["cold_email:first_sale", 3],
    ["linkedin_dm:beta_invite", 3],
    ["cold_email:warm_followup", 2],
  ]);

  for (const [combo, expected] of required) {
    const actual = rows.filter((row) => `${row.draft_channel}:${row.draft_intent}` === combo).length;
    if (actual !== expected) throw new Error(`${combo} expected ${expected} templates, got ${actual}`);
  }
}

async function embed(text: string): Promise<number[] | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.groq.com/openai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nomic-embed-text-v1_5",
      input: text.slice(0, 512),
    }),
  });

  if (!response.ok) throw new Error(`Embedding failed: ${response.status} ${await response.text()}`);
  const data = await response.json() as { data?: { embedding?: number[] }[] };
  return data.data?.[0]?.embedding ?? null;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const rows = buildRows();
  assertCoverage(rows);

  for (const row of rows) {
    const embedding = await embed(`${row.stage} stage ${row.company_type}. ${row.what_stalled_them} ${row.what_broke_the_stall}`);
    if (embedding) row.embedding = embedding;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await supabase.from("founder_knowledge_base").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  console.log(`Seeded ${rows.length} structurally distinct draft templates.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
