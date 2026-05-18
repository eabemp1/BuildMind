# BuildMind — Implementation Notes

## Changes implemented in this session

### Bug Fixes (from buildmind-recommendations.md)

**Bug 1.1 — Reflexion output never shown**
- `app/api/ai/today-action/route.ts`: Added missing `action: reflexionOutput?.output ?? fallback.action` line. The reflexion output's action text was being discarded; now surfaces as the task.

**Bug 1.2 — planGuard crashes on unknown plans**
- `lib/server/planGuard.ts`: Added bounds check — if `actual` or `required` isn't in `PLAN_ORDER`, returns `false` instead of crashing.

**Bug 1.3 — Duplicate founder_memory fetch**
- `app/api/ai/today-action/route.ts`: Eliminated second round-trip to `founder_memory` and `reflections`. Now reuses `memoryResult` already fetched earlier in the same request.

**Bug 1.4 — Duplicate break-startup page**
- `app/(dashboard)/break-startup/page.tsx`: Confirmed it is a clean redirect-only file (no logic). Canonical route remains `/break-my-startup`.

**Bug 1.6 — Notification timing**
- `vercel.json`: Changed push cron from `30 5 * * *` to `0 7 * * *` — gives a full 2-hour gap after 5am briefing.

**Bug 1.7 — Duplicate render.yaml push sender**
- `render.yaml`: Commented out the `buildmind-daily-push` cron service. Vercel cron is now the single source of truth. Weekly report cron is unaffected.

---

### Product Improvements — Verbal Transcript + Recommendations

**Rec 2.1 — Weekly report feeds into Monday's task**
- `app/api/ai/weekly-report/route.ts`: Writes `last_week_summary` JSON (tasks_completed, avg_confidence, biggest_gap, next_week_focus) to `founder_memory` after each report generation.
- `app/api/ai/today-action/route.ts`: On Mondays, reads `last_week_summary` and injects it into the task generation prompt. Addresses biggest gap from last week. If avg_confidence < 3, starts with easier task.

**Rec 2.2 — Weekly report as primary avoidance_zones writer**
- `app/api/ai/weekly-report/route.ts`: After AI runs, pulls blocked/low-confidence reflections from the week, extracts avoidance notes, merges into `founder_memory.avoidance_zones`. Caps at 10 patterns.

**Rec 2.3 — Milestone completion triggers Break My Startup**
- `app/(dashboard)/projects/[id]/page.tsx`: `toggleTask()` now detects if the completed task finishes a milestone and fires `triggerMilestoneChallenge()` in the background.
- New API: `app/api/ai/stage-transition-challenge/route.ts` — generates assumption challenges per stage/milestone and stores them in `projects.pending_transition_challenge`.
- Project page loads and displays `pending_transition_challenge` as an acknowledge-gated interstitial.

**Rec 2.4 — Stage transition triggers challenge (verbal transcript)**
- `app/today/page.tsx`: On load, compares `project.startup_stage` to `localStorage.bm_last_stage_{projectId}`. If changed, fires stage-transition challenge in background.
- New API: `app/api/ai/check-stage-transition/route.ts` — checks all three signals (milestone completion, reflection confidence, override count). Returns `shouldPrompt` + `nextStage`.
- `lib/stages/index.ts`: Added `shouldPromptStageTransition()` — the three-signal function from the verbal transcript. Signals: stage milestones complete + avg confidence > 3.5 + overrides < 2 in last 7 days.
- Project page shows three-signal transition prompt when all signals align.

**Rec 2.5 — AI Coach proactive memory observation**
- `app/api/ai/coach/route.ts`: Added `buildProactiveObservation()` — before answering, coach leads with an unraised behavioral observation from founder memory. Makes a direct statement, not a question.

**Rec 3.2 — Project page narrative sentence**
- `app/(dashboard)/projects/[id]/page.tsx`: Deterministic narrative sentence generated from project state (stage, completion %, milestone count) and displayed as a left-bordered interpretation block.

**Rec 3.3 — Momentum direction indicator**
- Project page completion shows directional arrow (↑/→/↓) with color (green/amber/grey) instead of bare percentage.

**Rec 3.4 — Stage label as directive**
- `app/(dashboard)/projects/[id]/page.tsx`: Added `STAGE_DIRECTIVES` constant with pointed per-stage copy (e.g. "Every task that doesn't involve talking to a human is a distraction"). Displayed below the stage badge.

**Rec 3.5 — Avoidance pattern surface**
- Project page: Renders `project.avoidance_pattern` (if set) as a yellow warning block below the progress bar. This is the "BuildMind does what a to-do list cannot" moment.

**Rec 4.1 — Show ALL locked nav items**
- `components/layout/sidebar.tsx`: All progress-locked nav items now show as ghost entries with a mini progress bar toward the unlock threshold, not just the next one. Turns locks into reward mechanisms.

**Rec 4.2 — Persistent daily loop status bar**
- `components/layout/app-shell.tsx`: Added `DailyLoopStatusBar` component — shows day of week, task status (done/not yet), reflection status (done/pending), and briefing timing. Reads from `localStorage`.
- `app/today/page.tsx`: Sets `bm_task_done_{date}` on task completion.
- `app/reflect/page.tsx`: Sets `bm_reflect_done_{date}` on reflection submission.

**Rec 5.1 — Remove "Daily Command Center" label**
- `app/today/page.tsx`: Removed the "Daily Command Center" eyebrow label. Page heading is now simply "Today's Action". Streak badge only shows when streak > 1.

**Rec 5.2 — AI usage counter moved to threshold banner**
- `app/today/page.tsx`: AI usage bar now only appears when ≤ 5 calls remain (not on every load). Shows as a warning-red banner, not a progress bar in the header.

**Rec 6.2 — Intention vs execution rate headline**
- `app/api/ai/weekly-report/route.ts`: System prompt now requests `intention_vs_execution_rate` (0–100) and `execution_trend` (up/down/flat).
- `components/WeeklyReportCard.tsx`: Shows the rate as a large headline number with trend arrow next to the "Intention vs Execution" section.

**Verbal transcript — Universal founder positioning**
- No product-level changes required: geographic intelligence was never built as a specialization feature. The geo detection (flags/country display) is display-only and correctly universal.
- `lib/nav-config.ts`: Updated Ventures nav comment to clarify it's a Builder-tier FUTURE feature per Playbook, not tied to any plan tier.
- `lib/plan.ts`: Already correctly maps `ventures` and `venture` to `free` in `normalizePlan()`.

---

### Ventures plan (per instructions)
- Ventures as a plan tier: was already removed. `plan.ts` has only `free` and `builder` as active tiers.
- Ventures as a feature: kept under Builder in `nav-config.ts`, gated by `requiredPlan: "builder"`. Per Playbook §5.3, this is a Month 3+ feature. No changes to the ventures feature page.
