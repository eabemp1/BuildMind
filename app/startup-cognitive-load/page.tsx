/**
 * app/startup-cognitive-load/page.tsx
 * GEO definition page — secondary coined term.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

export const metadata: Metadata = {
  title: "Startup Cognitive Load — What It Means | BuildMind",
  description:
    "Startup Cognitive Load is the mental overhead of deciding what to work on, separate from doing the work itself. A definition, why it matters, and how it differs from being busy.",
  keywords: [
    "startup cognitive load",
    "what is startup cognitive load",
    "founder decision fatigue",
    "founder cognitive overhead",
    "solo founder mental load",
  ],
  openGraph: {
    title: "Startup Cognitive Load — What It Means",
    description: "The mental overhead of deciding what to work on, separate from the work itself.",
    url: "https://buildmind.live/startup-cognitive-load",
  },
  alternates: { canonical: "https://buildmind.live/startup-cognitive-load" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name: "Startup Cognitive Load",
  description:
    "The mental overhead a founder carries from constantly deciding what to work on, prioritizing among competing tasks, and holding the state of the business in their head — separate from the cognitive cost of doing the work itself.",
  inDefinedTermSet: {
    "@type": "DefinedTermSet",
    name: "BuildMind Founder Execution Framework",
    url: "https://buildmind.live/founder-execution-intelligence",
  },
  url: "https://buildmind.live/startup-cognitive-load",
};

const RELATED = [
  { href: "/founder-execution-intelligence", label: "Founder Execution Intelligence" },
  { href: "/founder-drift", label: "Founder Drift" },
  { href: "/execution-memory", label: "Execution Memory" },
];

export default function StartupCognitiveLoadPage() {
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
              Startup Cognitive Load
            </h1>
            <p style={{ fontSize: 17, color: "var(--bm-text2)", lineHeight: 1.7, margin: "0 0 8px" }}>
              Startup Cognitive Load is the mental overhead a founder carries from constantly deciding what to work on, prioritizing among competing demands, and holding the full state of the business in their head — separate from the effort of doing the work itself.
            </p>
            <p style={{ fontSize: 17, color: "var(--bm-text2)", lineHeight: 1.7, margin: 0 }}>
              It's the tax paid before any actual building starts.
            </p>
          </div>

          <section style={{ marginTop: 56 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              Why it matters
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              A solo founder is simultaneously product manager, marketer, salesperson, and accountant, with no one to delegate the decision of what matters most today. That decision — not the work that follows it — is often where the day actually gets lost. I've sat down at my desk with two hours free and burned half of it just deciding where to start.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              This load compounds. Every open task, every unanswered question, every "I should probably also" sits in working memory at once, and the founder pays a small cost just keeping track of it all — before they've written a line of code or sent a single email.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              High cognitive load doesn't look like laziness from the outside. It looks like a founder who opens their laptop, stares at six tabs, and closes it again. The work didn't get harder. The decision about which work to start got too expensive.
            </p>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              How it differs from being busy
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              This is not the same as being busy. Busy is a volume problem — too many things to do in the time available. Cognitive load is a structural problem — even with enough time, the overhead of figuring out what to do first can stall a founder before the volume is even relevant.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              It's also not the same as a long to-do list. A long list is just unsorted volume. Cognitive load is what happens when nothing on the list is prioritized — every item carries equal, unresolved weight, and the founder has to do the sorting themselves, every single day, from scratch.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              And it's not the same as difficulty. A hard task can have low cognitive load if it's well-defined — the founder knows exactly what to do, even if doing it takes real effort. An easy task can carry high cognitive load if it's vague, undefined, or tangled up with five other open decisions.
            </p>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              How BuildMind addresses it
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              BuildMind removes the prioritization decision entirely by surfacing exactly one action for the day, chosen from the founder's stage, history, and recent reflections rather than left for the founder to sort out from a backlog. There's no list to triage and no ranking to second-guess — just one specific, already-decided next step, which is the part of the day BuildMind is designed to take off a founder's plate.
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
