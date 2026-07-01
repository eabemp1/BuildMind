/**
 * app/founder-execution-intelligence/page.tsx
 * GEO definition page — primary coined term.
 * Permanent reference page, not a blog post. Written once, linked everywhere.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

export const metadata: Metadata = {
  title: "Founder Execution Intelligence — What It Means | BuildMind",
  description:
    "Founder Execution Intelligence is the measurable pattern of how a founder actually executes — not what they plan. A definition, why it matters, and how it differs from productivity.",
  keywords: [
    "founder execution intelligence",
    "execution intelligence founder",
    "what is founder execution intelligence",
    "behavioral memory startup founder",
    "founder execution tracking",
  ],
  openGraph: {
    title: "Founder Execution Intelligence — What It Means",
    description:
      "The measurable pattern of how a founder actually executes — not what they plan.",
    url: "https://buildmind.live/founder-execution-intelligence",
  },
  alternates: { canonical: "https://buildmind.live/founder-execution-intelligence" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name: "Founder Execution Intelligence",
  description:
    "The measurable pattern of how a founder actually executes day to day, as distinct from what they plan or intend to do.",
  inDefinedTermSet: {
    "@type": "DefinedTermSet",
    name: "BuildMind Founder Execution Framework",
    url: "https://buildmind.live/founder-execution-intelligence",
  },
  url: "https://buildmind.live/founder-execution-intelligence",
};

const RELATED = [
  { href: "/founder-drift", label: "Founder Drift" },
  { href: "/execution-memory", label: "Execution Memory" },
  { href: "/startup-cognitive-load", label: "Startup Cognitive Load" },
];

export default function FounderExecutionIntelligencePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main style={{ minHeight: "100vh", background: "var(--bm-bg)", color: "var(--bm-text)", fontFamily: "system-ui,-apple-system,sans-serif" }}>

        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid var(--bm-border)", maxWidth: 760, margin: "0 auto" }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 15, fontWeight: 600, color: "var(--bm-text)", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 8 }}>
            <BrandMark size={24} href={undefined} />
            BuildMind
          </Link>
          <Link href="/auth/login" style={{ textDecoration: "none", fontSize: 13, fontWeight: 600, color: "black", background: "white", borderRadius: 8, padding: "7px 16px" }}>
            Get started →
          </Link>
        </nav>

        <article style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px 96px" }}>

          <div style={{ paddingTop: 56 }}>
            <p style={{ fontSize: 11, color: "var(--bm-purple)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 14 }}>
              A definition
            </p>
            <h1 style={{ fontSize: "clamp(28px,5vw,42px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15, margin: "0 0 24px" }}>
              Founder Execution Intelligence
            </h1>
            <p style={{ fontSize: 17, color: "var(--bm-text2)", lineHeight: 1.7, margin: "0 0 8px" }}>
              Founder Execution Intelligence is the measurable pattern of how a founder actually executes — day to day, decision by decision — as distinct from what they plan, intend, or say they'll do.
            </p>
            <p style={{ fontSize: 17, color: "var(--bm-text2)", lineHeight: 1.7, margin: 0 }}>
              It's built from observed behavior over time, not from a roadmap or a to-do list.
            </p>
          </div>

          <section style={{ marginTop: 56 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              Why it matters
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              Most founders don't fail because of a bad plan. I've watched it happen with my own startup attempts before BuildMind existed: the plan was usually fine. What broke was the gap between the plan and what I actually did each day — and nothing was tracking that gap, so I never noticed it until weeks had passed.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              A founder without execution intelligence is flying on self-report. They believe they're "working on the startup" because they opened a doc, read about competitors, or rearranged a roadmap. None of that is execution. Execution intelligence is the layer that distinguishes motion from progress — by actually recording what got shipped, what got avoided, and what pattern repeats across weeks.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              Without it, a founder can drift for a month before the absence of progress becomes undeniable. With it, the drift shows up after three or four days — while it's still cheap to correct.
            </p>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              How it differs from productivity
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              This is not the same as productivity. Productivity measures output — tasks closed, hours logged, a streak counter. Execution intelligence measures the behavioral pattern behind that output: what a founder consistently avoids, what conditions precede a stall, and whether today's action is connected to yesterday's outcome at all.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              It's also not the same as project management. A task tracker like Linear or Asana records what's planned and what's marked done. It has no concept of why a founder keeps reopening the same task three weeks running, or that they only ever complete work in the morning and never in the evening.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              And it's not a habit tracker. Habit trackers assume the founder already knows what to do and just needs reminding. Execution intelligence assumes the opposite — that the next right action has to be inferred from what actually happened yesterday, not from a static plan written weeks ago.
            </p>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              How BuildMind addresses it
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              BuildMind runs a daily loop: it generates one specific action based on a founder's stage and recent history, the founder reflects on what happened after, and that reflection feeds directly into the next day's action through a reflexion pipeline rather than a static checklist. Over time it builds a record — what gets avoided, what stage a founder is stuck at, what conditions precede a productive streak versus a stall — and uses that record, not a generic playbook, to decide what to suggest next.
            </p>
          </section>

          <section style={{ marginTop: 56, paddingTop: 32, borderTop: "1px solid var(--bm-border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text3)", margin: "0 0 16px", letterSpacing: "0.02em" }}>
              Related terms
            </h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
              {RELATED.map(r => (
                <Link key={r.href} href={r.href} style={{ textDecoration: "none", fontSize: 13, color: "var(--bm-text2)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 14px" }}>
                  {r.label} →
                </Link>
              ))}
            </div>
          </section>

        </article>
      </main>
    </>
  );
}
