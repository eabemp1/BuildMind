/**
 * Seed script adapted from the uploaded founderKnowledgeBase implementation.
 *
 * It expects the migration `20260528000000_archetype_debt_drafts_proof.sql`
 * to be applied first. Draft templates are structural starting points, not
 * arbitrary 500-character messages; Today-page code personalizes them with the
 * founder's actual product, target user, and problem.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const rows = [
  {
    stage: "Validation",
    company_type: "B2B SaaS",
    founder_archetype: "technical-overbuilder",
    what_stalled_them: "built workflow automation for weeks before asking operators how the current process actually broke",
    what_broke_the_stall: "ran 12 operator interviews and discovered the painful part was handoff accountability, not dashboard visibility",
    first_10_days_advice: "Book five workflow calls, map the manual process, and sell one concierge version before building another feature.",
    draft_channel: "linkedin_dm",
    draft_intent: "discovery_call",
    draft_style: "curious",
    draft_template: "Saw you work close to [workflow/problem]. Quick question: how does your team currently handle it? I am trying to understand if this is actually painful before building more.",
  },
  {
    stage: "Idea",
    company_type: "AI assistant",
    founder_archetype: "validation-avoider",
    what_stalled_them: "kept polishing prompts and demos without testing whether users had a repeated workflow worth replacing",
    what_broke_the_stall: "sent a blunt research message to 30 target users and found the real urgency was review speed, not generation quality",
    first_10_days_advice: "Talk to users about the recurring workflow, not the model. Validate switching behavior before architecture.",
    draft_channel: "twitter",
    draft_intent: "discovery_call",
    draft_style: "direct",
    draft_template: "15 minutes this week? Building for [target users] dealing with [problem/workflow] and want to hear how you think about it before I build the wrong thing.",
  },
  {
    stage: "Launch",
    company_type: "Consumer community",
    founder_archetype: "chaotic-high-energy",
    what_stalled_them: "kept changing channels and copy instead of committing to one community long enough to learn",
    what_broke_the_stall: "posted one honest problem statement in the most concentrated community and followed up manually with every reply",
    first_10_days_advice: "Pick one community, make one promise, and do manual follow-up before expanding distribution.",
    draft_channel: "twitter",
    draft_intent: "beta_invite",
    draft_style: "peer",
    draft_template: "You probably already handle [problem] somehow. I am sharing a rough version of [product] and would rather understand your current approach before assuming this needs fixing.",
  },
];

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await supabase.from("founder_knowledge_base").upsert(rows);
  if (error) throw error;
  console.log(`Seeded ${rows.length} founder knowledge base rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
