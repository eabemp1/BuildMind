# BuildMind Codex Implementation Guide — v2

## What changed from v1

**Two critical fixes:**

1. **Real data everywhere.** The old pages had hardcoded values — score 74, streak 6, "Emma Bem", "Adarsh Kumar". Every page now fetches from the API using the logged-in user's JWT token. Different users see different data.

2. **Real logo.** The PNG file you designed is now in `frontend/public/logo.png` and loaded via `<Image src="/logo.png" />`. No more SVG approximation.

---

## How to give this to Codex

Zip your existing project. Zip this package. Open Codex (ChatGPT with Code Interpreter or GitHub Copilot Workspace). Upload both. Then paste:

```
I have uploaded two zip files:
1. My existing BuildMind project
2. buildmind_v2.zip — corrections and improvements

For buildmind_v2.zip, please:
1. Unzip it and list all files
2. For each file, replace or add it in my existing project at the same path
3. Pay special attention to frontend/public/logo.png — this must be copied to my project's public folder
4. Confirm each file was placed correctly before continuing

Start with Step 1.
```

---

## File-by-file explanation

### `frontend/public/logo.png`
**The actual BuildMind logo PNG.** Must be in the `public/` folder of your Next.js project. Do not rename it.

### `frontend/components/ui/BuildMindLogo.tsx`
Uses `<Image src="/logo.png" />` from Next.js — not an SVG. Replace the old version entirely.

**After replacing, find every component in your project that renders a logo and update it:**
```tsx
// BEFORE (old SVG version):
<BuildMindLogo size={32} />  // still works — same props

// The component now uses the real PNG. No other changes needed.
```

### `frontend/lib/api.ts`
The complete API layer. Every page uses this. Key functions:
- `getToken()` / `setToken()` / `clearToken()` — JWT management
- `apiFetch()` — all API calls with auth header
- `getDashboard()` — real dashboard data for logged-in user
- `getProjects()` — logged-in user's projects only
- `aiCoach()` / `aiDailyAction()` / `aiBreakMyStartup()` / `aiWeeklyMirror()` — AI with real project ID

### `frontend/hooks/useData.ts`
Custom React hooks that fetch real data:
- `useCurrentUser()` — logged-in user's profile
- `useDashboard()` — execution score, streak, weekly progress (real numbers)
- `useProjects()` — user's projects, auto-selects active one
- `useAccountabilityStats(project)` — calculated from real task completion
- `useWarnings(dashboard, project)` — generated from real data patterns

### `frontend/components/layout/Sidebar.tsx`
Shows the logged-in user's real name and initials. Has a sign out button. Uses `useCurrentUser()`.

### `frontend/app/dashboard/page.tsx`
**Zero hardcoded values.** Everything comes from:
- `useDashboard()` → execution score, streak, weekly tasks
- `useProjects()` → active project, stage, milestones, tasks
- `useAccountabilityStats()` → real accountability rate
- `useWarnings()` → warnings based on their actual data
- `aiDailyAction()` → action generated from their real project data

### `frontend/app/action/page.tsx`
Calls `aiDailyAction(activeProject.id)` — the backend reads the user's database records and generates a specific action. Falls back to their first pending task if AI is unavailable.

### `frontend/app/coach/page.tsx`
The opening greeting is built from real dashboard numbers. Every question sent calls the AI with the user's actual project ID — the backend injects their real execution data into the system prompt.

---

## Step-by-step Codex prompts

### Step 1 — Copy the logo
```
In my project, create the folder frontend/public/ if it does not exist.
Copy the file logo.png from buildmind_v2/frontend/public/logo.png into frontend/public/logo.png.
Confirm it is there.
```

### Step 2 — Replace the logo component
```
Replace frontend/components/ui/BuildMindLogo.tsx with the version from buildmind_v2.
The new version uses <Image src="/logo.png" /> instead of an SVG.
After replacing, search my project for any file that imports BuildMindLogo and confirm the import path still works.
```

### Step 3 — Replace the API layer
```
Replace frontend/lib/api.ts with the version from buildmind_v2.
This file defines all API calls and TypeScript types.
After replacing, check for any import errors in files that use the old api.ts.
Fix any broken imports.
```

### Step 4 — Add the data hooks
```
Create the file frontend/hooks/useData.ts from buildmind_v2/frontend/hooks/useData.ts.
This file exports: useCurrentUser, useDashboard, useProjects, useAccountabilityStats, useWarnings.
These hooks fetch real user data from the API.
```

### Step 5 — Replace the Sidebar
```
Replace frontend/components/layout/Sidebar.tsx (or wherever the sidebar is defined in my project) with buildmind_v2/frontend/components/layout/Sidebar.tsx.
The new sidebar:
- Shows the logged-in user's real name from the API
- Has a sign out button that clears the JWT token
- Uses the real logo PNG via BuildMindLogo component
```

### Step 6 — Replace the Dashboard page
```
Replace frontend/app/(dashboard)/dashboard/page.tsx (or frontend/app/dashboard/page.tsx) with buildmind_v2/frontend/app/dashboard/page.tsx.

Key things to verify after replacing:
1. The page uses useDashboard() and useProjects() hooks — not hardcoded values
2. The metric cards show numbers from the API: execution_score, execution_streak, weekly_progress
3. The stage timeline uses activeProject.startup_stage — not a hardcoded "MVP"
4. The today's action card calls aiDailyAction(activeProject.id)
5. The pending tasks list maps over real tasks from the database
6. Warnings are generated from useWarnings() based on real data

If there are TypeScript errors, fix them. The most common issue is mismatched API response types.
```

### Step 7 — Replace Today's Action page
```
Replace frontend/app/(dashboard)/ai-coach/page.tsx (or wherever Today's Action renders) with buildmind_v2/frontend/app/action/page.tsx.

Verify:
1. Calls aiDailyAction(activeProject.id) — uses real project ID
2. Falls back to first pending task from real task list if AI is unavailable
3. Stage label comes from activeProject.startup_stage
4. Date shown is today's real date via new Date()
```

### Step 8 — Replace AI Coach page
```
Replace the AI coach chat page with buildmind_v2/frontend/app/coach/page.tsx.

Verify:
1. Opening greeting is generated from dashboard.execution_score and dashboard.execution_streak
2. Every message sent includes activeProject.id so the backend reads the right records
3. Score strip shows real values from useDashboard()
4. No hardcoded names or numbers anywhere in the component
```

### Step 9 — Final verification
```
Run: cd frontend && npm run build

Fix any TypeScript errors.

Then test manually:
1. Log in as one user — note their execution score
2. Log in as a different user — they should see their own score, not the first user's
3. The logo should show the BuildMind PNG image in the nav and sidebar
4. The dashboard stage should match that user's actual project stage
5. The AI coach opening message should reference that user's real numbers
6. Today's action should be different for different projects/stages
```

---

## Common errors

### "Cannot find module '@/hooks/useData'"
Make sure the hooks file is at `frontend/hooks/useData.ts` and your tsconfig.json has `"@/*": ["./*"]` in paths.

### Logo shows as broken image
Make sure `logo.png` is in `frontend/public/` — not in `frontend/app/` or `frontend/src/`.

### "hydration mismatch" error
This happens when `localStorage` is accessed during server render. The api.ts guards against this with `typeof window === "undefined"` checks. If you see this error, check any component that calls `getToken()` directly outside of an effect.

### TypeScript error on `res.data`
The API returns `{ success: true, data: {...} }`. If your existing code expects `res` directly, update it to `res.data`.

### User sees another user's data
This means the token is not being sent. Check that `apiFetch` is being used (not a raw `fetch`) and that the user is logged in.
