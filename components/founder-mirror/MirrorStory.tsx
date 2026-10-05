"use client";

/**
 * MirrorStory — Founder Mirror as a slideshow.
 *
 * Reads the same mirror payload as the detail page and turns it into a short
 * story: cover, how well BuildMind knows you, your behavioral signature, the
 * beliefs it holds with the most confidence, skills, watch-outs, what is
 * shifting, where it may be wrong, the suggested next move, and a closing
 * slide. Slides with no data are skipped, nothing is invented.
 *
 * Controls: arrows / space / swipe / buttons, story-style progress bars,
 * autoplay with pause (off when the visitor prefers reduced motion).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, animate } from "framer-motion";
import {
  ArrowRight, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, TrendingDown, TrendingUp, Pencil, Layers, AlertTriangle, Compass, Sparkles,
} from "lucide-react";

export type StoryBelief = {
  belief: string; belief_key: string; why: string; evidence: string[]; confidence: number;
  trend: "strengthening" | "weakening" | "persistent" | "emerging"; contradictory_evidence: string[];
};
export type StorySkill = { id: string; label: string; level: number; progress: number; trend: "up" | "down" | "steady" | "new" };
export type StorySignal = { id: string; severity: string; title: string; summary: string; recommended_response: string };

export interface MirrorStoryProps {
  mirror: {
    beliefs: StoryBelief[];
    skills: StorySkill[];
    strengthening_patterns: string[];
    weakening_patterns: string[];
    may_be_wrong_about: string[];
    recent_changes: string[];
    signals: StorySignal[];
    decision: { top: { action: string; rationale: string; score: number } | null; alternatives: unknown[] };
    self_reported_accuracy: { sample_size: number; accuracy_pct: number | null; trend: string; summary: string };
    generated_at: string;
  };
  behavioral: {
    archetype: { name: string; tagline: string; strength: string; blindSpot: string; shadowBehavior: string } | null;
    signature_card: { dayCount: number; statLine: string; avoidanceZone: string | null; peakHour: string | null } | null;
    days_since_start: number;
  } | null;
  onOpenDetail: (target?: { beliefKey?: string; belief?: string; correct?: boolean }) => void;
}

const SLIDE_MS = 10000;
const EASE = [0.16, 1, 0.3, 1] as const;

const sevColor: Record<string, string> = {
  critical: "var(--bm-red)", high: "var(--bm-red)", medium: "var(--bm-amber)", low: "var(--bm-text3)",
};
const trendText: Record<StoryBelief["trend"], { text: string; color: string }> = {
  strengthening: { text: "Getting stronger", color: "var(--bm-green)" },
  weakening: { text: "Fading", color: "var(--bm-red)" },
  persistent: { text: "Holding steady", color: "var(--bm-intel)" },
  emerging: { text: "Just emerging", color: "var(--bm-text3)" },
};

type Slide = { key: string; accent: string; node: ReactNode };

// ── Small building blocks ────────────────────────────────────────────────────

function Reveal({ i = 0, children, className, style }: { i?: number; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y: 22, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, delay: 0.12 + i * 0.12, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Kicker({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "none", color, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 18, height: 1.5, background: color, display: "inline-block", borderRadius: 2 }} />
      {children}
    </div>
  );
}

function CountUp({ to, suffix = "", duration = 1.6 }: { to: number; suffix?: string; duration?: number }) {
  const [v, setV] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setV(to); return; }
    const c = animate(0, to, { duration, ease: EASE, onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to, duration, reduce]);
  return <>{v}{suffix}</>;
}

function Bar({ pct, color, delay = 0.4, height = 8 }: { pct: number; color: string; delay?: number; height?: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height, borderRadius: 999, background: "color-mix(in srgb, var(--bm-text) 10%, transparent)", overflow: "hidden" }}>
      <motion.div
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        transition={{ duration: 1.3, delay, ease: EASE }}
        style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 60%, white))`, boxShadow: `0 0 18px color-mix(in srgb, ${color} 55%, transparent)` }}
      />
    </div>
  );
}

function Ring({ pct, color, size = 150 }: { pct: number | null; color: string; size?: number }) {
  const reduce = useReducedMotion();
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const p = pct == null ? 0.18 : Math.max(0.03, Math.min(1, pct / 100));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--bm-text) 10%, transparent)" strokeWidth={7} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ duration: 1.8, delay: 0.3, ease: EASE }}
          style={{ filter: `drop-shadow(0 0 8px color-mix(in srgb, ${color} 70%, transparent))` }}
        />
      </svg>
      <motion.div
        animate={reduce || pct != null ? undefined : { opacity: [0.35, 1, 0.35] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: size * 0.26, color: "var(--bm-text)" }}
      >
        {pct == null ? "…" : <CountUp to={pct} suffix="%" />}
      </motion.div>
    </div>
  );
}

function Headline({ children, size = 44 }: { children: ReactNode; size?: number }) {
  return (
    <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: `clamp(${Math.round(size * 0.62)}px, 5.2vw, ${size}px)`, lineHeight: 1.08, letterSpacing: "-0.02em", margin: 0, color: "var(--bm-text)", textWrap: "balance" as never }}>
      {children}
    </h2>
  );
}

const body: React.CSSProperties = { fontSize: "clamp(14px, 1.7vw, 17px)", lineHeight: 1.6, color: "var(--bm-text2)", margin: 0, maxWidth: 620 };
const smallBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999, fontSize: 13, fontWeight: 600,
  border: "1px solid color-mix(in srgb, var(--bm-text) 18%, transparent)", background: "color-mix(in srgb, var(--bm-text) 6%, transparent)",
  color: "var(--bm-text)", cursor: "pointer", fontFamily: "inherit",
};

function clip(s: string, n: number) { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; }
function fmtDate(v: string) { const d = new Date(v); return Number.isNaN(d.getTime()) ? "today" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

// ── Slide builder ────────────────────────────────────────────────────────────

function buildSlides(p: MirrorStoryProps, replay: () => void): Slide[] {
  const { mirror, behavioral, onOpenDetail } = p;
  const acc = mirror.self_reported_accuracy;
  const slides: Slide[] = [];

  // 1. Cover
  slides.push({
    key: "cover", accent: "var(--bm-intel)",
    node: (
      <div style={{ display: "grid", gap: 26, justifyItems: "start" }}>
        <Reveal><Kicker color="var(--bm-intel)">Founder Mirror</Kicker></Reveal>
        <Reveal i={1}><Headline size={56}>Here is how you actually work.</Headline></Reveal>
        <Reveal i={2}>
          <p style={body}>
            Built from what you did, not what you said you would do. {acc.sample_size > 0 ? `${acc.sample_size} outcome${acc.sample_size === 1 ? "" : "s"} tracked` : "Still collecting outcomes"}, updated {fmtDate(mirror.generated_at)}.
          </p>
        </Reveal>
        <Reveal i={3}><div style={{ fontSize: 13, color: "var(--bm-text3)", display: "flex", alignItems: "center", gap: 8 }}>Press <ArrowRight size={14} /> or tap Next to begin</div></Reveal>
      </div>
    ),
  });

  // 2. How well it knows you
  slides.push({
    key: "accuracy", accent: acc.trend === "down" ? "var(--bm-amber)" : "var(--bm-green)",
    node: (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 36, alignItems: "center" }}>
        <Reveal><Ring pct={acc.accuracy_pct} color={acc.trend === "down" ? "var(--bm-amber)" : "var(--bm-green)"} size={168} /></Reveal>
        <div style={{ display: "grid", gap: 16, flex: 1, minWidth: 240 }}>
          <Reveal i={1}><Kicker color="var(--bm-green)">How well BuildMind knows you</Kicker></Reveal>
          <Reveal i={2}><Headline size={38}>{acc.accuracy_pct == null ? "Still learning you." : `It called ${acc.accuracy_pct}% of your moves.`}</Headline></Reveal>
          <Reveal i={3}><p style={body}>{acc.summary}</p></Reveal>
        </div>
      </div>
    ),
  });

  // 3. Archetype
  if (behavioral?.archetype) {
    const a = behavioral.archetype;
    slides.push({
      key: "archetype", accent: "var(--bm-purple)",
      node: (
        <div style={{ display: "grid", gap: 20 }}>
          <Reveal><Kicker color="var(--bm-purple)">Your behavioral signature</Kicker></Reveal>
          <Reveal i={1}><Headline size={54}>{a.name}</Headline></Reveal>
          <Reveal i={2}><p style={body}>{a.tagline}</p></Reveal>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", marginTop: 6 }}>
            {[{ t: "Strength", c: "var(--bm-green)", s: a.strength }, { t: "Blind spot", c: "var(--bm-amber)", s: a.blindSpot }].map((x, i) => (
              <motion.div key={x.t}
                initial={{ opacity: 0, x: i === 0 ? -40 : 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.7 + i * 0.15, ease: EASE }}
                style={{ padding: 16, borderRadius: 16, border: `1px solid color-mix(in srgb, ${x.c} 35%, transparent)`, background: `color-mix(in srgb, ${x.c} 9%, transparent)` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: x.c, marginBottom: 6 }}>{x.t}</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--bm-text2)" }}>{clip(x.s, 180)}</div>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    });
  }

  // 4. Top beliefs, one slide each
  const beliefs = [...mirror.beliefs].sort((x, y) => y.confidence - x.confidence).slice(0, 3);
  beliefs.forEach((b, idx) => {
    const t = trendText[b.trend];
    slides.push({
      key: `belief-${b.belief_key}`, accent: b.trend === "weakening" ? "var(--bm-red)" : "var(--bm-intel)",
      node: (
        <div style={{ display: "grid", gap: 20 }}>
          <Reveal><Kicker color="var(--bm-intel)">What it believes about you · {idx + 1} of {beliefs.length}</Kicker></Reveal>
          <Reveal i={1}><Headline size={40}>&ldquo;{clip(b.belief, 150)}&rdquo;</Headline></Reveal>
          <Reveal i={2}>
            <div style={{ maxWidth: 520, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--bm-text3)" }}>
                <span>Confidence</span>
                <span style={{ color: t.color, display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
                  {b.trend === "weakening" ? <TrendingDown size={14} /> : <TrendingUp size={14} />}{t.text}
                </span>
              </div>
              <Bar pct={b.confidence} color={t.color === "var(--bm-text3)" ? "var(--bm-intel)" : t.color} delay={0.7} height={10} />
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 30, color: "var(--bm-text)" }}><CountUp to={Math.round(b.confidence)} suffix="%" /></div>
            </div>
          </Reveal>
          <Reveal i={3}><p style={body}>{clip(b.why, 260)}</p></Reveal>
          {(b.evidence[0] || b.contradictory_evidence[0]) && (
            <Reveal i={4}>
              <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--bm-text3)", maxWidth: 620 }}>
                {b.evidence[0] && <div>Seen: {clip(b.evidence[0], 140)}</div>}
                {b.contradictory_evidence[0] && <div style={{ color: "var(--bm-amber)" }}>But: {clip(b.contradictory_evidence[0], 140)}</div>}
              </div>
            </Reveal>
          )}
          <Reveal i={5}>
            <button type="button" style={smallBtn} onClick={() => onOpenDetail({ beliefKey: b.belief_key, belief: b.belief, correct: true })}>
              <Pencil size={13} /> This isn&apos;t right
            </button>
          </Reveal>
        </div>
      ),
    });
  });

  // 5. Skills
  const skills = [...mirror.skills].sort((x, y) => y.level - x.level || y.progress - x.progress).slice(0, 4);
  if (skills.length > 0) {
    slides.push({
      key: "skills", accent: "var(--bm-green)",
      node: (
        <div style={{ display: "grid", gap: 22 }}>
          <Reveal><Kicker color="var(--bm-green)">Skills it has watched you build</Kicker></Reveal>
          <Reveal i={1}><Headline size={38}>You are leveling up in {skills.length === 1 ? "one area" : `${skills.length} areas`}.</Headline></Reveal>
          <div style={{ display: "grid", gap: 16, maxWidth: 620 }}>
            {skills.map((s, i) => (
              <Reveal key={s.id} i={2 + i}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, color: "var(--bm-text)" }}>
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--bm-text3)" }}>Level {s.level}</span>
                </div>
                <Bar pct={s.progress * 100} color="var(--bm-green)" delay={0.6 + i * 0.15} />
              </Reveal>
            ))}
          </div>
        </div>
      ),
    });
  }

  // 6. Watch-outs
  const signals = mirror.signals.slice(0, 3);
  if (signals.length > 0) {
    slides.push({
      key: "signals", accent: "var(--bm-amber)",
      node: (
        <div style={{ display: "grid", gap: 20 }}>
          <Reveal><Kicker color="var(--bm-amber)">Worth watching</Kicker></Reveal>
          <Reveal i={1}><Headline size={38}>{signals.length === 1 ? "One pattern" : `${signals.length} patterns`} to keep an eye on.</Headline></Reveal>
          <div style={{ display: "grid", gap: 12, maxWidth: 680 }}>
            {signals.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.5 + i * 0.18, ease: EASE }}
                style={{ padding: "14px 16px", borderRadius: 14, borderLeft: `3px solid ${sevColor[s.severity] ?? "var(--bm-text3)"}`, background: "color-mix(in srgb, var(--bm-text) 5%, transparent)" }}>
                <div style={{ fontWeight: 650, fontSize: 15, color: "var(--bm-text)" }}>{clip(s.title, 90)}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--bm-text2)", marginTop: 3 }}>{clip(s.summary, 150)}</div>
                {s.recommended_response && <div style={{ fontSize: 12.5, color: "var(--bm-text3)", marginTop: 6 }}>Try: {clip(s.recommended_response, 120)}</div>}
              </motion.div>
            ))}
          </div>
        </div>
      ),
    });
  }

  // 7. What is shifting
  const up = mirror.strengthening_patterns.slice(0, 3);
  const down = mirror.weakening_patterns.slice(0, 3);
  if (up.length + down.length > 0) {
    const col = (title: string, items: string[], color: string, Icon: typeof TrendingUp, dir: number) => (
      <motion.div initial={{ opacity: 0, y: 30 * dir }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
        style={{ padding: 18, borderRadius: 18, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)`, minHeight: 120 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color, fontWeight: 700, fontSize: 14, marginBottom: 10 }}><Icon size={16} />{title}</div>
        {items.length === 0 ? <div style={{ fontSize: 13, color: "var(--bm-text3)" }}>Nothing yet.</div> : (
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 14, lineHeight: 1.5, color: "var(--bm-text2)" }}>
            {items.map((x) => <li key={x}>{clip(x, 110)}</li>)}
          </ul>
        )}
      </motion.div>
    );
    slides.push({
      key: "shift", accent: "var(--bm-intel)",
      node: (
        <div style={{ display: "grid", gap: 22 }}>
          <Reveal><Kicker color="var(--bm-intel)">What is shifting</Kicker></Reveal>
          <Reveal i={1}><Headline size={38}>Some habits are growing, others are fading.</Headline></Reveal>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
            {col("Getting stronger", up, "var(--bm-green)", TrendingUp, 1)}
            {col("Fading", down, "var(--bm-red)", TrendingDown, -1)}
          </div>
        </div>
      ),
    });
  }

  // 8. Humility
  if (mirror.may_be_wrong_about.length > 0) {
    slides.push({
      key: "wrong", accent: "var(--bm-amber)",
      node: (
        <div style={{ display: "grid", gap: 20 }}>
          <Reveal><Kicker color="var(--bm-amber)">Where it may be wrong</Kicker></Reveal>
          <Reveal i={1}><Headline size={40}>It does not claim to be certain about these.</Headline></Reveal>
          <div style={{ display: "grid", gap: 10, maxWidth: 640 }}>
            {mirror.may_be_wrong_about.slice(0, 3).map((x, i) => (
              <Reveal key={x} i={2 + i}>
                <div style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.55, color: "var(--bm-text2)" }}>
                  <AlertTriangle size={16} color="var(--bm-amber)" style={{ flexShrink: 0, marginTop: 3 }} />{clip(x, 170)}
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal i={5}><button type="button" style={smallBtn} onClick={() => onOpenDetail({ correct: true })}><Pencil size={13} /> Correct the model</button></Reveal>
        </div>
      ),
    });
  }

  // 9. Next move
  if (mirror.decision.top) {
    const d = mirror.decision.top;
    slides.push({
      key: "next", accent: "var(--bm-green)",
      node: (
        <div style={{ display: "grid", gap: 20 }}>
          <Reveal><Kicker color="var(--bm-green)">The move it would make</Kicker></Reveal>
          <Reveal i={1}><Headline size={40}>{clip(d.action, 170)}</Headline></Reveal>
          <Reveal i={2}><p style={body}>{clip(d.rationale, 260)}</p></Reveal>
          <Reveal i={3}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--bm-text3)" }}>
              <Compass size={15} color="var(--bm-green)" /> Ranked above {mirror.decision.alternatives.length} other option{mirror.decision.alternatives.length === 1 ? "" : "s"}
            </div>
          </Reveal>
        </div>
      ),
    });
  }

  // 10. Finale
  const sig = behavioral?.signature_card;
  slides.push({
    key: "finale", accent: "var(--bm-intel)",
    node: (
      <div style={{ display: "grid", gap: 22, justifyItems: "start" }}>
        <Reveal><Kicker color="var(--bm-intel)"><Sparkles size={13} /> That is your mirror, today</Kicker></Reveal>
        <Reveal i={1}><Headline size={46}>{sig?.dayCount ? `Day ${sig.dayCount}, and it is still learning.` : "It gets sharper every time you work."}</Headline></Reveal>
        {sig?.statLine && <Reveal i={2}><p style={body}>{sig.statLine}</p></Reveal>}
        {sig?.avoidanceZone && <Reveal i={3}><div style={{ fontSize: 13.5, color: "var(--bm-text3)" }}>Where you hesitate most: {sig.avoidanceZone}</div></Reveal>}
        <Reveal i={4}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={smallBtn} onClick={replay}><RotateCcw size={14} /> Replay</button>
            <button type="button" style={smallBtn} onClick={() => onOpenDetail()}><Layers size={14} /> See full detail</button>
            <button type="button" style={smallBtn} onClick={() => onOpenDetail({ correct: true })}><Pencil size={14} /> Correct the model</button>
          </div>
        </Reveal>
      </div>
    ),
  });

  return slides;
}

// ── Stage ────────────────────────────────────────────────────────────────────

export function MirrorStory(props: MirrorStoryProps) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [nonce, setNonce] = useState(0);
  const touched = useRef(false);

  const replay = useCallback(() => { setDir(-1); setIndex(0); setNonce((n) => n + 1); setPlaying(!reduce); }, [reduce]);
  const slides = useMemo(() => buildSlides(props, replay), [props, replay]);
  const last = slides.length - 1;

  useEffect(() => { if (!touched.current) setPlaying(!reduce); }, [reduce]);

  const go = useCallback((n: number, manual = true) => {
    setIndex((cur) => {
      const next = Math.max(0, Math.min(last, n));
      if (next !== cur) setDir(next > cur ? 1 : -1);
      return next;
    });
    setNonce((x) => x + 1);
    if (manual) touched.current = true;
  }, [last]);

  const next = useCallback((manual = true) => go(index + 1, manual), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === " " && tag !== "BUTTON") { e.preventDefault(); touched.current = true; setPlaying((p) => !p); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const slide = slides[index];
  const autoplay = playing && index < last;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Founder Mirror story"
      style={{
        position: "relative", overflow: "hidden", borderRadius: 28, minHeight: "min(680px, calc(100dvh - 190px))",
        border: "1px solid var(--bm-border)", background: "var(--bm-bg2)", display: "flex", flexDirection: "column",
      }}
    >
      <style>{`@keyframes mmfill{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>

      {/* Ambient light that shifts colour with each slide */}
      <motion.div aria-hidden animate={{ background: `radial-gradient(70% 80% at 85% 0%, color-mix(in srgb, ${slide.accent} 26%, transparent), transparent 70%)` }} transition={{ duration: 1.1 }} style={{ position: "absolute", inset: 0 }} />
      {!reduce && (
        <>
          <motion.div aria-hidden animate={{ x: [0, 50, -30, 0], y: [0, -30, 40, 0], backgroundColor: `color-mix(in srgb, ${slide.accent} 30%, transparent)` }} transition={{ x: { duration: 22, repeat: Infinity, ease: "easeInOut" }, y: { duration: 26, repeat: Infinity, ease: "easeInOut" }, backgroundColor: { duration: 1.1 } }}
            style={{ position: "absolute", width: 340, height: 340, borderRadius: "50%", filter: "blur(80px)", left: "-6%", bottom: "-14%", opacity: 0.55 }} />
          <motion.div aria-hidden animate={{ x: [0, -40, 30, 0], y: [0, 36, -24, 0], backgroundColor: `color-mix(in srgb, ${slide.accent} 22%, var(--bm-purple))` }} transition={{ x: { duration: 28, repeat: Infinity, ease: "easeInOut" }, y: { duration: 20, repeat: Infinity, ease: "easeInOut" }, backgroundColor: { duration: 1.1 } }}
            style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", filter: "blur(90px)", right: "8%", top: "30%", opacity: 0.35 }} />
        </>
      )}

      {/* Progress segments */}
      <div style={{ position: "relative", zIndex: 3, display: "flex", gap: 5, padding: "16px 20px 0" }}>
        {slides.map((s, i) => (
          <button key={s.key} type="button" aria-label={`Go to slide ${i + 1}`} onClick={() => go(i)}
            style={{ flex: 1, height: 18, background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <span style={{ display: "block", width: "100%", height: 3, borderRadius: 3, background: "color-mix(in srgb, var(--bm-text) 16%, transparent)", overflow: "hidden" }}>
              <span
                key={i === index ? `a${nonce}` : `s${i}`}
                onAnimationEnd={i === index && autoplay ? () => next(false) : undefined}
                style={{
                  display: "block", height: "100%", transformOrigin: "left", background: "var(--bm-text)",
                  transform: i < index ? "scaleX(1)" : i === index && !autoplay ? "scaleX(1)" : "scaleX(0)",
                  animation: i === index && autoplay ? `mmfill ${SLIDE_MS}ms linear forwards` : undefined,
                  opacity: i === index ? 1 : 0.85,
                }}
              />
            </span>
          </button>
        ))}
      </div>

      {/* Slide */}
      <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", alignItems: "center", padding: "clamp(20px, 4vw, 52px)", paddingBottom: 88 }}>
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={slide.key}
            custom={dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 70 * dir, scale: 0.98, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -70 * dir, scale: 0.98, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: EASE }}
            drag={reduce ? false : "x"}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => { if (info.offset.x < -70) next(); else if (info.offset.x > 70) prev(); }}
            style={{ width: "100%", maxWidth: 860, touchAction: "pan-y" }}
          >
            {slide.node}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div style={{ position: "absolute", zIndex: 3, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => { touched.current = true; setPlaying((p) => !p); if (index === last) replay(); }}
            style={{ ...smallBtn, padding: 9, borderRadius: 999 }}>
            {playing && index < last ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--bm-text3)" }}>{index + 1} / {slides.length}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" aria-label="Previous slide" onClick={prev} disabled={index === 0} style={{ ...smallBtn, padding: 10, opacity: index === 0 ? 0.35 : 1 }}><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Next slide" onClick={() => next()} disabled={index === last} style={{ ...smallBtn, padding: "10px 16px", opacity: index === last ? 0.35 : 1 }}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
