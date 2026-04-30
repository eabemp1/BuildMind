# BuildMind Ventures + CoFounder Core — Integration Guide

**Date:** April 2026  
**Status:** Implementation Complete — Ready for UI wiring

---

## What Was Built

This implementation adds two interconnected systems to BuildMind:

### 1. BuildMind Ventures (`lib/ventures/index.ts`)
Transforms raw startup ideas into complete 8-layer startup blueprints.

### 2. CoFounder Core (`lib/cofounder/`)
A motivational immune system that activates when a founder's psychology breaks down.

---

## Files Created

### New Library Files

| File | Purpose |
|------|---------|
| `lib/ventures/index.ts` | Full Ventures engine — blueprint generation, scoring, execution map integration |
| `lib/cofounder/index.ts` | Barrel export for all CoFounder Core modules |
| `lib/cofounder/competitorReframe.ts` | Module 1 — Competitor Reframe (panic → intel in <30s) |
| `lib/cofounder/validationReceipts.ts` | Module 2 — Validation Receipt System |
| `lib/cofounder/spiralDetection.ts` | Module 3A — Spiral Detection (chat phrase monitoring) |
| `lib/cofounder/idleDetection.ts` | Module 3B — Idle Detection (work window monitoring) |
| `lib/cofounder/blueprintMode.ts` | Module 4 — Blueprint Mode (extends BreakMyStartup) |

### New API Routes

| Route | Purpose |
|-------|---------|
| `app/api/ventures/generate/route.ts` | Core blueprint generation (multimodal: text + image) |
| `app/api/cofounder/reframe/route.ts` | Competitor Reframe (4-part structured output) |
| `app/api/cofounder/validation-action/route.ts` | Validation outreach template generation |
| `app/api/cofounder/blueprint/route.ts` | Blueprint Mode full intelligence (web search enabled) |

### Modified Files

| File | Changes |
|------|---------|
| `lib/plan.ts` | Added 9 new PlanLimits fields + 8 new FEATURE_GATES |
| `lib/founderMemory.ts` | Added `validationReceipts` and `competitorHistory` to FounderMemory type |

### New Database Migration

`supabase/migrations/20260425000000_cofounder_core_and_ventures.sql`

- Extends `founder_memory` with `validation_receipts` and `competitor_history` columns
- Creates `ventures_blueprints` table (blueprint history, scoring)
- Creates `cofounder_reframe_log` table (usage tracking for rate limiting)

---

## Blueprint Output Layers

### Free Plan: Layer 1 only

```typescript
blueprint.productInterpretation = {
  appCategory: "saas" | "marketplace" | "tool" | ...,
  problemStatement: "...",
  targetUser: "...",
  valueProposition: "...",
  detectedUIComponents: ["navbar", "data table", ...],
  detectedFeatures: ["auth", "search", ...],
  intentSummary: "what this system is trying to achieve"
}
```

### Builder Plan: All 8 layers

| Layer | Output |
|-------|--------|
| 1 — Product Interpretation | Problem, target user, value prop, detected features |
| 2 — System Design | Frontend arch, backend services, DB schema, API structure |
| 3 — MVP Construction | Prioritised features, critical path, success criteria |
| 4 — Execution Planning | Sprint plan, milestones, suggested stack, time to MVP |
| 5 — Founder Fit *(Claude addition)* | Fit score 0-100, strength alignment, blockers, recommendation |
| 6 — Market Intelligence *(Claude addition)* | TAM/SAM, competitors, monetisation model, GTM |
| 7 — Risk Register *(Claude addition)* | Top 5 risks with mitigation, founder-specific risk |
| 8 — CoFounder Core Handoff *(Claude addition)* | First validation action, competitor to reframe, day 1 task |

Plus: `codeScaffold` (project structure, starter files, setup commands)

---

## CoFounder Core Plan Gating

| Feature | Free | Builder |
|---------|------|---------|
| Competitor Reframe | 3×/week | Unlimited |
| Validation receipt logging | ✓ | ✓ |
| Blueprint Mode (basic steal/skip) | 1×/project | ✓ |
| founderMemory integration | ✗ | ✓ |
| Spiral detection + idle messages | ✗ | ✓ |
| Blueprint Mode (full intelligence + web search) | ✗ | ✓ |
| Validation receipt templates (AI-generated) | ✗ | ✓ |

Add to `lib/plan.ts` (`PlanLimits` already updated):
```typescript
competitorReframePerWeek: 3,        // free
cofounderCoreDepth: false,          // free
validationReceiptTemplates: false,  // free
blueprintModeFullIntel: false,      // free
```

---

## UI Wiring Required (Next Steps)

### Ventures Tab

The Ventures engine is complete. You need to build the UI at `/ventures`:

```tsx
// Minimum viable UI flow:
// 1. Input panel: textarea + image upload
// 2. "Generate Blueprint" button → calls generateBlueprint() from lib/ventures
// 3. Progress states: "Parsing idea..." → "Running intelligence..." → "Assembling..."
// 4. Output: tabbed panel per layer (Layer 1 always visible, rest gated)
// 5. "Send to Execution Map" button → calls blueprintToExecutionTasks()

import { generateBlueprint, blueprintToExecutionTasks } from "@/lib/ventures";
```

### CoFounder Core Chat Integration

Wire into the existing Today page chat thread:

```tsx
import { detectSpiral, extractCompetitorFromMessage, shouldActivateDeepIntervention } from "@/lib/cofounder/spiralDetection";
import { runCompetitorReframe } from "@/lib/cofounder/competitorReframe";

// In your chat input handler:
const spiral = detectSpiral(userMessage);
if (spiral.detected && spiral.signal === "competitor") {
  const { name, url } = extractCompetitorFromMessage(userMessage);
  if (shouldActivateDeepIntervention()) {
    // Builder: run full reframe
    const reframe = await runCompetitorReframe({ competitorName: name, ... });
  } else {
    // Free: show lightweight nudge + upgrade prompt
  }
}
```

### Idle Detection Hook

Call on app mount (e.g. in your root provider):

```tsx
import { checkIdleStatus, recordActivity } from "@/lib/cofounder/idleDetection";

// On mount:
const idleResult = checkIdleStatus();
if (idleResult.isIdle && idleResult.cofounderMessage) {
  // Show co-founder message in Today page chat thread
}

// On any meaningful user action:
recordActivity();
```

### Reframe Button (BreakMyStartup integration)

Add a "Blueprint Mode" button to BreakMyStartup results:

```tsx
import { runBlueprintMode } from "@/lib/cofounder/blueprintMode";

// When BreakMyStartup returns competitors:
const blueprint = await runBlueprintMode(
  projectId,
  competitors, // from BreakMyStartupAnalysis
  projectDescription,
  projectStage,
);
```

---

## Environment Variables Required

```env
# Already in your codebase:
ANTHROPIC_API_KEY=your_key_here   # Powers all Ventures + CoFounder Core AI calls

# Optional (for Supabase storage of blueprints):
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Integration with BuildMind Core Systems

### Startup Score Integration
```typescript
import { scoreBlueprintFeasibility } from "@/lib/ventures";
const { score, breakdown } = scoreBlueprintFeasibility(blueprint);
// Update Startup Score with feasibility data
```

### Execution Map Integration
```typescript
import { blueprintToExecutionTasks } from "@/lib/ventures";
const tasks = blueprintToExecutionTasks(blueprint);
// Add tasks to Execution Map / Daily Command Center
```

### founderMemory Integration
The `FounderMemory` type now includes:
- `validationReceipts: ValidationReceipt[]` — real human responses
- `competitorHistory: CompetitorHistoryEntry[]` — lookup frequency tracking

These are automatically used by the Reframe module when `cofounderCoreDepth` is true.

---

## Claude's Additions vs Original Spec

The original spec defined 4 output layers. This implementation adds 4 more:

| Addition | Rationale |
|----------|-----------|
| **Layer 5: Founder Fit** | A technically sound blueprint for the wrong founder is still a bad plan. Fit scoring prevents founder-idea mismatch before a single line of code is written. |
| **Layer 6: Market Intelligence** | Founders need monetisation clarity before architecture. Knowing TAM and GTM shapes which features to build first. |
| **Layer 7: Risk Register** | Most founders underestimate non-technical risks. The founder-specific risk field (pulled from founderMemory avoidance patterns) is the one risk they otherwise never see coming. |
| **Layer 8: CoFounder Core Handoff** | The spec defines the Ventures pipeline as ending at code scaffolding. This layer closes the loop back into CoFounder Core — the blueprint immediately generates a first validation action and suggests a competitor to reframe, turning the output from a document into a live execution trigger. |

The **blueprint feasibility scoring** (`scoreBlueprintFeasibility`) and **Execution Map integration** (`blueprintToExecutionTasks`) were also added to complete the pipeline described in the spec (Section 7: Integration with BuildMind Ecosystem):

> Idea enters Ventures → Blueprint enters Execution Map → Tasks appear in Daily Command Center
