"use client";

/**
 * StressTestProgress — what a founder sees while Break My Startup runs.
 *
 * The request is a single POST that takes 20-45 seconds, so there is no real
 * per-step signal to show. The steps below are the real stages of the pipeline
 * in the order it runs them; which one is highlighted is an ESTIMATE from
 * elapsed time, and the copy says so ("usually 25-45 seconds") rather than
 * pretending to be a live feed. If it runs long, it says that too.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

const STEPS = [
  { at: 0,  title: "Reading your idea",              detail: "Pulling out the claims it depends on: who it's for, why they'd pay, why now." },
  { at: 5,  title: "Searching for real competitors", detail: "Live web search, plus any competitors you named." },
  { at: 14, title: "Five agents attack it at once",  detail: "Market size, competition, customer demand, risk and execution, each arguing the worst case." },
  { at: 30, title: "A critic cross-examines them",   detail: "Looking for findings that contradict each other or rest on nothing." },
  { at: 40, title: "Writing the verdict",            detail: "Checking the conclusions against the evidence before showing you." },
];

export function StressTestProgress({ idea }: { idea: string }) {
  const reduce = useReducedMotion();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, []);

  let active = 0;
  STEPS.forEach((s, i) => { if (seconds >= s.at) active = i; });
  const long = seconds > 55;
  const snippet = idea.trim().replace(/\s+/g, " ");
  const shown = snippet.length > 140 ? `${snippet.slice(0, 137)}...` : snippet;

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--bm-border)] bg-[var(--bm-bg2)] p-5 sm:p-6"
    >
      {/* one slow scanning line: the single moving thing on the card */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--bm-red), transparent)", opacity: 0.55 }}
          initial={{ top: 0 }}
          animate={{ top: ["0%", "100%"] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--bm-red)]">Stress test running</p>
          <p className="mt-2 text-[15px] font-medium leading-snug text-[var(--bm-text)]">
            {long ? "Still working. Deep analyses can take a little longer." : "Trying to prove this idea wrong."}
          </p>
          {shown && <p className="mt-1.5 text-[12.5px] italic leading-relaxed text-[var(--bm-text3)]">“{shown}”</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-2xl leading-none text-[var(--bm-text)]">{seconds}s</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--bm-text4)]">usually 25–45s</p>
        </div>
      </div>

      <ol className="mt-5 flex flex-col gap-3.5">
        {STEPS.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li key={s.title} className="flex gap-3" style={{ opacity: done || current ? 1 : 0.4, transition: "opacity .4s" }}>
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                style={{
                  borderColor: done ? "var(--bm-green)" : current ? "var(--bm-red)" : "var(--bm-border2)",
                  background: done ? "var(--bm-green)" : "transparent",
                  color: "#111",
                }}
              >
                {done ? (
                  <Check size={12} strokeWidth={3} />
                ) : current ? (
                  <motion.span
                    className="block h-2 w-2 rounded-full"
                    style={{ background: "var(--bm-red)" }}
                    animate={reduce ? undefined : { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.3, repeat: Infinity }}
                  />
                ) : null}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-[var(--bm-text)]">{s.title}</p>
                {current && <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--bm-text3)]">{s.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-[11.5px] text-[var(--bm-text4)]">Keep this tab open. Your result appears here as soon as it is ready.</p>
    </motion.div>
  );
}
