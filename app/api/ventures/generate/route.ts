/**
 * app/api/ventures/generate/route.ts
 *
 * BuildMind Ventures — Blueprint Generation API
 *
 * Accepts multi-modal input (text + optional image/screenshot) and returns
 * a structured StartupBlueprint across up to 8 layers depending on plan.
 *
 * Same auth pattern as /api/ai/coach.
 * Uses Anthropic Claude (claude-sonnet-4-5) for vision + reasoning.
 */
/**
 * ⚠️  PLAYBOOK TIMING: Ventures Blueprint Engine
 *
 * This route exists in the codebase ahead of its playbook unlock date.
 * Not in the Playbook 12-month roadmap as a named feature — treat as Month 3+ internal tooling.
 * Do not surface to users until Ghost Competitor (Month 3, 20+ active users) has proven the competitive intelligence value.
 *
 * Current server-side guard: builder (safest interim gate — keeps it off free tier).
 * Do NOT remove the plan guard or surface this feature in UI until the condition above is met.
 */


import { NextResponse } from "next/server";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";
import { enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";
import type { StartupBlueprint } from "@/lib/ventures/index";

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Plan gate — builder required (lib/plan.ts FEATURE_GATES.venturesBlueprint)
    const access = await checkPlanAccess("builder");
    if (!access.ok) {
      return access.response;
    }

    await enforceAndTrackAIUsage(access.userId, access.plan);

    const body = await request.json();
    const idea = body.idea ?? body.textDescription ?? body.description;
    const targetUsers = body.targetUsers ?? body.target_users;
    const problem = body.problem;
    const stage = body.stage ?? body.founderContext?.stage ?? "Idea";
    const industry = body.industry ?? "SaaS";

    if (!idea) {
      return NextResponse.json({ ok: false, error: "idea is required" }, { status: 400 });
    }

    const blueprint = await groqJSON<StartupBlueprint>(
      `You are a startup strategist. Generate a structured 8-layer startup blueprint.
Return ONLY valid JSON matching this shape exactly:
{
  "id": "string timestamp-based id like bp_1234567890",
  "title": "string",
  "oneLiner": "string max 20 words",
  "stage": "Idea|Validation|MVP|Launch|Growth|Revenue",
  "industry": "string",
  "layers": {
    "problem": { "title": "Problem", "content": "string", "locked": false },
    "market": { "title": "Market", "content": "string", "locked": false },
    "solution": { "title": "Solution", "content": "string", "locked": false },
    "moat": { "title": "Moat", "content": "string", "locked": false },
    "gtm": { "title": "Go-to-Market", "content": "string", "locked": false },
    "revenue": { "title": "Revenue Model", "content": "string", "locked": false },
    "risks": { "title": "Key Risks", "content": "string", "locked": false },
    "milestones": { "title": "90-Day Milestones", "content": "string", "locked": false }
  },
  "createdAt": "ISO8601 string",
  "plan": "builder"
}`,
      `Startup idea: ${idea}
Target users: ${targetUsers ?? "not specified"}
Problem: ${problem ?? "not specified"}
Stage: ${stage}
Industry: ${industry}`,
    );

    const layers = blueprint.layers ?? {};
    const compatibleBlueprint: StartupBlueprint = {
      ...blueprint,
      inputType: "text",
      productInterpretation: blueprint.productInterpretation ?? {
        appCategory: "saas",
        problemStatement: layers.problem?.content ?? problem ?? String(idea),
        targetUser: targetUsers ?? "Founders",
        valueProposition: layers.solution?.content ?? blueprint.oneLiner ?? "",
        detectedUIComponents: [],
        detectedFeatures: [],
        intentSummary: blueprint.oneLiner ?? layers.solution?.content ?? String(idea),
      },
      systemDesign: blueprint.systemDesign ?? (layers.solution ? {
        frontendArchitecture: { framework: "Next.js", keyComponents: [], stateManagement: "Local state plus Supabase", stylingApproach: "Existing BuildMind UI" },
        backendArchitecture: { approach: "Serverless API routes", keyServices: [], authFlow: "Supabase Auth", dataFlow: layers.solution.content },
        databaseSchema: { tables: [], type: "relational", suggested: "PostgreSQL via Supabase" },
        apiStructure: { endpoints: [] },
        infrastructureRecommendations: [],
      } : undefined),
      mvpConstruction: blueprint.mvpConstruction ?? {
        coreFeatures: [],
        mvpScope: layers.solution?.content ?? "",
        deferredFeatures: [],
        criticalPath: [],
        successCriteria: [],
      },
      executionPlan: blueprint.executionPlan ?? {
        suggestedStack: { frontend: "Next.js", backend: "Next.js API routes", database: "Supabase", auth: "Supabase Auth", hosting: "Vercel" },
        milestones: layers.milestones?.content
          ? [{ day: "90", task: layers.milestones.content, deliverable: "Validated execution plan", type: "launch" }]
          : [],
        sprintPlan: [],
        estimatedTimeToMVP: "90 days",
      },
      founderFit: blueprint.founderFit ?? {
        fitScore: 70,
        strengthsAligned: [],
        potentialBlockers: [],
        recommendation: "validate-first",
        reasoning: layers.risks?.content ?? "Validate demand before scaling build effort.",
      },
      marketIntelligence: blueprint.marketIntelligence ?? {
        estimatedTAM: "To validate",
        estimatedSAM: "To validate",
        primaryCompetitors: [],
        monetisationModel: {
          model: "subscription",
          suggestedPricing: layers.revenue?.content ?? "Test willingness to pay with target users.",
          revenueProjection: { month3: "TBD", month6: "TBD", month12: "TBD" },
        },
        gtmStrategy: layers.gtm?.content ?? "",
      },
      riskRegister: blueprint.riskRegister ?? {
        risks: layers.risks?.content
          ? [{ risk: layers.risks.content, likelihood: "medium", impact: "high", mitigation: "Run focused validation before build-out." }]
          : [],
        biggestThreat: layers.risks?.content ?? "Unvalidated demand",
        founderSpecificRisk: "Losing focus before the first real signal",
      },
      cofounderHandoff: blueprint.cofounderHandoff ?? {
        firstValidationAction: {
          coldDmTemplate: "Quick question: how are you currently handling this problem?",
          communityQuestion: "What is the hardest part of this workflow today?",
          problemHypothesis: layers.problem?.content ?? String(idea),
          suggestedChannels: ["LinkedIn", "X", "Founder communities"],
        },
        firstDayTask: "Talk to 5 target users before building more.",
        motivationalNote: "Pick the smallest proof point and get it today.",
      },
    };

    return NextResponse.json({ ok: true, blueprint: compatibleBlueprint });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ventures Blueprint generation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
