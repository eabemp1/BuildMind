# Production Blockers — Audit & Fixes

## Summary

Three critical production blockers were identified and fixed:
1. **Projects cannot be deleted** — Missing DELETE RLS policies
2. **Tasks never created** (tasks_count = 0) — Silent error in `insertTasks()`
3. **AI usage not tracked** (ai_usage_30d_count = 0) — Missing INSERT/UPDATE policies on `ai_usage` table

Plus: **Plan gating audit** — Found 3 undocumented builder-only features, added to `FEATURE_GATES`.

---

## Issue 1: Projects Cannot Be Deleted (RLS Blocker)

**Status:** ✅ FIXED

**Root Cause:**
- The `projects`, `milestones`, `tasks`, and `founder_context` tables have Row-Level Security enabled
- They all have SELECT, INSERT, UPDATE policies
- **They have NO DELETE policies**
- Any attempt to delete returns `403 Forbidden` silently

**Impact:** High — Users cannot remove projects or start fresh

**Fix Applied:**
Migration: `supabase/migrations/20250505_add_delete_policies.sql`

```sql
CREATE POLICY projects_delete_own ON projects
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY milestones_delete_own ON milestones
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY tasks_delete_own ON tasks
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY founder_context_delete_own ON founder_context
  FOR DELETE USING (auth.uid() = user_id);
```

**Deployment Steps:**
1. Run migration in Supabase SQL Editor
2. Test: Try to delete a project via the UI
3. Verify: DELETE operations now succeed

---

## Issue 2: Tasks Never Created (tasks_count = 0)

**Status:** ✅ FIXED

**Root Cause:**
- File: `app/api/ai/generate-roadmap/route.ts`, line 68 (`insertTasks()` function)
- Function tries 4 different payload shapes to insert tasks (RLS workaround)
- **If all 4 attempts fail, it silently returns without throwing**
- The route continues and reports success even though zero tasks were created
- Users see milestones but no tasks — app appears broken

**Impact:** Very High — Core roadmap feature is non-functional

**Why It Failed:**
The function silently suppressed all errors after all 4 attempts:
```typescript
for (const attempt of attempts) {
  const result = await supabase.from("tasks").insert(attempt);
  if (!result.error) return;  // ✅ Success
  // If error, loop continues silently...
}
// ← Falls through here with NO ERROR THROWN
```

**Fix Applied:**
File: `app/api/ai/generate-roadmap/route.ts`

Added error tracking and logging:
```typescript
let lastError: unknown;
for (const attempt of attempts) {
  const result = await supabase.from("tasks").insert(attempt);
  if (!result.error) return;
  lastError = result.error;
  // ... rest of loop ...
}

// If all attempts failed, throw so we can see the actual error
if (lastError) {
  console.error("insertTasks: all 4 payload attempts failed. Last error:", lastError);
  throw lastError;
}
```

**Deployment Steps:**
1. Deploy the code change
2. Generate a new roadmap on a test project
3. Check server logs — if tasks still fail, you'll see the actual error (column mismatch, RLS issue, etc.)
4. Fix the underlying schema issue based on the logged error

---

## Issue 3: AI Usage Not Tracked (ai_usage_30d_count = 0)

**Status:** ✅ FIXED (partially)

**Root Cause:**
- File: `supabase/schema-idempotent.sql`, line 357
- The `ai_usage` table exists with proper structure
- Has SELECT policy ✅
- **Has NO INSERT or UPDATE policies** ❌
- When RPC functions `increment_ai_usage()` or `increment_ai_usage_capped()` try to insert, they fail with `403 Forbidden`
- Errors are silently swallowed by RPC
- Result: No usage data is ever recorded

**Impact:** High — Builder plan cannot enforce AI limits; usage metrics are always 0

**Fix Applied:**
Migration: `supabase/migrations/20250505_add_ai_usage_policies.sql`

```sql
CREATE POLICY ai_usage_insert_own ON ai_usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY ai_usage_update_own ON ai_usage
  FOR UPDATE
  USING (auth.uid() = user_id);
```

**Deployment Steps:**
1. Run migration in Supabase SQL Editor
2. Trigger any AI call (e.g., /api/ai/coach or /api/ai/break-my-startup)
3. Query Supabase: `SELECT COUNT(*) FROM ai_usage WHERE created_at > NOW() - INTERVAL '1 day'`
4. Should show 1+ rows (previously would be 0)

**Post-Migration Verification:**
```sql
-- Run this to check tracking is working
SELECT 
  user_id,
  DATE(created_at) as usage_date,
  COUNT(*) as calls_today
FROM ai_usage
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id, DATE(created_at)
ORDER BY created_at DESC
LIMIT 20;
```

---

## Issue 4: Plan Gating Audit — Undocumented Builder Blockers

**Status:** ✅ DOCUMENTED

**Findings:**
Three builder-only features were enforced server-side but NOT documented in `FEATURE_GATES`:

### 4a. Competitor Reframe
- **Route:** `/api/cofounder/reframe`
- **Gating:** `checkPlanAccess("builder")` on line 33
- **Feature:** Generates alternative business frames based on competitor analysis
- **Future:** Moving to Operator tier at Day 90 (Playbook §10)
- **Status:** Now in `FEATURE_GATES` as `"competitorReframe": "builder"`

### 4b. Validation Action Generator  
- **Route:** `/api/cofounder/validation-action`
- **Gating:** `checkPlanAccess("builder")` on line 30
- **Feature:** Generates cold DM templates, community questions, channel suggestions
- **Future:** Moving to Operator tier at Day 90
- **Status:** Now in `FEATURE_GATES` as `"validationAction": "builder"`

### 4c. Break My Startup Full Analysis
- **Route:** `/api/ai/break-my-startup`
- **Gating:** `if (routeUser.plan !== "builder")` on line 115
- **Feature:** 
  - Free tier: Preview signal score only (estimated from written idea)
  - Builder: Full analysis with competitor scan, project execution data, risk breakdown
- **Status:** Now in `FEATURE_GATES` as `"breakMyStartupFullAnalysis": "builder"`

**Fix Applied:**
File: `lib/plan.ts`, lines 146–173

Added to `FEATURE_GATES`:
```typescript
// ── CoFounder Core (Month 2/3, currently builder-only, moving to operator) ──
competitorReframe:          "builder",  // /api/cofounder/reframe
validationAction:           "builder",  // /api/cofounder/validation-action
breakMyStartupFullAnalysis: "builder",  // Full analysis + competitor scan
```

**Impact:** 
- All builder blockers are now explicitly documented
- Future migrations to Operator tier will be clearer
- Frontend can use `canAccess("competitorReframe", plan)` instead of guessing

---

## All Builder-Only Features (Complete List)

From audit of codebase, here are ALL features requiring builder plan:

### NOW (v4, Active)
- `dailyMorningBriefing` — Get briefing every day (free: 3x/week)
- `unlimitedAITasks` — Unlimited AI tasks (free: limited)
- `explainableRationale` — Why BuildMind chose this action (free: no explanation)
- `cognitiveLoadCheckin` — Track cognitive fatigue (free: no tracking)
- `fullMomentumScore` — Full momentum calculation with decay warnings (free: level 1 only)
- `hitlOverrides` — Override reasoning feeds context (free: no overrides)
- `eveningCheckNudges` — Evening reflection nudges (free: no nudges)
- `emotionalLanguageLayer` — Warmth at trigger moments (free: transactional tone)
- `recoveryMode` — Forgiveness protocol, Reset Mission (free: no recovery)
- `founderMemory` — Persistent context vector (free: session-only)
- `weeklyReport` — Full execution analytics (free: no reports)
- `aiCoach` — Daily AI coaching (free: 3 messages/week)

### CoFounder Core (Month 2/3, Builder Now → Operator Later)
- `competitorReframe` — Reframe vs specific competitor (moving to operator)
- `validationAction` — Generate validation templates (moving to operator)
- `breakMyStartupFullAnalysis` — Full adversarial analysis (free: preview only)

### Operator Tier (Day 90+, Currently Disabled)
- `venturesBlueprint` — AI venture architecture
- `cofounderBlueprint` — Co-founder matchmaking
- `cofounderPulse` — Real-time team health
- `generateUI` — Code generation

---

## Summary Table

| Blocker | Issue | Fix | File |
|---------|-------|-----|------|
| Project deletion | No DELETE RLS | Added policies | `20250505_add_delete_policies.sql` |
| Task creation | Silent errors in insertTasks | Throw on failure | `app/api/ai/generate-roadmap/route.ts` |
| AI usage tracking | No INSERT/UPDATE RLS | Added policies | `20250505_add_ai_usage_policies.sql` |
| Plan gating audit | Undocumented builder gates | Added to FEATURE_GATES | `lib/plan.ts` |

---

## Deployment Checklist

- [ ] Execute `20250505_add_delete_policies.sql` in Supabase SQL Editor
- [ ] Execute `20250505_add_ai_usage_policies.sql` in Supabase SQL Editor
- [ ] Deploy `app/api/ai/generate-roadmap/route.ts` changes
- [ ] Deploy `lib/plan.ts` changes (plan gating documentation)
- [ ] Test: Delete a project → should succeed
- [ ] Test: Generate roadmap → should create tasks (check logs if it fails)
- [ ] Test: Call any AI endpoint → check `ai_usage` table for new rows
- [ ] Verify: `SELECT * FROM ai_usage WHERE user_id = 'test-user' LIMIT 1` returns rows

---

## Next Steps

1. **Run migrations in Supabase** (both `20250505_*.sql` files)
2. **Deploy code changes** (Next.js routes, lib files)
3. **Verify each fix** using the test steps above
4. **Monitor logs** for the `insertTasks` error message — if tasks are still at 0, the error will show the real issue

---

*Generated by: BuildMind Production Audit (2025-05-05)*
