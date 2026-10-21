"use client";

/**
 * components/tour/ProductTour.tsx - first-run product tour.
 *
 * A spotlight tour over the real interface: it dims the page, cuts a rounded hole
 * around the element a step is about, and puts a card beside it (a bottom sheet on
 * phones). Steps and placement maths live in lib/tour/tour.ts and are unit tested.
 *
 * Behaviour that matters:
 *  - Resumable and cross-device: state lives in localStorage and in the account
 *    (user_behavior_state "tour_state"), so a finished or skipped tour never returns.
 *  - First-timers only: auto-starts once on /today when no state exists and no task
 *    has been completed yet. Anyone can start it again from the command palette
 *    (it listens for the "bm:start-tour" window event).
 *  - Never traps people: Esc skips, the page behind is inert to clicks while it runs,
 *    and a missing or hidden target (collapsed sidebar on a phone) falls back to a
 *    centred card instead of pointing at nothing.
 *  - Accessible: role="dialog", focus moves to the primary button, Tab stays inside the
 *    card, arrow keys move between steps, and reduced-motion turns the animation off.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";
import {
  TOUR_BEHAVIOR_KEY, TOUR_STEPS, TOUR_STORAGE_KEY,
  mergeTourState, nextState, padBox, parseTourState, placePopover, shouldAutoStart,
  type Box, type TourState,
} from "@/lib/tour/tour";

export const START_TOUR_EVENT = "bm:start-tour";
const PAD = 8;
const Z = 9000;

function readLocal(): TourState | null {
  try { return parseTourState(storage.get(TOUR_STORAGE_KEY)); } catch { return null; }
}
function saveState(s: TourState) {
  try { storage.set(TOUR_STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
  void persistBehaviorState({ [TOUR_BEHAVIOR_KEY]: s });
}

function visibleBox(target: string | undefined): { el: HTMLElement; box: Box } | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  if (r.width < 4 || r.height < 4 || style.visibility === "hidden" || style.display === "none") return null;
  return { el, box: { top: r.top, left: r.left, width: r.width, height: r.height } };
}

export default function ProductTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<TourState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<Box | null>(null);
  const [vp, setVp] = useState({ width: 1024, height: 768 });
  const [popSize, setPopSize] = useState({ width: 360, height: 220 });
  const popRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const reduceMotion = useRef(false);

  const active = state?.status === "active";
  const step = TOUR_STEPS[Math.min(state?.step ?? 0, TOUR_STEPS.length - 1)];
  const isMobile = vp.width < 640;

  // ── Load persisted state (device + account) ───────────────────────────────
  useEffect(() => {
    reduceMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let alive = true;
    const local = readLocal();
    setState(local);
    fetchBehaviorState<Record<string, unknown>>([TOUR_BEHAVIOR_KEY]).then((v) => {
      if (!alive) return;
      const merged = mergeTourState(local, parseTourState(v[TOUR_BEHAVIOR_KEY]));
      setState(merged);
      if (merged && merged !== local) { try { storage.set(TOUR_STORAGE_KEY, JSON.stringify(merged)); } catch { /* ignore */ } }
      setLoaded(true);
    }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const update = useCallback((action: Parameters<typeof nextState>[1]) => {
    setState((prev) => { const n = nextState(prev, action); saveState(n); return n; });
  }, []);

  // ── Start: auto for first-timers, or on request ───────────────────────────
  useEffect(() => {
    const onStart = () => setState(() => { const n = nextState(null, "start"); saveState(n); return n; });
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const firstTaskDone = (() => { try { return Boolean(storage.get("bm_first_task_completed_tracked")); } catch { return false; } })();
    if (!shouldAutoStart(state, { firstTaskDone, pathname: pathname ?? "" })) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      // Never open over another dialog (onboarding, paywall, welcome): wait, then give up quietly.
      const blocked = document.querySelector('[role="dialog"]:not([data-tour-ui])');
      if (!blocked && document.querySelector('[data-tour="today-task"]')) {
        window.clearInterval(timer);
        setState((prev) => { if (prev) return prev; const n = nextState(null, "start"); saveState(n); return n; });
      } else if (tries > 20) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loaded, state, pathname]);

  // ── Navigate to the step's page ───────────────────────────────────────────
  useEffect(() => {
    if (active && step && pathname !== step.route) router.push(step.route);
  }, [active, step, pathname, router]);

  // ── Track the target (scroll, resize, layout shifts) ──────────────────────
  useEffect(() => {
    if (!active || !step || pathname !== step.route) { setTarget(null); return; }
    let raf = 0, scrolled = false, waited = 0, last = "";
    const started = performance.now();
    const tick = () => {
      setVp((v) => (v.width === window.innerWidth && v.height === window.innerHeight ? v : { width: window.innerWidth, height: window.innerHeight }));
      const found = visibleBox(step.target);
      if (found) {
        if (!scrolled) {
          scrolled = true;
          const mobile = window.innerWidth < 640;
          found.el.style.scrollMarginTop = mobile ? "72px" : "96px";
          found.el.scrollIntoView({ block: mobile ? "start" : "center", inline: "nearest", behavior: reduceMotion.current ? "auto" : "smooth" });
        }
        const key = `${Math.round(found.box.top)}|${Math.round(found.box.left)}|${Math.round(found.box.width)}|${Math.round(found.box.height)}`;
        if (key !== last) { last = key; setTarget(found.box); }
      } else {
        waited = performance.now() - started;
        if (waited > 2500 && last !== "none") { last = "none"; setTarget(null); } // give up: centred card
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, step, pathname]);

  // ── Measure the card, then focus its primary action ───────────────────────
  useLayoutEffect(() => {
    if (!active || !popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    setPopSize((p) => (Math.abs(p.width - r.width) < 1 && Math.abs(p.height - r.height) < 1 ? p : { width: r.width, height: r.height }));
  }, [active, state?.step, target, isMobile]);
  useEffect(() => { if (active) primaryRef.current?.focus({ preventScroll: true }); }, [active, state?.step]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); update("skip"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); update("next"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); update("back"); }
      else if (e.key === "Tab" && popRef.current) {
        const f = Array.from(popRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!popRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, update]);

  const placement = useMemo(() => {
    if (!target || isMobile) return null;
    return placePopover(padBox(target, PAD, vp), popSize, vp, step?.placement);
  }, [target, isMobile, popSize, vp, step]);

  if (!active || !step || typeof document === "undefined") return null;

  const total = TOUR_STEPS.length;
  const idx = state?.step ?? 0;
  const isFirst = idx === 0, isLast = idx === total - 1;
  const hole = target ? padBox(target, PAD, vp) : null;
  const ease = reduceMotion.current ? "none" : "all 220ms cubic-bezier(.2,.7,.2,1)";

  // Card position: beside the target, a bottom sheet on phones, otherwise centred.
  const cardStyle: React.CSSProperties = isMobile
    ? { left: 8, right: 8, bottom: "calc(8px + env(safe-area-inset-bottom, 0px))", width: "auto" }
    : placement
      ? { top: placement.top, left: placement.left, width: 360 }
      : { top: Math.max(12, (vp.height - popSize.height) / 2), left: Math.max(12, (vp.width - 380) / 2), width: Math.min(380, vp.width - 24) };

  return createPortal(
    <div data-tour-ui style={{ position: "fixed", inset: 0, zIndex: Z }}>
      {/* Dimmer with a rounded cut-out; swallows clicks so the page behind cannot be hit mid-tour. */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, display: "block" }} aria-hidden="true">
        <defs>
          <mask id="bm-tour-mask">
            <rect width="100%" height="100%" fill="#fff" />
            {hole && <rect x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx={10} fill="#000" style={{ transition: ease }} />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(8,9,12,0.62)" mask="url(#bm-tour-mask)" style={{ pointerEvents: "auto" }} />
        {hole && <rect x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx={10} fill="none" stroke="var(--bm-accent)" strokeWidth={1.5} style={{ transition: ease, pointerEvents: "none" }} />}
      </svg>

      <div
        ref={popRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bm-tour-title"
        aria-describedby="bm-tour-body"
        data-tour-ui
        style={{
          position: "fixed", ...cardStyle, maxWidth: "calc(100vw - 16px)", boxSizing: "border-box",
          background: "var(--bm-bg2)", border: "1px solid var(--bm-border2)", borderRadius: 10,
          padding: "16px 16px 14px", color: "var(--bm-text)", transition: ease, fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--bm-accent)" }}>{step.eyebrow}</span>
          <span style={{ fontSize: 11, color: "var(--bm-text4)", fontVariantNumeric: "tabular-nums" }}>{idx + 1} of {total}</span>
        </div>

        <div id="bm-tour-title" style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.3, marginBottom: 6 }}>{step.title}</div>
        <p id="bm-tour-body" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--bm-text2)" }}>{step.body}</p>
        {step.tip && <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--bm-text3)", borderLeft: "2px solid var(--bm-border2)", paddingLeft: 10 }}>{step.tip}</p>}

        <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={idx + 1} aria-label="Tour progress" style={{ display: "flex", gap: 3, margin: "14px 0 12px" }}>
          {TOUR_STEPS.map((s, i) => <span key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= idx ? "var(--bm-accent)" : "var(--bm-border2)", transition: ease }} />)}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isLast && <button type="button" onClick={() => update("skip")} style={btn("ghost")}>Skip tour</button>}
          <span style={{ flex: 1 }} />
          {!isFirst && <button type="button" onClick={() => update("back")} style={btn("secondary")}>Back</button>}
          <button ref={primaryRef} type="button" onClick={() => update(isLast ? "finish" : "next")} style={btn("primary")}>
            {isFirst ? "Start the tour" : isLast ? "Start my day" : "Next"}
          </button>
        </div>
      </div>

      <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{`Step ${idx + 1} of ${total}: ${step.title}`}</div>
    </div>,
    document.body,
  );
}

function btn(kind: "primary" | "secondary" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = { height: 34, padding: "0 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", minWidth: 44 };
  if (kind === "primary") return { ...base, background: "var(--bm-accent)", color: "var(--bm-bg)", border: "1px solid var(--bm-accent)" };
  if (kind === "secondary") return { ...base, background: "transparent", color: "var(--bm-text2)", border: "1px solid var(--bm-border2)" };
  return { ...base, padding: "0 6px", background: "transparent", color: "var(--bm-text3)", border: "1px solid transparent", fontWeight: 500 };
}
