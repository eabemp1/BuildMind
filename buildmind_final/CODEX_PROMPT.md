# BuildMind — Complete Repository Replacement Prompt for Codex

## What this is
This zip contains the complete BuildMind repository with all frontend improvements applied on top of the live codebase. Drop the contents into the repo root and it replaces everything. The Python FastAPI backend is unchanged — only the frontend has been updated.

---

## Architecture (read this first)

```
BuildMind-main/
├── frontend/          ← Next.js 14 App Router (Vercel-deployed)
│   ├── app/           ← Pages and API routes
│   ├── components/    ← Sidebar, Topbar, AppShell
│   └── lib/           ← API clients, Supabase, queries
├── app/               ← Python FastAPI backend (separate service)
├── requirements.txt
└── render.yaml        ← Render.com deployment config
```

### Data flow
- **Auth + all data**: Supabase (projects, milestones, tasks, users) — frontend calls Supabase directly
- **AI features**: Next.js API routes (`/app/api/ai/`) call **Groq directly** using `GROQ_API_KEY`
- **Python backend**: Secondary AI fallback + scoring service; not required for basic operation

---

## Environment variables — where to put keys

### Frontend (`frontend/.env.local`) — PRIMARY
```env
# Supabase (required — auth + all data)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Groq AI (required — AI Coach, Break My Startup, Generate Roadmap all use this)
# Get key at: https://console.groq.com/keys
GROQ_API_KEY=gsk_your_groq_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Python backend URL (optional — used as AI fallback only)
NEXT_PUBLIC_API_BASE_URL=https://your-python-backend.onrender.com/api/v1
```

### Python backend (`.env` in repo root) — SECONDARY
```env
GROQ_API_KEY=gsk_your_groq_key_here
DATABASE_URL=sqlite:///./execution_v1.db
SECRET_KEY=change-this-in-production
JWT_SECRET=change-this-in-production
```

### On Vercel
Set these in the Vercel dashboard under **Project → Settings → Environment Variables**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `GROQ_MODEL` (optional, defaults to `llama-3.3-70b-versatile`)
- `NEXT_PUBLIC_API_BASE_URL` (optional)

**The AI features will be completely broken without `GROQ_API_KEY` set in Vercel.**

---

## What changed in the frontend

### New pages
| Route | Status | Description |
|---|---|---|
| `/today` | **NEW** | Daily action engine — the main retention loop |
| `/(dashboard)/break-my-startup` | **NEW** | Replaced old `/break-startup` path |
| `/(dashboard)/action` | Redirect → `/today` | Backward compat |

### Improved pages (same route, new implementation)
| Route | What changed |
|---|---|
| `/(dashboard)/layout.tsx` | Restored to real app-shell with sidebar. Added `AnimatePresence` + pathname-keyed 150ms fade transitions between routes |
| `/(dashboard)/dashboard` | Dark mode, accountability gap banner, stage journey with animated dots, stage roadmap panel, dark "Today's action" card |
| `/(dashboard)/projects` | Stage color coding, animated progress bars, stagger-in rows |
| `/(dashboard)/projects/[id]` | **Complete rewrite** — 4 tabs (Milestones, Tasks, Validation, Roadmap), ScoreRing animation, TaskCheckbox spring bounce, UpgradeNudge after 2 tasks, roadmap with upgrade CTA |
| `/(dashboard)/ai-coach` | Typing indicator, quick prompt chips, better message animations |
| `/(dashboard)/break-my-startup` | Animated survival ring, staggered kill/survive reasons, confirmation gate |
| `/(dashboard)/settings` | Toggle component with spring, AI usage bar, tab transitions |
| `/reports` | Weekly mirror gauge ring, accountability gap in mirror |
| `/auth/login` | Inline SVG neural-network logo mark |
| `/onboarding` | Inline SVG logo mark |
| `/upgrade` | Inline SVG logo mark, momentum banner |
| `/app/layout.tsx` | Full SEO: OG tags, JSON-LD, favicon pointing to `/public/logo/buildmind-favicon.svg` |

### New API routes
| Route | Purpose |
|---|---|
| `/app/api/ai/break-my-startup/route.ts` | **NEW** — calls Groq directly, falls back to Python backend |

### Updated components
| File | Change |
|---|---|
| `components/layout/sidebar.tsx` | Full redesign: inline SVG neural-network logo mark, Today + Break My Startup in nav, Framer Motion `layoutId` active indicator |
| `components/layout/app-shell.tsx` | 150ms `opacity/y` fade between routes using `AnimatePresence` + `key={pathname}` |

### Updated config
| File | Change |
|---|---|
| `lib/features.ts` | `analytics: true`, `breakMyStartup: true` enabled |

### New assets
| Path | What |
|---|---|
| `public/logo/buildmind-favicon.svg` | Neural-network favicon |
| `public/logo/buildmind-mark.svg` | 64px standalone mark |
| `public/logo/buildmind-og-image.svg` | 1200×630 OG image |
| `public/logo/buildmind-lockup-dark.svg` | Full lockup for dark bg |
| `public/logo/buildmind-lockup-light.svg` | Full lockup for light bg |

---

## Microanimations inventory (Framer Motion)

### `app/today/page.tsx` — full Duolingo-style set
- Stage pill: shimmer glow pulse on mount
- Action card: spring entrance `y:24→0, scale:0.97→1`, bezier `[0.22,1,0.36,1]`
- Copy button: spring scale pop + green flash on click
- Destination chips: **hidden until user copies**, stagger-appear with `delay: 0.05*i`
- Copy hint: fades in at 1.5s to nudge
- Done card: `scale:0.94→1, y:14→0` spring
- Fire emoji: `springIn` (scale 0 + rotate) then wiggle loop ×2
- Streak counter: counts up from 0 via `setInterval`
- Unlock button: wiggles at 2s if untapped (nudge)
- Stats: count up from 0 on mount

### `app/(dashboard)/projects/[id]/page.tsx` — most animated page
- `ScoreRing`: SVG `strokeDashoffset` animates over 1.2s
- `TaskCheckbox`: spring `scale:[1,1.35,0.9,1.1,1]` on check (Duolingo moment)
- `recentlyCompleted` row: flashes `rgba(74,222,128,0.06)` on task complete
- Milestone complete dot: scale pulse `[1,1.2,1]`
- `UpgradeNudge`: spring in after 2 tasks completed in session
- Roadmap items: `x:-8→0` stagger with `delay: i*0.08`
- Delete confirm: height-animated expand/collapse

### `app/(dashboard)/app-shell.tsx`
- 150ms `opacity/y` fade on every route change via `AnimatePresence` + `key={pathname}`

---

## Project detail page — 4 tabs

`app/(dashboard)/projects/[id]/page.tsx` (was 345 lines → now fully featured):

1. **Milestones** — grouped tasks under milestones, inline edit, per-milestone mini progress bar, green border glow on complete milestones
2. **Tasks** — flat list, inline note-taking, done badge spring animation, "All done 🎉" celebration
3. **Validation** — signal strength bar (X/9), strengths/weaknesses/suggestions grid, cross-sell to Break My Startup
4. **Roadmap** — stage-specific proven actions, step 1 highlighted with "Do this now →", full-roadmap upgrade CTA

### 3 paywall touch points (non-blocking)
- `UpgradeNudge` component: in-page, appears after 2 tasks completed in session
- Roadmap tab bottom: "Unlock full roadmap — $10/mo"
- Validation tab: "Break it →" cross-sell to Break My Startup

---

## Backend — what to tell Codex

The Python FastAPI backend (`/app/`) is **unchanged**. However, Codex should know:

### Existing AI routes in Python backend
- `POST /api/v1/ai/coach` — AI coaching with project context
- `POST /api/v1/ai/milestones` — Generate milestones from idea description
- `POST /api/v1/ai/break-my-startup` — (needs to be added, see below)

### Missing backend route — add this
The frontend's new `/app/api/ai/break-my-startup/route.ts` tries to fall back to `POST /api/v1/ai/break-my-startup` on the Python backend if Groq fails. Add this to `app/routes/ai.py`:

```python
@router.post("/ai/break-my-startup")
def break_my_startup_endpoint(payload: dict, db: Session = Depends(get_db)):
    project_id = payload.get("projectId")
    # Fetch project context and run analysis via Groq
    # Return: { success, data: { verdict, kill_reasons, survive_reasons, brutal_advice, survival_probability } }
    ...
```

### Groq model used
The backend uses `os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")`. The frontend's `_utils.ts` uses `process.env.GROQ_MODEL || "llama-3.1-70b-versatile"`. Set `GROQ_MODEL=llama-3.3-70b-versatile` in both envs for consistency.

### Database
SQLite by default. For production: set `DATABASE_URL=postgresql://...` in backend `.env`.

---

## Drop-in instructions for Codex

```bash
# 1. Unzip
unzip buildmind_complete.zip

# 2. Copy everything into your repo
cp -r buildmind_final/* your-repo/

# 3. Install frontend deps
cd your-repo/frontend
npm install  # or pnpm install

# 4. Set up environment
cp .env.example .env.local
# Edit .env.local with your actual keys

# 5. Run locally
npm run dev  # frontend on :3000

# 6. Python backend (separate terminal)
cd ..
pip install -r requirements.txt
uvicorn app.main:app --reload  # backend on :8000

# 7. Deploy frontend to Vercel
# Set all env vars in Vercel dashboard first, then:
vercel --prod
```

---

## Supabase schema requirements

The frontend expects these Supabase tables (already exist in the live project):
- `users` — user profiles
- `projects` — startup projects
- `milestones` — project milestones  
- `tasks` — tasks under milestones
- `ai_usage` — monthly AI usage tracking (columns: `user_id`, `month`, `count`)
- `notifications` — user notifications

The `ai_usage` table is needed for the 20/month AI usage limit. If it doesn't exist:
```sql
create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  month text not null,
  count integer not null default 0,
  unique(user_id, month)
);
```

---

## User flow

```
/ (Landing)
  ├── Try it now → /try (anonymous, no login)
  │     └── Stage + problem → action card + copy + destination chips
  │           └── "Create account" → /auth/signup → /onboarding → /today
  └── Login → /auth/login → /today

/today (authenticated — daily entry point, main retention loop)
  ├── Stage pill (shimmer animation)
  ├── Action card (dark, springs in from below)
  ├── Copy message → destination chips stagger in (Twitter, Indie Hackers, Reddit...)
  ├── ✓ Done → fire animation + streak count-up
  └── Unlock Next Step (wiggles at 2s) → /upgrade [PAYWALL]

/(dashboard)/* — all use sidebar + 150ms route transitions
  ├── /dashboard    — overview, metrics, accountability gap, stage roadmap
  ├── /projects     — list with animated rows
  ├── /projects/[id] — 4 tabs: milestones, tasks, validation, roadmap
  │     └── UpgradeNudge after 2 tasks [PAYWALL]
  ├── /ai-coach     — BuildMini chat with project context (uses GROQ_API_KEY)
  ├── /break-my-startup — honest failure analysis (uses GROQ_API_KEY)
  ├── /reports      — weekly mirror, accountability gap, AI assessment
  └── /settings     — profile, account, notifications, AI usage

/upgrade — $10/mo paywall
```
