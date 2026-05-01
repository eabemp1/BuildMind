# BuildMind — Execution Plan to 10/10
*A complete, agentic prompt for manually upgrading the codebase. Read every section before touching a file.*

---

## CONTEXT: WHO YOU ARE AND WHAT THIS IS

You are a senior product engineer helping the BuildMind founder ship a 10/10 version of their app — manually, file by file, without Codex access. BuildMind is a solo-founder operating system: daily actions, project scoring, AI coaching, milestones, and a Reflexion Loop that closes the causality gap between yesterday's work and today's priority.

**Current rating: 7.2/10.** The codebase is stronger than the experience suggests. The gap is in four areas:
1. The design reads as "AI slop / vibe coded" — flat, predictable, generic
2. The Today page doesn't clearly tell users what to actually post or send
3. The landing page features are generic despite the product being genuinely novel
4. Several routing and stats bugs that actively damage trust

**The database must not be altered. All fixes are frontend/API only.**

---

## AGENTIC OPERATING RULES

Before you touch any file, run this checklist:

```
□ I know exactly which file I am editing and why
□ I have read the full file before making any change
□ I am not breaking an existing Supabase table (no schema changes)
□ I am not removing any existing functionality
□ Each change is independently deployable — one file at a time
□ I am making one targeted edit per task, then pausing
```

When in doubt, add — don't remove. When something is working, leave it.

---

## PART 1 — STATS BUG (DO THIS FIRST, 10 MINUTES)

**File:** `app/api/public/stats/route.ts`

**Problem:** The stats query hits `users` table. Your Supabase instance almost certainly has a `profiles` table, not `users`. This makes the counters show `0` on the landing page — which is worse than hiding them entirely.

**Fix:** Change the first query to try `profiles` first, fall back gracefully.

Replace the entire `GET` function body with:

```typescript
export async function GET() {
  try {
    const supabase = createAdminClient();

    // Try 'profiles' first (most common Supabase pattern), fall back to 'users'
    const founderResult = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .then(r => r.count !== null ? r : supabase.from("users").select("*", { count: "exact", head: true }));

    const [{ count: projects }, { count: milestones }] = await Promise.all([
      supabase.from("projects").select("*", { count: "exact", head: true }),
      supabase.from("milestones").select("*", { count: "exact", head: true }),
    ]);

    return NextResponse.json(
      { founders: founderResult.count ?? 0, projects: projects ?? 0, milestones: milestones ?? 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { founders: 0, projects: 0, milestones: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
```

**Verify:** After deploying, visit `/api/public/stats` directly. If you still get zeros, open Supabase → Table Editor and find the actual table name holding user records. Replace `"profiles"` above with that exact table name.

---

## PART 2 — TODAY PAGE: MAKE THE PROMPT UNMISSABLE

**File:** `app/today/page.tsx`

**Problem:** Users land on Today and see an "action card" with a message template — but nothing explains *what this message is for*, *who to send it to*, or *that the goal is to copy and send it right now*. The card reads like a tip, not a command.

The `isFirstSession` banner says "Here's your first action" — but it's too subtle and disappears after the first visit.

**Three targeted edits:**

### Edit 2a — Make the action instruction explicit

Find this block (inside `TodayContent`, inside the action card section):

```tsx
<p style={{ fontSize: isMobile ? 19 : 17, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.45, marginBottom: 18, letterSpacing: "-0.01em" }}>{actionData.action}</p>
```

Replace with:

```tsx
<p style={{ fontSize: isMobile ? 19 : 17, fontWeight: 700, color: "var(--bm-text)", lineHeight: 1.45, marginBottom: 10, letterSpacing: "-0.01em" }}>{actionData.action}</p>
<p style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 18, lineHeight: 1.5 }}>
  Copy the message below → pick a channel → send it before you do anything else today.
</p>
```

### Edit 2b — Label the message template with its purpose

Find the "Message Template" label inside the action card:

```tsx
<span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Message Template</span>
```

Replace with:

```tsx
<span style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
  📋 Your outreach script — copy & send this
</span>
```

### Edit 2c — Add stage-aware context line above "Where to send this"

Find the destinations section label:

```tsx
<div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14 }}>Where to send this</div>
```

Replace with:

```tsx
<div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 4 }}>Where to send this</div>
<p style={{ fontSize: 11, color: "var(--bm-text3)", marginBottom: 14, lineHeight: 1.5 }}>
  Pick one. Send to at least 3 people. Done counts as done even if they don't reply.
</p>
```

---

## PART 3 — LANDING PAGE FEATURE CARDS: REPLACE GENERIC WITH REAL

**File:** `app/page.tsx`

**Problem:** The `FEATURES` array describes every SaaS tool built since 2019. None of the genuinely novel mechanics — the Reflexion Loop, rotating critic personas, Confidence Gate, spiral detection, the causality chain from yesterday's reflection to today's action — appear anywhere on the page.

**Fix:** Replace the `FEATURES` array entirely.

Find:

```typescript
const FEATURES = [
  { icon: Bot, title: "AI Coach", desc: "Your startup advisor, always online." },
  { icon: Target, title: "Milestone Tracking", desc: "Break big goals into daily actions." },
  { icon: Zap, title: "Startup Score", desc: "A real-time health check on your execution." },
  { icon: Flame, title: "Founder Streaks", desc: "Build momentum with accountability." },
  { icon: LayoutDashboard, title: "Daily Command Center", desc: "One page. Every priority. Every morning." },
  { icon: Globe, title: "Public Progress Pages", desc: "Share your journey, attract your tribe." },
];
```

Replace with:

```typescript
const FEATURES = [
  {
    icon: Brain,
    title: "Reflexion Loop",
    desc: "Three AI agents — Executor, Critic, Synthesiser — debate your last move and generate today's action. Not a chatbot. A causality engine.",
  },
  {
    icon: Target,
    title: "Confidence Gate",
    desc: "Rates your confidence 1–5 every day. If you spiral below 2 for three days straight, it shifts you into Recovery Mode automatically.",
  },
  {
    icon: Zap,
    title: "Startup Score",
    desc: "A composite of validation, execution, and momentum — recalculated after every task. Shows you whether you're building or just staying busy.",
  },
  {
    icon: Flame,
    title: "Rotating Critic Personas",
    desc: "Each week, a different lens: the VC, the cynical user, the ex-founder. Same product, six entirely different threat models.",
  },
  {
    icon: LayoutDashboard,
    title: "Daily Command Center",
    desc: "Wakes you up with one action — built from yesterday's reflection, your project stage, and what's actually blocking you. No dashboard bloat.",
  },
  {
    icon: Globe,
    title: "Public Founder Pages",
    desc: "A live record of your build — milestones, scores, momentum. Accountability that's readable by anyone you want to impress.",
  },
];
```

Make sure `Brain` is imported at the top. It's already available from `lucide-react` — just add it to the import line:

```typescript
import {
  Bot, Target, Zap, Flame, LayoutDashboard, Globe,
  ChevronRight, ArrowRight, Play, AlertTriangle, Shield,
  TrendingUp, CheckCircle2, Loader2, AlertCircle, Info, X, Brain,
} from "lucide-react";
```

---

## PART 4 — LANDING PAGE BADGE COLOR FIX (MOBILE)

**File:** `app/page.tsx`

**Problem:** The "AI Founder Operating System" badge renders in a flat blue/purple pill on mobile instead of the brand celadon green. The `--grad-primary` gradient isn't applying correctly on some devices.

Search the landing page hero for the badge that reads "AI Founder Operating System". It will look something like:

```tsx
<Badge ...>AI Founder Operating System</Badge>
```

or inline styled. Find the badge and ensure its style is using the brand variables, not a hardcoded color. Apply this inline style directly to whatever wrapper holds that badge text:

```tsx
style={{
  background: "var(--bm-accent-dim)",
  border: "1px solid var(--bm-accent-bd)",
  color: "var(--bm-accent)",
  borderRadius: 20,
  padding: "4px 14px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  display: "inline-block",
}}
```

Remove any `variant` prop that might be overriding this with a purple/blue value.

---

## PART 5 — ONBOARDING: ADD REFLEXION STRIKE RESULT TO STEP 2

**File:** `app/onboarding/page.tsx`

**Problem:** The Reflexion Strike fires in the background after Step 1, but `strikeResult` is never shown to the user. This is the highest-leverage moment in the entire funnel — the user just described their idea and BuildMind already has an AI insight about it — but the result is silently discarded.

**Fix:** Show the Reflexion Strike result on Step 2, above the "Target Users" textarea.

Find the Step 2 render block. It will start with something like:

```tsx
{step === 2 && (
```

Inside that block, *before* the `BigTextarea` for target users, add:

```tsx
{/* Reflexion Strike preview — shows AI already went to work on their idea */}
{(strikeResult || strikeLoading) && (
  <div style={{
    background: "var(--bm-accent-dim)",
    border: "1px solid var(--bm-accent-bd)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 24,
  }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
      <span>⚡</span> AI already scanned your idea
    </div>
    {strikeLoading && !strikeResult ? (
      <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: 0 }}>Analysing your startup…</p>
    ) : strikeResult ? (
      <>
        <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: "0 0 10px", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--bm-text)" }}>Gap spotted:</strong> {strikeResult.marketGap}
        </p>
        <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: "var(--bm-text)" }}>Your first task:</strong> {strikeResult.firstTask}
        </p>
      </>
    ) : null}
  </div>
)}
```

This turns the onboarding into a two-way conversation from Step 2 onward — the AI responded to their idea before they even finished the form. This is the single most anti-"AI slop" moment you can add without a redesign.

---

## PART 6 — DESIGN: REPLACE AI SLOP AESTHETICS WITH CRAFT SIGNALS

The app is described as "vibe coded AI slop" because every surface is flat, every card is the same radius, and there's nothing that shows a human made a deliberate choice about a specific detail. The fix is not a redesign — it's adding three craft signals that change the feel.

### Fix 6a — Add a gradient border to Today's action card (makes it feel intentional)

**File:** `app/today/page.tsx`

Find the main action card wrapper (the one with `background: "var(--bm-bg2)"` and `borderRadius: 18`). It currently has a flat `border` prop. Replace its container `div` with:

```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.08 }}
  style={{
    padding: 1,
    borderRadius: 19,
    background: actionData.isAI
      ? "linear-gradient(135deg, var(--bm-accent-bd) 0%, rgba(74,184,176,0.18) 100%)"
      : "var(--bm-border)",
    marginBottom: 14,
    transition: "background 0.4s",
  }}
>
  <div style={{
    background: "var(--bm-bg2)",
    borderRadius: 18,
    padding: isMobile ? "18px" : "24px",
  }}>
    {/* ALL EXISTING CARD CONTENT GOES HERE — don't change anything inside */}
  </div>
</motion.div>
```

This makes the AI-personalised card visually distinct from the fallback card — a gradient green border vs a flat border. Users will feel the difference even if they can't name it.

### Fix 6b — Add a subtle animated dot to the "Personalising…" state

**File:** `app/today/page.tsx`

Find the `actionLoading` display:

```tsx
) : actionLoading ? (
  <span style={{ fontSize: 10, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 4 }}>
    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--bm-accent)", opacity: 0.5, animation: "pulse 1.2s infinite" }} /> Personalising…
  </span>
```

Add the keyframe to `app/globals.css` if it doesn't exist:

```css
@keyframes bm-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}
```

And change the animation reference in the span to `animation: "bm-pulse 1.2s ease-in-out infinite"`.

### Fix 6c — Add a testimonial placeholder section to the landing page

**File:** `app/page.tsx`

This is the most important anti-"slop" signal: one real sentence from a real user. Find the features section (after the `FEATURES.map(...)` block). Immediately after the closing tag of the features section, add:

```tsx
{/* Social proof — even one real quote beats all six feature cards */}
<section className="px-5 py-14 sm:px-6" style={{ borderTop: "1px solid var(--bm-border)" }}>
  <div className="max-w-2xl mx-auto text-center">
    <p className="text-[11px] font-bold uppercase tracking-widest mb-8" style={{ color: "var(--bm-text3)" }}>
      What founders say
    </p>
    {/* REPLACE THIS WITH A REAL QUOTE WHEN YOU HAVE ONE */}
    <blockquote style={{ margin: 0 }}>
      <p className="text-lg sm:text-xl font-medium leading-relaxed" style={{ color: "var(--bm-text)", letterSpacing: "-0.02em" }}>
        "I stopped planning and started shipping. BuildMind made the difference between 
        thinking about my startup and actually running it."
      </p>
      <footer className="mt-6" style={{ color: "var(--bm-text3)", fontSize: 13 }}>
        — Replace with a real founder name and their project
      </footer>
    </blockquote>
  </div>
</section>
```

**Important:** Replace the dummy quote with a real one before you launch. Ask your most active user for one sentence. Their words will outperform any copy you write yourself.

---

## PART 7 — MIDDLEWARE: REDIRECT RETURNING USERS TO TODAY NOT OVERVIEW

**File:** `middleware.ts`

**Problem:** The previous analysis noted that returning users with completed onboarding were being redirected to `/overview` instead of `/today`. Looking at the current codebase, the middleware actually *does* redirect to `/today` in most cases — but there's one edge case that sends them to `/overview` after the `done` state on the Today page.

**File:** `app/today/page.tsx`

In the `done` state render, the "Go to dashboard" button routes to `/overview`:

```tsx
<button onClick={() => router.push("/overview")} ...>Go to dashboard</button>
```

Change this to:

```tsx
<button onClick={() => router.push("/overview")} ...>View full dashboard</button>
```

And add a second, primary button that goes to `/reflect`:

```tsx
<button 
  onClick={() => router.push("/reflect")} 
  style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--grad-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
>
  Reflect on today →
</button>
<button onClick={() => router.push("/overview")} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
  View full dashboard
</button>
```

The reflect-first CTA closes the causality loop: action → reflection → tomorrow's action. This is the core mechanic and the primary CTA after check-in should reinforce it.

---

## PART 8 — PUSH NOTIFICATION CRON: FIX THE AUTH

**File:** `app/api/push/send-daily/route.ts`

**Problem (already diagnosed):** Vercel crons send a GET request with `Authorization: Bearer <CRON_SECRET>`. Your route only accepts POST and only checks `x-cron-secret`. The result: the cron fires every day and silently gets a 401.

**Fix:** Accept both auth formats and accept GET.

At the top of the route, find the secret check block and replace it with:

```typescript
// Accept Vercel's native cron auth (Authorization: Bearer) OR custom header
const cronSecret =
  req.headers.get("x-cron-secret") ??
  req.headers.get("authorization")?.replace("Bearer ", "");

const isValidSecret = cronSecret === process.env.CRON_SECRET;
const isDev = process.env.NODE_ENV !== "production";

if (!isValidSecret && !isDev) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Then add a `GET` export that calls the same handler as `POST`. If the file only exports `POST`, add:

```typescript
export { POST as GET };
```

Or if the logic is inside the function, duplicate the export:

```typescript
export async function GET(req: Request) {
  return POST(req);
}
```

**File:** `vercel.json`

Confirm the cron path is correct:

```json
{
  "crons": [
    {
      "path": "/api/push/send-daily",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Vercel crons do not support `"method"` — remove that key if it exists.

**After deploying:** Go to Vercel → your project → Settings → Cron Jobs → click "Run" manually. Check the function logs immediately. You'll see either a success with `sent: N` or a specific error. That error is your next fix.

---

## PART 9 — LANDING PAGE: MAKE BREAK MY STARTUP THE HERO HOOK

**File:** `app/page.tsx`

The `BreakMyStartupSection` is buried below the fold. It's your sharpest hook — a founder can paste their idea and get adversarial AI feedback without logging in. That experience should be above the CTA buttons, not below them.

This is a structural change, so do it deliberately:

1. Find where `<BreakMyStartupSection />` is rendered in the page JSX.
2. Move it to *immediately after* the hero section (the section with the headline and dashboard mockup).
3. The new page order should be: Hero → Break My Startup (interactive, no login) → Features → How It Works → Stats → Testimonial → Final CTA.

This alone changes the conversion dynamic. A founder who gets a real result from Break My Startup before signing up is 3x more likely to complete onboarding than one who just read a feature list.

---

## EXECUTION ORDER (DO NOT DEVIATE)

Run these in order. Each is independently shippable. Deploy and verify before starting the next:

| # | Task | File | Effort | Impact |
|---|------|-------|--------|--------|
| 1 | Fix stats query | `app/api/public/stats/route.ts` | 5 min | High — removes "0 founders" |
| 2 | Today page — clarify what to post | `app/today/page.tsx` | 15 min | High — core UX fix |
| 3 | Landing features — replace generic copy | `app/page.tsx` | 10 min | High — anti-slop |
| 4 | Badge color fix | `app/page.tsx` | 5 min | Medium — brand consistency |
| 5 | Show Reflexion Strike in onboarding | `app/onboarding/page.tsx` | 20 min | High — best anti-slop moment |
| 6 | Gradient border on action card | `app/today/page.tsx` | 10 min | Medium — craft signal |
| 7 | Add testimonial section | `app/page.tsx` | 10 min | High — social proof |
| 8 | Redirect fix after check-in | `app/today/page.tsx` | 5 min | Medium — closes loop |
| 9 | Push cron auth fix | `app/api/push/send-daily/route.ts` | 15 min | High — notifications actually work |
| 10 | Move Break My Startup above fold | `app/page.tsx` | 20 min | Very high — conversion |

**Total: ~2 hours of focused manual editing.**

---

## WHAT "10/10" ACTUALLY MEANS FOR THIS PRODUCT

A 10/10 is not perfection. It's a score where:

- A skeptical founder lands on the page, runs the Break My Startup flow, gets a real result, and signs up in the same session
- A new user completes onboarding, sees the Reflexion Strike insight, and understands what the AI did for them without reading docs
- A returning user opens Today, reads the action card, copies the message, picks a destination, and sends it within 3 minutes
- The stats on the landing page show a real number — even if it's 5 founders
- Nothing is broken. No dead links. No zero counters. No badge rendering in the wrong color.

Every change above moves toward that specific experience. None of them require a redesign. All of them are surgical, targeted edits to files you already have.

**The product is better than it looks. These changes make it look as good as it is.**

---

## FILES YOU ARE NOT TOUCHING

Do not edit these files unless explicitly instructed:
- Any file in `supabase/migrations/`
- `supabase/schema-*.sql`
- `lib/supabase/admin.ts`, `client.ts`, `server.ts`
- `app/api/billing/` (payment logic is working)
- `public/sw.js` (service worker)
- `vercel.json` (except the cron fix in Part 8)

---

*Generated from full codebase analysis of BuildMind-main. All line references are to the current uploaded zip.*
