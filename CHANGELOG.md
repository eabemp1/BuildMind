# BuildMind Changelog

## v6.3 — Code cleanup (2026-05-03)

### lib/api.ts rewritten
Removed ~600 lines of dead FastAPI-era axios calls. The file now contains only:
- localStorage helpers (token, project ID, tour, onboarding flags)
- Shared TypeScript types used across the app
- Thin `fetch` wrappers for the 5 internal Next.js routes that client pages actually call

### lib/api/morning-briefing — FREE_BRIEFING_DAYS fixed
`FREE_BRIEFING_DAYS` was `Set([1, 4])` (Mon + Thu) but Playbook §6.1 specifies
Mon/Wed/Fri. Corrected to `Set([1, 3, 5])`.

### Landing page cut to 5 sections
Removed "A Day With BuildMind" timeline section (redundant with hero) and
"How It Works" 3-step section (content folded into hero copy). Testimonials
merged into the Pricing section. Nav updated to match.

---

## v6.2 — Plan model alignment (2026-04-27)

- Collapsed to 2 active plan tiers: `free` | `builder` (Playbook §11)
- Morning briefing free-tier gate fixed: Mon/Wed/Fri for free, daily for builder
- All 10 "Now" features from Playbook §5.3 confirmed present in codebase
- PLAYBOOK_TIMING warnings added to 4 routes that exist ahead of their unlock date

## v6.1 — Monetisation alignment (2026-04-27)

- `lib/plan.ts` rewritten to match Playbook v4 §6 tier model
- Plan guard tier corrections across cofounder, ventures, and AI routes
- `PLAN_PAYWALL_MOMENTS` wired with exact Playbook §6.2 copy

## v6 — Security & reliability fixes (2026-04-27)

- Server-side plan guards added to 4 routes that relied on client-side checks only
- `.env.example` documents SQLite dev-only warning
- `runtime.py` section map added

## v5 — Cleanup & hardening

- `/overview` route collision resolved (removed standalone page, canonical is dashboard route)
- Dead duplicate components removed (`sidebar.tsx`, `topbar.tsx`)
- `backend/` and `static/` directories removed
- Docker Compose `context` path fixed
- `_ensure_runtime_schema()` removed; schema managed via migrations only
