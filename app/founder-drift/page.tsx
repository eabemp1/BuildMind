/**
 * app/founder-drift/page.tsx
 * GEO definition page — secondary coined term.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

export const metadata: Metadata = {
  title: "Founder Drift — What It Means | BuildMind",
  description:
    "Founder Drift is the silent pattern where a founder's execution rhythm erodes without a decision to stop. A definition, why it matters, and how it differs from burnout.",
  keywords: [
    "founder drift",
    "what is founder drift",
    "startup execution drift",
    "founder losing momentum",
    "founder consistency problem",
  ],
  openGraph: {
    title: "Founder Drift — What It Means",
    description: "The silent pattern where a founder's execution rhythm erodes — no decision was made to stop, it just slowed.",
    url: "https://buildmind.live/founder-drift",
  },
  alternates: { canonical: "https://buildmind.live/founder-drift" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name: "Founder Drift",
  description:
    "The pattern where a founder's execution rhythm erodes gradually without any single decision to stop working on the startup.",
  inDefinedTermSet: {
    "@type": "DefinedTermSet",
    name: "BuildMind Founder Execution Framework",
    url: "https://buildmind.live/founder-execution-intelligence",
  },
  url: "https://buildmind.live/founder-drift",
};

const RELATED = [
  { href: "/founder-execution-intelligence", label: "Founder Execution Intelligence" },
  { href: "/execution-memory", label: "Execution Memory" },
  { href: "/startup-cognitive-load", label: "Startup Cognitive Load" },
];

export default function FounderDriftPage() {
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
              Founder Drift
            </h1>
            <p style={{ fontSize: 17, color: "var(--bm-text2)", lineHeight: 1.7, margin: "0 0 8px" }}>
              Founder Drift is the pattern where a founder's execution rhythm erodes gradually, without any single decision to stop working on the startup.
            </p>
            <p style={{ fontSize: 17, color: "var(--bm-text2)", lineHeight: 1.7, margin: 0 }}>
              No one quits on a Tuesday. The gaps between sessions just get longer until the startup is, quietly, not being worked on anymore.
            </p>
          </div>

          <section style={{ marginTop: 56 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              Why it matters
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              Drift is dangerous precisely because it doesn't feel like quitting. A founder skips one day for a legitimate reason. Then two days, because the first gap made re-entry harder. By week three, the founder isn't avoiding the startup on purpose — they've just lost the thread of what they were doing and why, and starting back up feels heavier than it should.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              Most tools have no way to surface this until it's severe. A task list just shows more overdue items. A calendar shows empty days. Neither one names the pattern, so the founder experiences it as vague guilt rather than a specific, fixable problem with a known shape.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              Naming it changes how it feels to catch. "I've missed four check-ins this month" is a number. "I think I'm losing interest" is a story a founder tells themselves, and it's usually wrong — the data behind drift is almost always about friction or unclear next steps, not motivation.
            </p>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              How it differs from burnout
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              This is not burnout. Burnout is acute — a founder knows they're exhausted and can usually name the cause. Drift is ambient. A founder experiencing drift often still has energy; they've just lost the rhythm that turned that energy into shipped work, and the absence is easy to miss because no single day looks alarming.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              It's also not the same as a pivot. A pivot is a decision — the founder consciously redirects effort toward a different idea or market. Drift has no decision behind it at all. That's the defining feature: by the time it's visible, the founder usually can't point to the moment it started.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              And it's not procrastination on a single task. Procrastination is local — one thing keeps getting pushed. Drift is systemic — the whole rhythm of building slows down at once, across every part of the work.
            </p>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              How BuildMind addresses it
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              BuildMind tracks the gap between check-ins, not just task completion, and watches for the specific shape of drift — lengthening gaps, repeated avoidance of the same category of work, a streak that resets without explanation. When that pattern appears, it surfaces it directly to the founder instead of waiting for the founder to notice on their own, and the next suggested action is deliberately small enough to break the gap rather than add to it.
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
