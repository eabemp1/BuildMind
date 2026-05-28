/**
 * Seed script adapted from the uploaded founderKnowledgeBase implementation.
 *
 * It expects the migration `20260528000000_archetype_debt_drafts_proof.sql`
 * to be applied first. Draft templates are intentionally long enough to give
 * Today-page outreach real context instead of one-line generic asks.
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
    draft_template: "Hi [Name], I am researching how teams currently handle [workflow/problem], and I am deliberately trying to learn before I build more. I am not looking for a polite product opinion. I want to understand the current workaround: who owns it, what tool or spreadsheet holds it together, where the process breaks, and what everyone tolerates because fixing it feels like extra work. If you have 10 minutes this week, I would love to ask about the last time this happened in your team. If a call is too much, three bullets on your current workflow would still be extremely useful. If you are not the person closest to this pain, who should I ask instead?",
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
    draft_template: "Hi [Name], quick research ask. I am exploring [problem/workflow] for [target users], and I am trying to separate real pain from an idea that only sounds useful in a demo. I do not want to pitch you. I want to understand what you do today, how often the problem appears, what workaround you use, and what would make you care enough to change the habit. If you can reply with what happened the last time you dealt with this, that would help more than a feature request. If you are open to a 10 minute call, I will keep it focused: current workflow, worst friction, and whether this is urgent or merely annoying.",
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
    draft_template: "Hi [Name], I am sharing a rough version of [product] with people who already care about [problem]. I am not trying to make this look bigger than it is. The thing I need to learn is whether the promise is clear enough for someone like you to try it, and where it disappoints once you do. If you have a few minutes, could you look at it and reply with one of three things: what made sense immediately, what felt confusing, or why you would ignore it completely? Brutal honesty helps. If this is not useful for you, I would also value knowing which community or person would be a sharper fit.",
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
