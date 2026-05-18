/**
 * lib/ventures/index.ts — BuildMind Ventures AI Engine (blueprint generator)
 *
 * DO NOT CONFUSE WITH lib/ventures.ts, which holds static track/milestone data:
 *   lib/ventures.ts  → VENTURE_TRACKS, VENTURE_TIMELINE, COMBINED_REVENUE
 *
 * This file owns the AI-powered blueprint generation pipeline (Layers 1–8).
 *
 * Transforms raw startup ideas (text, image, sketch, screenshot, competitor UI)
 * into complete, executable startup blueprints across four structured layers:
 *
 *   Layer 1 — Product Interpretation   (what it is, who for, why it matters)
 *   Layer 2 — System Design            (architecture, schema, API, auth)
 *   Layer 3 — MVP Construction         (feature set, roadmap, dependencies)
 *   Layer 4 — Execution Planning       (tasks, sprints, milestones, stack)
 *
 * Additional layers (Claude's recommendations):
 *   Layer 5 — Founder Fit Analysis     (matches idea to founder strengths from founderMemory)
 *   Layer 6 — Market Intelligence      (TAM/SAM, competitors, monetisation model)
 *   Layer 7 — Risk Register            (top 5 risks + mitigation per risk)
 *   Layer 8 — CoFounder Core handoff   (auto-generates first Competitor Reframe + validation action)
 *
 * Gating:
 *   Free:    Layer 1 only (Product Interpretation preview)
 *   Builder: All 8 layers + code scaffold + execution planner
 */

import { getLimits } from "@/lib/plan";
import { getValidationReceipts, formatReceiptsForAIContext } from "@/lib/cofounder/validationReceipts";
import { generateValidationAction } from "@/lib/cofounder/validationReceipts";
import { storage } from "@/lib/storage";

// ─── Input types ──────────────────────────────────────────────────────────────

export type IdeaInputType = "text" | "image" | "sketch" | "screenshot" | "url";

export interface VenturesInput {
  inputType: IdeaInputType;
  textDescription?: string;
  imageBase64?: string;         // base64 encoded image (sketch / screenshot / mockup)
  imageMediaType?: "image/png" | "image/jpeg" | "image/webp";
  competitorUrl?: string;       // reference competitor UI
  founderContext?: {
    strengths: string[];
    avoidance_zones: string[];
    personality_tags: string[];
    stage: string;
  };
}

// ─── Output layer types ───────────────────────────────────────────────────────

/** Layer 1 — Product Interpretation */
export interface ProductInterpretation {
  appCategory: "saas" | "marketplace" | "tool" | "dashboard" | "api" | "mobile" | "platform" | "other";
  problemStatement: string;
  targetUser: string;
  valueProposition: string;
  detectedUIComponents: string[];   // e.g. ["navbar", "data table", "auth modal"]
  detectedFeatures: string[];       // e.g. ["authentication", "analytics", "search"]
  intentSummary: string;            // "what this system is trying to achieve" — not just UI
}

/** Layer 2 — System Design */
export interface SystemDesign {
  frontendArchitecture: {
    framework: string;            // e.g. "Next.js 14 (App Router)"
    keyComponents: string[];
    stateManagement: string;
    stylingApproach: string;
  };
  backendArchitecture: {
    approach: string;             // e.g. "serverless API routes" / "Express microservices"
    keyServices: string[];
    authFlow: string;
    dataFlow: string;
  };
  databaseSchema: {
    tables: {
      name: string;
      purpose: string;
      keyFields: string[];
      relations: string[];
    }[];
    type: "relational" | "document" | "hybrid";
    suggested: string;            // e.g. "PostgreSQL via Supabase"
  };
  apiStructure: {
    endpoints: {
      method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      path: string;
      purpose: string;
    }[];
  };
  infrastructureRecommendations: string[];
}

/** Layer 3 — MVP Construction */
export interface MVPConstruction {
  coreFeatures: {
    feature: string;
    priority: "must-have" | "should-have" | "nice-to-have";
    complexity: "low" | "medium" | "high";
    dependsOn: string[];
    estimatedDays: number;
  }[];
  mvpScope: string;               // one-sentence MVP definition
  deferredFeatures: string[];     // explicitly out of MVP scope
  criticalPath: string[];         // ordered list of must-build-first items
  successCriteria: string[];      // what "done" looks like for the MVP
}

/** Layer 4 — Execution Planning */
export interface ExecutionPlan {
  suggestedStack: {
    frontend: string;
    backend: string;
    database: string;
    auth: string;
    hosting: string;
    payments?: string;
    email?: string;
  };
  milestones: {
    day: string;
    task: string;
    deliverable: string;
    type: "setup" | "build" | "test" | "launch" | "grow";
  }[];
  sprintPlan: {
    sprint: number;
    weeks: string;
    goal: string;
    tasks: string[];
  }[];
  estimatedTimeToMVP: string;     // e.g. "6–8 weeks solo"
}

/** Layer 5 — Founder Fit (Claude recommendation) */
export interface FounderFit {
  fitScore: number;               // 0-100
  strengthsAligned: string[];     // founder strengths that match this idea
  potentialBlockers: string[];    // avoidance_zones that could stall execution
  recommendation: "build" | "validate-first" | "find-cofounder" | "simplify-scope";
  reasoning: string;
}

/** Layer 6 — Market Intelligence (Claude recommendation) */
export interface MarketIntelligence {
  estimatedTAM: string;
  estimatedSAM: string;
  primaryCompetitors: {
    name: string;
    weakness: string;
    yourEdge: string;
  }[];
  monetisationModel: {
    model: "subscription" | "freemium" | "usage-based" | "marketplace" | "one-time" | "hybrid";
    suggestedPricing: string;
    revenueProjection: {
      month3: string;
      month6: string;
      month12: string;
    };
  };
  gtmStrategy: string;            // go-to-market in one paragraph
}

/** Layer 7 — Risk Register (Claude recommendation) */
export interface RiskRegister {
  risks: {
    risk: string;
    likelihood: "low" | "medium" | "high";
    impact: "low" | "medium" | "high";
    mitigation: string;
  }[];
  biggestThreat: string;
  founderSpecificRisk: string;    // pulled from founderMemory avoidance patterns
}

/** Layer 8 — CoFounder Core Handoff (Claude recommendation) */
export interface CofounderHandoff {
  firstValidationAction: {
    coldDmTemplate: string;
    communityQuestion: string;
    problemHypothesis: string;
    suggestedChannels: string[];
  };
  competitorToReframe?: string;   // most obvious competitor to run through Reframe module
  firstDayTask: string;           // exactly one thing to do today
  motivationalNote: string;       // personalised to founderMemory context
}

/** Full blueprint output */
export interface StartupBlueprint {
  id: string;
  createdAt: string;
  inputType?: IdeaInputType;
  title?: string;
  oneLiner?: string;
  stage?: string;
  industry?: string;
  plan?: string;
  layers?: Record<string, { title: string; content: string; locked: boolean }>;
  // Always returned (free + builder)
  productInterpretation?: ProductInterpretation;
  // Builder only
  systemDesign?: SystemDesign;
  mvpConstruction?: MVPConstruction;
  executionPlan?: ExecutionPlan;
  founderFit?: FounderFit;
  marketIntelligence?: MarketIntelligence;
  riskRegister?: RiskRegister;
  cofounderHandoff?: CofounderHandoff;
  // Code scaffold (builder only)
  codeScaffold?: CodeScaffold;
}

/** Code scaffold output */
export interface CodeScaffold {
  projectStructure: string;       // directory tree as string
  keyFiles: {
    path: string;
    description: string;
    starterCode: string;
  }[];
  setupCommands: string[];        // terminal commands to bootstrap the project
  envVarTemplate: string;         // .env.example content
}

// ─── Local blueprint storage ──────────────────────────────────────────────────

const BLUEPRINTS_KEY = "bm_ventures_blueprints";

export function getSavedBlueprints(): StartupBlueprint[] {
  if (typeof window === "undefined") return [];
  return storage.getJSON<StartupBlueprint[]>(BLUEPRINTS_KEY, []);
}

export function saveBlueprint(blueprint: StartupBlueprint): void {
  if (typeof window === "undefined") return;
  const existing = getSavedBlueprints();
  existing.unshift(blueprint);
  storage.setJSON(BLUEPRINTS_KEY, existing.slice(0, 20));
}

export function deleteBlueprint(id: string): void {
  if (typeof window === "undefined") return;
  storage.setJSON(BLUEPRINTS_KEY, getSavedBlueprints().filter(b => b.id !== id));
}

// ─── Blueprint generation ─────────────────────────────────────────────────────

/**
 * Core entry point — generates a StartupBlueprint from any input modality.
 *
 * Free plan:  returns Layer 1 (ProductInterpretation) only.
 * Builder:    returns all 8 layers + code scaffold.
 *
 * Calls /api/ventures/generate which runs the full pipeline server-side.
 * The API handles: image parsing → product intelligence → system design →
 * code scaffolding → execution planning → founder fit → market intel →
 * risk register → cofounder handoff.
 */
export async function generateBlueprint(
  input: VenturesInput,
  onProgress?: (layer: string) => void,
): Promise<StartupBlueprint> {
  const limits = getLimits();
  const isBuilder = limits.unlimitedAITasks;

  onProgress?.("Parsing your idea...");

  // Build API payload — include receipts for CoFounder handoff layer
  const receipts = getValidationReceipts();
  const receiptContext = formatReceiptsForAIContext(receipts);

  const payload = {
    ...input,
    receiptContext,
    fullBlueprint: isBuilder,
    includeSystemDesign: isBuilder,
    includeCodeScaffold: isBuilder,
    includeExecutionPlan: isBuilder,
    includeFounderFit: isBuilder,
    includeMarketIntel: isBuilder,
    includeRiskRegister: isBuilder,
    includeCofounderHandoff: isBuilder,
  };

  onProgress?.("Running product intelligence...");

  const res = await fetch("/api/ventures/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(err.message ?? "Blueprint generation failed");
  }

  onProgress?.("Assembling blueprint...");

  const responsePayload = await res.json();
  const blueprint: StartupBlueprint = responsePayload?.blueprint ?? responsePayload;

  // Auto-generate CoFounder handoff validation action if builder plan
  if (isBuilder && blueprint.productInterpretation) {
    try {
      const pi = blueprint.productInterpretation;
      const validationAction = await generateValidationAction({
        ideaTitle: pi.intentSummary,
        ideaDescription: pi.problemStatement,
        targetUser: pi.targetUser,
        problemStatement: pi.problemStatement,
        stage: input.founderContext?.stage ?? "idea",
      });
      if (blueprint.cofounderHandoff) {
        blueprint.cofounderHandoff.firstValidationAction = validationAction;
      }
    } catch {
      // Non-fatal — validation action generation is additive
    }
  }

  // Save locally
  saveBlueprint(blueprint);

  onProgress?.("Done.");
  return blueprint;
}

// ─── Blueprint scoring ────────────────────────────────────────────────────────

/**
 * Scores a blueprint for integration with Startup Score.
 * Returns a 0-100 feasibility score with breakdown.
 * Integrates with BuildMind Core Startup Score system.
 */
export function scoreBlueprintFeasibility(blueprint: StartupBlueprint): {
  score: number;
  breakdown: { dimension: string; score: number; note: string }[];
} {
  const breakdown: { dimension: string; score: number; note: string }[] = [];
  let total = 0;

  // Problem clarity (20 pts)
  const problemText = blueprint.productInterpretation?.problemStatement
    ?? blueprint.layers?.problem?.content
    ?? "";
  const problemScore = problemText.length > 50 ? 20 : 10;
  breakdown.push({ dimension: "Problem Clarity", score: problemScore, note: problemText.slice(0, 80) + "..." });
  total += problemScore;

  // MVP scope (20 pts)
  if (blueprint.mvpConstruction) {
    const mustHaveCount = blueprint.mvpConstruction.coreFeatures.filter(f => f.priority === "must-have").length;
    const scopeScore = mustHaveCount <= 5 ? 20 : mustHaveCount <= 10 ? 12 : 5;
    breakdown.push({ dimension: "MVP Scope", score: scopeScore, note: `${mustHaveCount} must-have features` });
    total += scopeScore;
  }

  // Market validation (20 pts)
  if (blueprint.marketIntelligence) {
    const competitorCount = blueprint.marketIntelligence.primaryCompetitors.length;
    const marketScore = competitorCount >= 1 && competitorCount <= 5 ? 20 : competitorCount === 0 ? 5 : 12;
    breakdown.push({ dimension: "Market Signal", score: marketScore, note: `${competitorCount} known competitor(s)` });
    total += marketScore;
  }

  // Founder fit (20 pts)
  if (blueprint.founderFit) {
    breakdown.push({ dimension: "Founder Fit", score: blueprint.founderFit.fitScore / 5, note: blueprint.founderFit.reasoning.slice(0, 60) });
    total += Math.round(blueprint.founderFit.fitScore / 5);
  }

  // Risk profile (20 pts)
  if (blueprint.riskRegister) {
    const highRisks = blueprint.riskRegister.risks.filter(r => r.likelihood === "high" && r.impact === "high").length;
    const riskScore = highRisks === 0 ? 20 : highRisks === 1 ? 14 : highRisks <= 3 ? 8 : 4;
    breakdown.push({ dimension: "Risk Profile", score: riskScore, note: `${highRisks} high-impact / high-likelihood risk(s)` });
    total += riskScore;
  }

  return { score: Math.min(total, 100), breakdown };
}

// ─── Execution Map integration ────────────────────────────────────────────────

/**
 * Converts a StartupBlueprint's execution plan into BuildMind Execution Map tasks.
 * This is the integration point between Ventures and the core BuildMind workflow:
 *
 *   Idea → Ventures blueprint → Execution Map → Daily Command Center
 *
 * Returns tasks in the format expected by the core task system.
 */
export function blueprintToExecutionTasks(blueprint: StartupBlueprint): {
  title: string;
  description: string;
  dueDay: string;
  type: "setup" | "build" | "test" | "launch" | "grow";
  milestone: string;
}[] {
  if (!blueprint.executionPlan) return [];

  return blueprint.executionPlan.milestones.map(m => ({
    title: m.task,
    description: m.deliverable,
    dueDay: m.day,
    type: m.type,
    milestone: `Sprint ${blueprint.executionPlan!.sprintPlan.find(
      s => parseInt(m.day.replace(/\D/g, "")) <= parseInt(s.weeks.split("–")[1]) * 7
    )?.sprint ?? 1}`,
  }));
}
