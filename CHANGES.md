# BuildMind — Changes Applied

## v4 — Identity & Causality Loop (this zip)

### What's wired that wasn't before

**1. `/reflect` — first-class Reflect page**
- Outcome chips: Completed / Partly done / Got blocked / Learned something
- Blocked type selector: tech / money / time / people
- Freetext field with context-aware placeholder (changes based on outcome)
- Confidence slider 1–5 with labels (Lost → Unstoppable)
- Submits to `/api/ai/reflect-action` → gets personalised causality + next action
- Falls back to local generation if AI unavailable
- Writes to `localStorage.bm_last_reflect` + `bm_reflect_history` (30-entry log)
- Done state shows causality strip + next action preview
- Identity-reinforcing footer (streak-aware)

**2. `/api/ai/reflect-action` — AI causality engine**
- Takes outcome, note, confidence, stage, todayAction, streak
- Generates: `causality` ("because you said X → tomorrow is Y"), `nextAction`, `identityLine`
- If Supabase env present: reads project context, writes reflection to `reflections` table
- Graceful fallback — never breaks the user flow

**3. Sidebar — Reflect nav + notification dot**
- `/reflect` added to NAV between Today and Overview
- Uses `RefreshCw` icon
- Orange pulsing dot appears when `bm_reflect_pending === "true"` (i.e. after completing today's action)
- "NOW" badge replaces dot text when pending
- Dot clears when user opens Reflect page
- Tagline in logo area changed to "One decision. Already made."
- 10s polling interval + storage event listener keeps dot state live

**4. Today page — identity strip + causality strip**
- Identity strip above stage pill: streak-aware line that changes who you are
  - 0 days: "One decision. Already made."
  - 1-2 days: "Day N. Keep going."
  - 3-6 days: "You're someone who executes."
  - 7-13 days: "Most founders quit here. You didn't."
  - 14+ days: "You've outlasted 90% of founders who start."
- Causality strip below identity: reads `bm_last_reflect.causality` and shows
  "↺ Because you said X → today is Y" — only visible if reflection exists and action not yet done
- `handleDone()` now writes:
  - `bm_reflect_pending: "true"` → triggers sidebar dot
  - `bm_today_action` → pre-fills reflect page with today's action context
  - `bm_stage` → gives reflect API the stage for personalisation

### From v3 (preserved)
- 5-step onboarding fully preserved
- PaywallGate component preserved
- All CSS token system (light/dark mode)
- Startup Kit Generator (`/startup-kit`) — Builder plan
- Weekly Share Card (`/weekly-share`) — free for all plans
- ConsentLedger CTA throughout
- All 35 component/page token overrides

### What still needs real backend wiring
The causality is live-feeling now but `bm_last_reflect` is localStorage only.
Full personalisation path: reflect → Supabase `reflections` table → next `/api/ai/today-action`
call reads last reflection and generates a genuinely personalised action.
The `reflect-action` route already writes to Supabase if env vars are set — the
`today-action` route needs one additional query: `SELECT * FROM reflections WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
and pass it into the AI prompt. That's the $19/month feature.
