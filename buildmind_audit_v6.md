# BuildMind v6 — Change Manifest

## Session 6 — Completing the "Next Session" items from v5

### ✅ Product #6 — Richer onboarding depth (3-question screen)

**`app/onboarding/page.tsx`** — new screen inserted between Strike and Identity:
- `DepthScreen` component with 3 conversational single-line questions:
  1. Avoidance zones ("What kind of work do you keep putting off?")
  2. Revenue model ("How do you plan to charge?")
  3. Target users ("Who exactly are you building this for?")
- Animated progress dots (3-step), 80-char limit per answer, skip button on each
- "Your AI advice quality improves by up to 30 points" nudge appears after first answer
- All 3 answers optional — skippable — onboarding never blocked
- `Screen` type extended: `"input" | "strike" | "depth" | "identity" | "saving"`
- `depthAnswers` state wired through to `createProjectWithRoadmap()`:
  - `target_users` pre-populated from depth answer (was hardcoded `"founders"`)
  - avoidance + revenueModel persisted via fire-and-forget to new API endpoint

**`app/api/onboarding/depth-answers/route.ts`** — new endpoint:
- POST persists avoidance → `founder_memory.avoidance_zones[]`
- POST persists target_users → `projects.target_users`
- POST appends revenue_model note to `projects.description`
- Fire-and-forget, never blocks navigation

---

### ✅ TeamsWaitlistCard (UI for Growth #3)

**`components/TeamsWaitlistCard.tsx`** — new component:
- Email input (pre-fillable from auth), use-case dropdown (4 options), optional team size
- Obsidian card aesthetic, celadon (`#10b981`) CTA button
- Success state: "🎉 You're #[N] on the early access list"
- `asModal` prop: renders as full-screen overlay with backdrop blur
- Calls `/api/waitlist/teams` (already implemented in v5)

**`app/invite/page.tsx`** — wired in:
- `TeamsWaitlistCard` rendered below the referral list when `FEATURES.teamsWaitlist = true`
- Framer Motion entrance animation (delay 0.3s)

---

### ✅ ProfileCompletenessBar — integrated into pages

**`app/(dashboard)/overview/page.tsx`**:
- Full card variant rendered after header, before metric row
- Fields populated from `activeProject` and `overview` query data
- Shows/hides automatically when score ≥ 80

**`app/today/page.tsx`**:
- Banner variant injected after first-session banner
- Fields populated from active `project` data
- Dismisses for the day via sessionStorage key

---

### ✅ MobileCheckin — integrated into /today + API endpoints

**`app/today/page.tsx`**:
- Time-of-day detection: morning (6–10am) or evening (6–10pm)
- Per-day localStorage key (`bm_morning_checkin_${dateString}`) prevents re-showing
- Morning: fires POST to `/api/morning-checkin` with note
- Evening: fires POST to `/api/evening-checkin` with note
- Framer Motion entrance animation

**`app/api/morning-checkin/route.ts`** — new endpoint:
- Auth-guarded POST
- Prepends `{ type: "morning_checkin", note, timestamp }` to `profiles.recent_interactions[]`
- Keeps last 10 interactions (FIFO)
- AI Coach reads `recent_interactions` for cross-session continuity

**`app/api/evening-checkin/route.ts`** — new endpoint:
- Auth-guarded POST
- Same `recent_interactions` persistence
- Also triggers `evening-check/worker` fire-and-forget for re-engagement scoring

---

### ✅ ConfidenceBadge — wired into BreakMyStartup2

**`components/BreakMyStartup2.tsx`**:
- `ConfidenceBadge` imported
- Rendered inline next to "FINAL VERDICT — {N}% SURVIVAL" when `result.analysis.confidence_score` is present
- Badge shows amber (50–74%) or red (<50%) with tooltip of `missing_data[]`
- Zero-change when confidence ≥ 0.75 (badge returns null)

---

### ✅ Public Founder Score — settings UI

**`app/(dashboard)/settings/page.tsx`**:
- New "Public Profile" tab added to sidebar nav (Globe icon)
- Username input with slug-safe validation (regex `/[^a-z0-9_-]/g`)
- Live preview URL: `buildmind.live/founder/{username}`
- Uniqueness check via Supabase before save (excludes own ID)
- "Show my Momentum Score publicly" toggle → writes `public_profile` boolean
- Shows gated notice when `FEATURES.publicFounderScore = false`
- `handlePublicSave()` — separate save flow, own saved/error state

---

### ✅ `/api/cron/aggregate-benchmarks` — nightly cron

**`app/api/cron/aggregate-benchmarks/route.ts`** — new endpoint:
- Reads `benchmark_events` from last 90 days
- Groups by `(stage, signal_type, category)` using Map
- Computes: `sample_size`, `median_momentum`, `completion_rate`, `pivot_rate`, `recovery_rate`
- Cohorts with `sample_size < 10` excluded (privacy guard matches RLS)
- Calls Groq `llama-3.1-8b-instant` (80 tokens) to generate `insight_text` per cohort
- Upserts to `benchmark_cohorts` on `(stage, signal_type, category)` conflict key
- Cron: `0 2 * * *` UTC (2am nightly) — registered in `vercel.json`

---

### ✅ `/api/ai/embed-tags` — tag embedding job

**`app/api/ai/embed-tags/route.ts`** — new endpoint:
- Uses OpenAI `text-embedding-3-small` to embed `personality_tags[]` and `avoidance_zones[]`
- Cosine similarity deduplication at threshold 0.85 (replaces substring heuristic)
- Within each cluster, keeps shortest tag (more general)
- Writes deduplicated arrays + mean embedding vectors back to `founder_memory`
- Single-user mode: triggered from `/api/ai/coach` fire-and-forget after each interaction
- Nightly sweep mode: processes 50 rows with `personality_tags_embedding IS NULL`
- Cron: `0 3 * * *` UTC — registered in `vercel.json`

**`app/api/ai/coach/route.ts`** — patched:
- Fire-and-forget call to `/api/ai/embed-tags` after every coach interaction
- Passes `{ userId }` so embedding is scoped to the active founder

---

### `vercel.json` — updated
Two new function configs (`maxDuration: 60`) and two new cron entries:
- `aggregate-benchmarks`: `0 2 * * *`
- `embed-tags`: `0 3 * * *`

---

## Items completed vs deferred

### ✅ Fully implemented this session (8 of 8):
1. Product #6 — richer onboarding depth (3-question screen + API)
2. TeamsWaitlistCard component + invite page integration
3. ProfileCompletenessBar → overview page (full card) + today page (dismissible banner)
4. MobileCheckin → today page + morning/evening API endpoints
5. ConfidenceBadge → BreakMyStartup2 results view
6. Public Founder Score settings UI (tab + username + toggle)
7. `/api/cron/aggregate-benchmarks` nightly cron
8. `/api/ai/embed-tags` background job + coach route trigger

### 🔒 Still deferred (activate when ready):
- `FEATURES.publicFounderScore = true` (settings UI built, API built in v5, toggle this line)
- ConfidenceBadge in AI Coach response rendering (needs `confidence_score` in coach response payload)
- ProfileCompletenessBar on `/settings` page (component built, not added there)
- `buildBenchmarkPrompt()` wired into `reflexion.ts` Stage 1 context (migration + cron done, injection step pending)
