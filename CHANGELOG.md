## v6.2 Playbook alignment — 2-tier model + feature audit (2026-04-27)

### Root cause
Previous fix applied the full 5-tier pricing model from Playbook §6. The playbook
§11 ("This Week") and §10 (30/60/90-Day Framework) make the timeline explicit:

  - RIGHT NOW: Free + Builder only. Builder at $19. Free live.
  - Day 90 (conditional): Operator opens to WAITLIST — only if briefing open rate
    > 35% AND task completion > 55%.
  - Month 6+: Founder. Month 12+: Chief of Staff.

Building all 5 tiers now adds engineering surface with zero revenue benefit and
risks fragmenting focus during the most critical retention window.

### lib/plan.ts — collapsed to 2 active tiers
- Plan type: "free" | "builder" only
- normalizePlan() maps any future/legacy tier string (operator, founder,
  chiefofstaff, venture) → "builder" as a safe interim
- Full 5-tier definitions preserved in comments with exact playbook unlock conditions
- PLAN_ORDER: ["free", "builder"]

### app/api/ai/_planCheck.ts + lib/server/planGuard.ts
- PLAN_ORDER corrected to ["free", "builder"]

### Route plan guards corrected to 2-tier
All "operator" guards collapsed to "builder" (highest active paid tier):
  - cofounder/blueprint  → builder ✓
  - cofounder/reframe    → builder ✓
  - ventures/generate    → builder ✓

### PLAYBOOK TIMING warnings added to premature routes
Four routes exist ahead of their playbook unlock date. Added ⚠️ warning
headers documenting the condition before each should be surfaced in UI:
  - app/api/ventures/generate    — not in 12-month roadmap; Month 3+ tooling
  - app/api/cofounder/blueprint  — Month 3 (Ghost Competitor tier)
  - app/api/cofounder/reframe    — Month 3 (Ghost Competitor tier)
  - app/api/scorecard/generate   — Month 2 (after first 7 users)

### app/api/morning-briefing/route.ts — CRITICAL BUG FIX
Previous code gated morning briefing at checkPlanAccess("builder"), blocking
free users entirely. Playbook §6.1 explicitly gives free users "Morning Briefing
— 3 days/week."

Fixed: route now reads the user's plan and gates by day-of-week for free tier
(Mon/Wed/Fri). Builder users get it daily. When a free user hits a non-briefing
day, the response returns the exact Playbook §6.2 paywall copy:
  "Your Morning Briefing is ready. You need Builder to receive it every day."
with upgradePrompt: true for the UI to action.

### Feature audit — NOW features (Playbook §5.3)
All 10 "Now" features confirmed present in codebase:
  ✅ Founder Context Object (lib/founderContext.ts, JSONB in Supabase)
  ✅ Reflexion Loop — 3-agent chain (lib/reflexion.ts)
  ✅ Morning Briefing — scheduled Edge Function (supabase/functions/scheduled-jobs)
  ✅ Evening Check — same Edge Function, 6pm job
  ✅ Cognitive Load Check-in (lib/reflexion.ts, app/api/morning-briefing)
  ✅ One Task Rule + HITL Override (app/api/founder-context/override/route.ts)
  ✅ Momentum Score (lib/founderContext.ts, lib/recoveryMode.ts)
  ✅ Explainable Rationale (lib/reflexion.ts — Refiner output)
  ✅ Emotional Language Layer (lib/reflexion.ts §4.1 — getEmotionalLanguageInstruction)
  ✅ Recovery Mode (lib/recoveryMode.ts — shouldActivateRecoveryMode, Reset Mission)

## v6.1 Monetisation alignment with Playbook v4 (2026-04-27)

### Plan tier model rewritten — lib/plan.ts

The previous 3-tier model (free / builder / venture at $0 / $25 / $45) did not
match the playbook. The correct model per Playbook v4 §6 is 5 tiers:

| Tier         | Price  | Key features added |
|---|---|---|
| Free         | $0     | Reflexion Strike, 5 tasks/week, Morning Briefing 3 days/week |
| Builder      | $19    | Daily briefing, unlimited AI, full Momentum Score, Recovery Mode, Emotional Layer, Weekly Mirror |
| Operator     | $39    | Ghost Competitor, Stress Test Arena, Pattern Detection, Accountability Pairing, Resource Library |
| Founder      | $69    | Public Milestone Profiles, Grant Finder, daily Ghost Competitor, Calendar Integration |
| Chief of Staff | $120 | AI Board of Advisors, Talent Hiring, browser extension, white-glove onboarding |

Old `venture` string (from Supabase metadata) is now normalised to `operator`
as the closest equivalent feature tier. All legacy aliases handled in normalizePlan().

### Plan guard tier corrections

| Route | Was | Now | Reason |
|---|---|---|---|
| app/api/ai/coach | builder | builder | Correct — unlimited AI is Builder |
| app/api/ai/weekly-report | builder | builder | Correct — Weekly Mirror is Builder |
| app/api/cofounder/reframe | builder | operator | Competitor intelligence = Operator (Ghost Competitor tier) |
| app/api/cofounder/validation-action | builder | builder | Execution support = Builder |
| app/api/cofounder/blueprint | venture→operator | operator | Blueprint mode is competitor intelligence = Operator |
| app/api/ventures/generate | venture→operator | operator | Full venture blueprint = Operator minimum |

### Paywall moments wired (PLAN_PAYWALL_MOMENTS)

The exact paywall copy from Playbook §6.2 is now defined in plan.ts:
- Free → Builder: "Your Morning Briefing is ready. Upgrade to receive it every day."
- Builder → Operator: competitor avoidance pattern trigger
- Operator → Founder: grant finder trigger
- Founder → Chief of Staff: AI Board trigger

## v6 Security & Reliability Fixes (2026-04-27)

### Plan guard hardening — 4 routes secured
- `app/api/ai/coach/route.ts` → added `checkPlanAccess("builder")` server-side guard
- `app/api/cofounder/reframe/route.ts` → added `checkPlanAccess("builder")` + updated misleading comment
- `app/api/cofounder/validation-action/route.ts` → added `checkPlanAccess("builder")`
- `app/api/cofounder/blueprint/route.ts` → added `checkPlanAccess("venture")`
All four previously relied solely on client-side limits (localStorage) and could be bypassed.

### Production database warning
`.env.example` now documents that `DATABASE_URL=sqlite://...` is dev-only and
must be replaced with a PostgreSQL URL before production deployment.

### runtime.py module map
Added structured docstring to `app/agent/runtime.py` mapping all 11 logical sections
with line ranges and a prioritised refactor roadmap (Khaya → memory → forge → workspace).

# Changelog

## v4 Feature Implementation (2026-04-27)

**NEW IN V4 — All five features from Playbook §4 are now implemented:**

### 4.1 Emotional Language Layer
- `lib/reflexion.ts`: `inferEmotionalTrigger()` and `getEmotionalLanguageInstruction()` added
- Agent C (Refiner) now injects warmth at 5 key trigger moments: 3+ days inactive, two tasks in a row, override submitted, first week completed, momentum low but stable
- No new infrastructure — prompt-level addition as specified in the playbook

### 4.2 Forgiveness Protocol / Recovery Mode
- `lib/recoveryMode.ts`: New module — `shouldActivateRecoveryMode()`, `generateResetMission()`, `momentumAfterResetMission()`
- `app/api/recovery-mode/route.ts`: GET/POST/PATCH endpoints for checking, activating, and completing Recovery Mode
- `app/api/push/send-daily/route.ts`: Recovery Mode push messages replace standard nudge for 3+ day inactive founders
- Migration `0003_v4_features.py`: `recovery_mode_active` and `reset_mission_complete` columns added to `founder_context`

### 4.3 Shareable Execution Scorecard
- `lib/executionScorecard.ts`: `generateScorecard()`, `buildShareText()`, `shouldOfferScorecard()`, `shareToX()`
- `app/api/scorecard/generate/route.ts`: POST generates and persists scorecard; PATCH marks as shared
- Migration `0003_v4_features.py`: `execution_scorecards` table created
- Trigger: Day 7 check-in with 3+ tasks completed; one-tap X share

### 4.4 Agent Persona Rotation
- `lib/reflexion.ts`: `getWeeklyCriticPersona()`, `CRITIC_PERSONAS` map (4 personas cycling weekly)
- Agent B now rotates: Skeptical YC Partner → Aggressive Growth Hacker → Frugal Accountant → Customer Empathy Advocate
- Rotation state stored in `founder_context.persona_week` (migration `0003`)

### 4.5 Confidence Gate
- `lib/reflexion.ts`: `shouldTriggerConfidenceGate()`, `getConfidenceGateResponse()`
- Fires when `domainDataPoints < 5` — AI surfaces uncertainty instead of guessing
- Returns: "I don't have enough context on your local market to give a firm answer here."

## Unreleased
- Added per-user personal token scoping for ownership/rental/control.
- Added privacy controls for anonymized learning contribution.
- Added anonymized event stream (`global_events.jsonl`) and dataset snapshot builder endpoints.
- Added reminder scheduler process and in-browser due reminder polling/sound.
- Added core-agent catalog promotion so routing categories map to visible agents.
- Disabled metaverse runtime paths by feature flag for MVP clarity.
- Added baseline structured logging helper (`log_event`) in server.
- Added demo seeding script: `scripts/seed_demo_data.py`.
- Added baseline tests under `tests/`.
