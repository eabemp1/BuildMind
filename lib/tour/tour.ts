/**
 * lib/tour/tour.ts - the first-run product tour, as data plus pure helpers.
 *
 * Everything here is pure so it can be tested without a browser: the step list, the
 * persisted state machine, and the popover placement maths. The component
 * (components/tour/ProductTour.tsx) only renders and measures.
 */

export type Placement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  id: string;
  /** Route the step lives on. The tour navigates there first. */
  route: string;
  /** data-tour value of the element to spotlight. Missing/hidden target => centred card. */
  target?: string;
  eyebrow: string;
  title: string;
  body: string;
  /** One concrete thing to try - shown as a quiet line under the body. */
  tip?: string;
  placement?: Placement;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    route: "/today",
    eyebrow: "Welcome",
    title: "BuildMind decides what you do next",
    body: "Most founders lose weeks choosing what to work on. BuildMind picks one move a day from your real startup context, so you spend the time doing it. This tour takes about a minute.",
    tip: "Press Esc any time to leave. You can restart it from the command palette.",
  },
  {
    id: "task",
    route: "/today",
    target: "today-task",
    eyebrow: "Today",
    title: "One task, not a list",
    body: "This is the single most useful thing you can do today, sized to fit it. It adapts to the kind of day it is: a build day looks different from an outreach day.",
    tip: "It is written in your product's own terms. If it is vague, that is a bug, so tell the coach.",
    placement: "bottom",
  },
  {
    id: "why",
    route: "/today",
    target: "today-why",
    eyebrow: "Today",
    title: "See why before you commit",
    body: "Every recommendation shows its reasoning and the evidence it expects to produce. When BuildMind is unsure, it says so and asks for evidence instead of pretending.",
    placement: "bottom",
  },
  {
    id: "start",
    route: "/today",
    target: "today-start",
    eyebrow: "Today",
    title: "Start a focus session",
    body: "Start the timer when you begin. Finishing it takes you straight to a short check-in, and what you report shapes tomorrow's task.",
    placement: "top",
  },
  {
    id: "coach",
    route: "/today",
    target: "nav-ai-coach",
    eyebrow: "Intelligence",
    title: "A coach that has read your project",
    body: "Ask about pricing, a stuck launch or a hard message. It answers from your actual project data, and you can open it beside any page without losing your place.",
    tip: "Shortcut: Ctrl+J opens the coach next to what you are doing.",
    placement: "right",
  },
  {
    id: "break",
    route: "/today",
    target: "nav-break-my-startup",
    eyebrow: "Intelligence",
    title: "Stress-test the idea",
    body: "Break My Startup attacks your idea, scans your site and real competitors, and turns each weakness into a step you can act on. Run it before you build more.",
    placement: "right",
  },
  {
    id: "radar",
    route: "/radar",
    target: "radar-header",
    eyebrow: "Radar",
    title: "Opportunities that fit you",
    body: "Paste an event, grant, accelerator or a person worth meeting. Radar sorts out what it is, scores fit against your startup, and turns the good ones into tasks and calendar entries.",
    placement: "bottom",
  },
  {
    id: "progress",
    route: "/today",
    target: "nav-progress",
    eyebrow: "Progress",
    title: "Your week against your own pace",
    body: "Progress tracks finished actions, streaks and your Ghost Race: this week against your recent average, so the only competition is your past self.",
    placement: "right",
  },
  {
    id: "finish",
    route: "/today",
    eyebrow: "You are set",
    title: "Do today's task",
    body: "The loop is simple: do the task, check in honestly, and let tomorrow adapt. The tour is always available from the command palette (Ctrl+K).",
  },
];

// ── Persisted state ─────────────────────────────────────────────────────────

export type TourStatus = "active" | "done" | "skipped";
export interface TourState { status: TourStatus; step: number; at: string; v: 1 }

export const TOUR_STORAGE_KEY = "bm_tour_v3";
export const TOUR_BEHAVIOR_KEY = "tour_state";

const clampStep = (n: unknown, total: number) => {
  const i = Math.floor(Number(n));
  return Number.isFinite(i) ? Math.min(Math.max(i, 0), total - 1) : 0;
};

export function parseTourState(raw: unknown, total = TOUR_STEPS.length): TourState | null {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.status !== "active" && o.status !== "done" && o.status !== "skipped") return null;
  return { status: o.status, step: clampStep(o.step, total), at: typeof o.at === "string" ? o.at : "", v: 1 };
}

/** Two sources (this device, the account): a finished/skipped tour on either wins; otherwise the newest. */
export function mergeTourState(a: TourState | null, b: TourState | null): TourState | null {
  if (!a || !b) return a ?? b;
  const finished = [a, b].find((s) => s.status !== "active");
  if (finished) return finished;
  return (a.at || "") >= (b.at || "") ? a : b;
}

/** First-timers only: no stored state, and no completed first task yet. */
export function shouldAutoStart(state: TourState | null, opts: { firstTaskDone: boolean; pathname: string; disabled?: boolean }): boolean {
  if (opts.disabled || state) return false;
  if (opts.firstTaskDone) return false;
  return opts.pathname === "/today";
}

export function nextState(state: TourState | null, action: "start" | "next" | "back" | "skip" | "finish", total = TOUR_STEPS.length, now = new Date()): TourState {
  const at = now.toISOString();
  const step = state?.step ?? 0;
  switch (action) {
    case "start": return { status: "active", step: 0, at, v: 1 };
    case "next": return step + 1 >= total ? { status: "done", step: total - 1, at, v: 1 } : { status: "active", step: step + 1, at, v: 1 };
    case "back": return { status: "active", step: Math.max(0, step - 1), at, v: 1 };
    case "skip": return { status: "skipped", step, at, v: 1 };
    case "finish": return { status: "done", step: total - 1, at, v: 1 };
  }
}

// ── Placement ───────────────────────────────────────────────────────────────

export interface Box { top: number; left: number; width: number; height: number }

export const POPOVER_GAP = 14;
export const VIEWPORT_MARGIN = 12;

/**
 * Pick where to put a popover of `size` next to `target`. Tries the preferred side, then
 * the others, and uses the first that fits entirely inside the viewport. If none fit
 * (small screen, tall target) it returns null and the caller centres the card / uses a sheet.
 */
export function placePopover(target: Box, size: { width: number; height: number }, viewport: { width: number; height: number }, preferred: Placement = "bottom"): { top: number; left: number; side: Placement } | null {
  const order: Placement[] = [preferred, ...(["bottom", "top", "right", "left"] as Placement[]).filter((p) => p !== preferred)];
  const m = VIEWPORT_MARGIN;
  const clampX = (x: number) => Math.min(Math.max(x, m), viewport.width - size.width - m);
  const clampY = (y: number) => Math.min(Math.max(y, m), viewport.height - size.height - m);
  for (const side of order) {
    let top = 0, left = 0, fits = false;
    if (side === "bottom") { top = target.top + target.height + POPOVER_GAP; left = clampX(target.left + target.width / 2 - size.width / 2); fits = top + size.height <= viewport.height - m; }
    if (side === "top") { top = target.top - POPOVER_GAP - size.height; left = clampX(target.left + target.width / 2 - size.width / 2); fits = top >= m; }
    if (side === "right") { left = target.left + target.width + POPOVER_GAP; top = clampY(target.top + target.height / 2 - size.height / 2); fits = left + size.width <= viewport.width - m; }
    if (side === "left") { left = target.left - POPOVER_GAP - size.width; top = clampY(target.top + target.height / 2 - size.height / 2); fits = left >= m; }
    if (fits) return { top, left, side };
  }
  return null;
}

/** Grow a rect by `pad` and keep it on screen (the spotlight cut-out). */
export function padBox(b: Box, pad: number, viewport: { width: number; height: number }): Box {
  const top = Math.max(0, b.top - pad), left = Math.max(0, b.left - pad);
  const right = Math.min(viewport.width, b.left + b.width + pad), bottom = Math.min(viewport.height, b.top + b.height + pad);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
