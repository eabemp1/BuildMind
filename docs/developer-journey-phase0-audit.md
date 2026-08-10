# Developer Journey — Phase 0 Architecture Audit

Scope: audit only, per the master prompt's own rule ("Do NOT code yet"). Based on
direct inspection of `BuildMind-main__62_.zip` — not assumption.

---

## A. Architecture Audit

**Stack confirmed:** Next.js App Router, Supabase (Postgres + RLS), TypeScript,
Groq/Cerebras/Gemini rotation (`lib/ai-providers.ts`), Vercel deploy + Vercel Cron
+ one Supabase Edge Function (`scheduled-jobs`), Polar + Paystack billing.

**The single biggest fact that shapes everything else:** every table in the schema
(`projects`, `milestones`, `tasks`, `founder_context`, `founder_memory`,
`reflexion_learning_log`, `user_achievements`, …) is single-owner. RLS policies are
uniformly `USING (auth.uid() = user_id)`. There is no concept anywhere in the
codebase of a second party reading or writing another user's row. `is_admin`
(`profiles.is_admin`, migration `20260429000000_admin_role.sql`) is a *global*
flag for the owner panel — not a scoped mentor-of-student relationship.

This means "Mentor" as a role is not a small addition. It's the one genuinely new
architectural primitive this feature needs — everything else (curriculum,
projects, XP, achievements, cron, AI tutor) has a close existing analog.

**Two naming collisions to route around, not fight:**
- `lib/learning.ts` / `lib/learningLoop.ts` already own the word "learning" —
  they're the *behavioral pattern learning* system for the Reflexion pipeline
  (`LearnedPatterns`, `deriveLearnedPatterns()`), completely unrelated to
  curriculum learning. Reusing "Learning\*" type names would collide in-editor
  and in prompts fed to Codex.
- `app/students/page.tsx` already exists — it's a marketing/SEO landing page
  ("BuildMind for Students," free-tier pitch), not this feature. A route like
  `/students` is taken.
- → Confirms the master prompt's own suggested namespace, `developer_journey`,
  is the right call. I'd go further: avoid the word "Learning" in new type/table
  names entirely (e.g. `JourneyModule` not `LearningModule`) to keep it
  grep-distinguishable from the existing behavioral-learning code.

**Directly reusable, found and inspected:**
- `lib/achievements.ts` + `user_achievements` table — static `Achievement[]`
  definitions with `condition(stats)` predicates, server-verified unlock via
  `POST /api/achievements` (XP grants were deliberately locked down to this one
  path after a security fix — `POST /api/user/xp` is `410 Gone` on purpose, per
  its own comment). New journey achievements slot into this array; XP must
  follow the same "server-verified event only" rule, not a new grant path.
- `lib/storage.ts` — per-user-namespaced localStorage wrapper. Reuse directly for
  any client-only journey UI state (draft reflections, in-progress hint level).
- `lib/nav-config.ts` — declarative nav array with `unlocksAt`/`requiredPlan`
  gating already built. Journey nav items are additive rows, not a new nav system.
- `lib/notifications.ts` — `NotifType` union + engine. Add
  `journey_deadline`, `journey_graded`, etc. as new union members rather than a
  parallel notification system.
- Cron: `scheduled_job_log` table + Vercel cron routes under `app/api/cron/*`
  already implement the idempotency/dedup pattern the master prompt asks for
  (§40). `supabase/functions/scheduled-jobs/index.ts` is the Edge Function
  equivalent — currently disabled in favor of Vercel cron per
  `20260513000001_disable_supabase_cron.sql`. New jobs should follow the Vercel
  cron path, not revive pg_cron.
- `lib/ai-providers.ts` — provider rotation with FAST/REASONING roles already
  built and already the thing powering `coachContext.ts`. The AI Tutor doesn't
  need new provider wiring, just a new context-assembly module in the same
  shape as `lib/coachContext.ts`.
- `projects` / `milestones` / `tasks` schema (`supabase/schema-idempotent.sql`)
  is a clean, working pattern for parent→milestone→task hierarchies with RLS,
  `status` CHECK constraints, and `updated_at` triggers — the direct template
  for `JourneyProject` → `ProjectMilestone` → `Submission`, even though these
  need to be separate tables (see C).

## B. Existing Components Reused As-Is

- `lib/storage.ts`, `lib/nav-config.ts`, `lib/notifications.ts` (extended, not replaced)
- `lib/achievements.ts` + `user_achievements` (extended with new achievement defs)
- `lib/ai-providers.ts` (new call sites, no new provider code)
- Cron pattern: `scheduled_job_log` + Vercel cron route shape
- Auth: `lib/supabase/server.ts` / `createClient()` session pattern
- RLS/trigger conventions from `schema-idempotent.sql`

## C. New Components Required

1. **Mentor↔Student relationship model** (the real new primitive — see I).
2. `developer_journey` domain tables — kept separate from `projects`/`milestones`
   because the domain genuinely diverges (rubrics, prerequisites, skill evidence,
   submission versioning aren't things founder projects need, and overloading
   `projects` with a `kind` discriminator would leak curriculum-shaped columns
   into the founder-execution product for zero benefit).
3. Skill graph + evidence tables (§11, §30).
4. Grading engine (rubric config + per-submission scores, §9).
5. AI Tutor context module (`lib/journeyTutorContext.ts`, mirrors `coachContext.ts`).
6. Recommendation/"why this" module (§43–44) — deterministic first pass (rule-based
   on skill evidence + deadlines), AI only for the natural-language justification,
   per the master prompt's own §57 cost-control rule.

## D. Database Changes (additive only, new migration file)

New tables, all with `user_id` (student) + RLS mirroring existing pattern, plus
one relationship table:

- `learning_relationships` (mentor_id, student_id, status) — see I.
- `journey_paths`, `journey_modules`, `journey_topics`, `journey_activities`
- `journey_skills`, `journey_skill_evidence`
- `journey_projects`, `journey_milestones`, `journey_submissions`, `journey_grades`
- `journey_sessions` (time tracking), `journey_reflections`

No changes to any existing table. No destructive migrations — matches the
codebase's own established discipline (per prior audits in this repo).

## E. API Changes

New routes under `app/api/journey/*` (student-facing) and `app/api/journey/mentor/*`
(mentor-facing, gated by the relationship table): today-mission, activity-complete,
project/submit, mentor/grade, tutor/message, weekly-review, monthly-report.
Reuse `lib/server/rateLimit.ts` and `lib/server/logger.ts` patterns already in use
on `app/api/ai/*`.

## F. Frontend Changes

New route group, e.g. `app/(journey)/journey/{today,learn,projects,skills,
achievements,progress,tutor}` for the student, `app/(journey)/mentor/*` for the
mentor view. Add corresponding rows to `lib/nav-config.ts`, gated so they only
render for accounts that are a party to a `learning_relationships` row (most
BuildMind users — the actual paying founders — should never see this).

## G. Cron/Scheduler Changes

New Vercel cron entries (daily mission gen, deadline/overdue check, streak calc,
weekly review, monthly report) following the exact `scheduled_job_log` dedup
pattern already used by `milestone-stall`, `evening-check`, etc. — no new
scheduling infrastructure needed.

## H. AI Changes

One new context-assembly module for the tutor (progressive hint levels, §45),
one new deterministic-first recommendation module. No new AI provider, no new
cost surface beyond normal usage — should route through the same
`ai_usage_daily` accounting already in place so it doesn't silently bypass
existing usage caps.

## I. Authorization Changes — the critical path

This is where the real design work is, and where I'd stop and get your sign-off
before generating any migration:

- Add `learning_relationships(mentor_id uuid, student_id uuid, status text)`.
- Every new `journey_*` table gets RLS via a `SECURITY DEFINER` helper function
  (e.g. `is_mentor_of(student_id)`) rather than inlining relationship lookups
  into every policy — one function to audit, not a dozen near-duplicate policies.
- Student policies: full CRUD on their own rows except `journey_grades`
  (read-only to student, write-only to verified mentor).
- Mentor policies: read on everything for their linked student(s); write only on
  `journey_grades`, `journey_milestones.deadline` overrides, and roadmap fields
  explicitly called out in §46 as mentor-authoritative.
- Given this is a two-person, real-world relationship (you and one student, not
  a marketplace), the relationship table can start intentionally minimal —
  no invite flow, no multi-mentor support — and still be the correct primitive
  to extend later rather than a hack to unwind.

## J. Testing Strategy

Extend `__tests__` and `e2e` (both already present) with: RLS/authorization
tests (student cannot read `journey_grades` pre-write, cannot query another
student's rows, mentor cannot query an unlinked student), achievement
duplicate-unlock prevention (mirrors existing `user_achievements` UNIQUE
constraint pattern), cron idempotency (mirrors `scheduled_job_log` dedup tests
if any exist — worth checking), and rubric-score arithmetic (deterministic,
pure-function testable without hitting Supabase).

## K. Migration Strategy

One additive migration following the existing `YYYYMMDDHHMMSS_description.sql`
naming convention (most recent in repo: `20260604000000_rename_avoidance_signals.sql`).
No edits to existing tables or policies. Ship schema in Phase 1 only — resist
the temptation to create all `journey_*` tables from §41 up front; add
skill-graph and grading tables in Phase 2/4 when they're actually consumed,
per the master prompt's own phased plan (§53).

## L. Risks

1. **Scope vs. solo bandwidth.** The master prompt (66 sections) describes a
   full LMS. You're one person, one student, on Codex-generate/Claude-verify
   cadence. The phased plan in §53 is the right shape — Phase 0–3 (audit → core
   domain → projects → Today) is a real, shippable slice; skill graph,
   gamification, and adaptive intelligence (§4–8) are genuinely optional and
   should stay optional.
2. **RLS complexity.** `is_mentor_of()` needs to be airtight — a bug here leaks
   grades/feedback across accounts, which is a real trust issue for a real
   relationship, not just a demo bug.
3. **Naming collision risk with `lib/learning.ts`.** Concrete, avoidable — just
   don't use "Learning" as a type/table prefix (see A).
4. **AI-tutor scope creep into a general chatbot** (explicitly warned against in
   §7/§25) — keep it context-bound to current module/skill/deadline state, reuse
   `ai_usage_daily` accounting so it doesn't become an unmetered cost surface.
5. **Given it's one mentor and one student, most of the "mentor dashboard" (§22)
   collapses to a few cards, not a separate product surface** — worth resisting
   the urge to build it as if for many students.

## M. Recommended Vertical Slice

The student is already past Module 4 (Text Analysis Tool) based on the tutoring
prep already produced. Recommended first slice, matching §52/§62:

`journey_relationships` seed (you ↔ student) → one `journey_path` row seeded
from the 16-module curriculum → Today view showing current module/topic →
one project (`Gradebook Management System`, Module 5, the next unbuilt one) with
a milestone and deadline → submission (repo URL + notes) → your grading UI
(rubric from §9, hardcoded default weights) → grade write updates
`journey_skill_evidence` → Progress view reflects it → one deterministic
"what's next" recommendation.

No AI tutor, no XP/achievements, no cron in this first slice — those are Phase
5–7 per the master prompt's own ordering, and the slice above already proves
the full loop end-to-end.

---

**Not started:** no code, no migration, no new files outside this doc. Confirming
this scope with you before I touch the schema — say the word and I'll generate
the Phase 1 migration + the vertical slice above.
