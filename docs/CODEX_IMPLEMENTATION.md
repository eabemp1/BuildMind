# BuildMind — Codex Implementation Guide

## How to use this document

When you have the zip file ready, open a Codex chat (ChatGPT with Code Interpreter or GitHub Copilot Workspace), attach the zip, and paste the prompts below one at a time. Confirm each step before moving to the next.

---

## STEP 0 — Upload the zip

Attach the buildmind_fullstack.zip file to your Codex session and paste:

```
I have uploaded the BuildMind full-stack project. It contains:
- frontend/ — Next.js 14 app with TypeScript and Tailwind
- backend/ — FastAPI Python app

Please unzip and confirm the directory structure before we start making changes.
```

---

## STEP 1 — Install the BuildMind Logo

```
In frontend/components/ui/BuildMindLogo.tsx I have a complete SVG logo component.
It is already implemented. Please confirm the file exists and that it exports:
1. BuildMindLogo as the default export
2. It accepts props: size (number), showWordmark (boolean), className (string)
3. It renders the brain + rocket + bar chart + wordmark SVG

Then update every page that currently uses a placeholder logo or "BM" initials to use <BuildMindLogo size={32} showWordmark /> in the header and <BuildMindLogo size={24} /> in the sidebar.
```

---

## STEP 2 — Implement the landing page

```
Replace frontend/app/page.tsx with the version I have provided.
It includes:
- BuildMindLogo in the nav and footer
- Real testimonials from Dmitrii, Adarsh, Vladi, and Mike (all verified founders from X)
- Teams section showing Solo / Founding Team / Company tiers
- Pricing with ALL buttons saying "Join Beta — Free" linking to /auth/signup
- No payment gates on the landing page — pricing is information only
- Counter animations for stats
- Full footer with Ghana credit

After replacing the file, run: npm run build
Fix any TypeScript errors that appear before continuing.
```

---

## STEP 3 — Implement the Dashboard

```
Replace frontend/app/dashboard/page.tsx with the version I have provided.
Key features to verify are working:
1. Warning banners appear when: userConversations === 0, stagnationDays > 14, tasksThisWeek < tasksLastWeek
2. MetricCard components render execution score, accountability rate, streak, user conversations
3. StageTimeline shows completed/active/future stages with correct colors
4. Today's action preview card is clickable and routes to /action
5. Accountability section shows commit history with done/skipped/pending status
6. Proven actions section shows 3 items with source citations
7. All data comes from the API: GET /api/v1/dashboard/buildmind

Wire up the API call using React Query. The hook should be:
useQuery({ queryKey: ['dashboard'], queryFn: () => apiFetch('/dashboard/buildmind') })
```

---

## STEP 4 — Implement Today's Action page

```
Replace frontend/app/action/page.tsx with the version I have provided.
Key features:
1. Light-mode card (background: #f8f7f4) inspired by the design reference image
2. "DO THIS NOW:" headline in bold
3. Copyable message box with clipboard icon — clicking copies to clipboard
4. Two buttons: "Copy message" and "Done" — Done changes to "Committed!" on click
5. Time Block section showing Focus / What You Do / Evening
6. Proven founder quotes with sources below the main card
7. "Skip — tell me why" button opens a text input to log the blocker

The action content comes from: POST /api/v1/ai/daily-action
Pass the current user's active project ID in the request body.
```

---

## STEP 5 — Implement AI Coach page

```
Replace frontend/app/(dashboard)/ai-coach/page.tsx with the version I have provided.
Key features:
1. Score strip at top showing execution score, accountability rate, streak, stage
2. Warning banners for stagnation, no user conversations, slowing down
3. Message thread with AI and user bubbles
4. Quick action buttons: Today's action, Break my startup, Weekly mirror
5. Mode detection: if message contains "break my startup" → call /ai/break-my-startup
6. If message contains "daily action" → call /ai/daily-action  
7. If message contains "weekly mirror" → call /ai/weekly-mirror
8. Otherwise → call /ai/coach
9. Every response shows the mode label ("BuildMind AI • reading your execution data")
10. Typing indicator while waiting for response

The score strip data comes from the same dashboard API call, cached in React Query.
```

---

## STEP 6 — Implement Break My Startup

```
Replace frontend/app/break-startup/page.tsx with the version I have provided.
Replace backend/app/routes/break_startup.py with the version I have provided.

Register the new route in backend/app/main.py:
from app.routes.break_startup import router as break_startup_router
app.include_router(break_startup_router, prefix="/api/v1")

Key features:
1. Warning card explaining this will be brutal — no encouragement
2. Single "Break my startup" button that triggers the analysis
3. Loading state shows what BuildMind is doing: searching web, analyzing data
4. Results show: 3 failure modes with evidence, competitor comparison table with success rates, your moat, closing statement
5. Each competitor shows: name, what they're doing better (tags), their success rate vs yours as side-by-side numbers
6. Web search is done server-side using DuckDuckGo — no API key needed
7. Run again button resets the state

Test the endpoint: POST /api/v1/ai/break-my-startup with { "projectId": 1 }
```

---

## STEP 7 — Teams foundation (future-proofed schema)

```
Add this to the database schema to future-proof for teams (do not build the UI yet, just add the models):

In backend/app/models/models.py add:

class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tier = Column(String(50), default="founding_team")  # solo / founding_team / company
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")

class TeamMember(Base):
    __tablename__ = "team_members"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(50), default="member")  # owner / admin / member
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    team = relationship("Team", back_populates="members")

Then run: alembic revision --autogenerate -m "add teams"
Then run: alembic upgrade head

This schema supports solo, founding team, and company tiers from day one without future migrations.
```

---

## STEP 8 — Logo in existing files

```
Find every file in frontend/ that contains any of these strings:
- "BM" inside a circle (as a text avatar for the logo)
- "BuildMini" (incorrect product name)
- className that renders a purple circle with text "BM"

Replace all of them with:
import { BuildMindLogo } from "@/components/ui/BuildMindLogo";
<BuildMindLogo size={32} showWordmark />

Also find and replace all instances of "BuildMini" text (including nav labels) with "AI Coach".
```

---

## STEP 9 — Environment setup

```
Create backend/.env from backend/.env.example if it does not exist.
Set these minimum values for local development:
DATABASE_URL=sqlite:///./buildmind.db
JWT_SECRET=dev-secret-change-in-production-minimum-32-chars
SECRET_KEY=dev-secret-change-in-production-minimum-32-chars
GROQ_API_KEY=your-groq-api-key-here
ENVIRONMENT=development
FRONTEND_ORIGINS=http://localhost:3000

Create frontend/.env.local with:
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1

Then run backend migrations:
cd backend
pip install -r requirements.txt
alembic upgrade head

Then start both servers:
Terminal 1: uvicorn app.main:app --reload
Terminal 2: cd frontend && npm install && npm run dev
```

---

## STEP 10 — Final verification

```
Run these checks after all steps are complete:

1. Frontend builds without errors: cd frontend && npm run build
2. Backend health check: curl http://localhost:8000/health
3. Landing page loads at http://localhost:3000 with the BuildMind logo visible
4. Dashboard loads at http://localhost:3000/dashboard
5. Today's Action page loads at http://localhost:3000/action with the white card design
6. Break My Startup page loads and the analysis button triggers a real API call
7. Logo appears correctly in sidebar and navbar on all pages
8. All "Get Started" and "Join Beta" buttons route to /auth/signup
9. No pricing gates exist — all CTA buttons say "Join Beta — Free"
10. The sidebar nav item says "AI Coach" not "BuildMini"

Report any errors with the full error message and the file name.
```

---

## Common errors and fixes

### "Module not found: BuildMindLogo"
The import path should be: `@/components/ui/BuildMindLogo`
Make sure the file exists at `frontend/components/ui/BuildMindLogo.tsx`

### "Cannot find module 'app.routes.break_startup'"
Make sure the file is at `backend/app/routes/break_startup.py` and the import in `main.py` matches exactly.

### TypeScript errors on SVG props
Add `// @ts-ignore` above the SVG line or add `declare module "*.svg"` to your next-env.d.ts

### Alembic migration fails
Run: `alembic stamp head` then `alembic revision --autogenerate -m "rebuild"` then `alembic upgrade head`

### CORS errors from frontend to backend
Check that FRONTEND_ORIGINS in backend/.env includes `http://localhost:3000`
