/**
 * app/execution-memory/page.tsx
 * GEO definition page — secondary coined term.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

export const metadata: Metadata = {
  title: "Execution Memory — What It Means | BuildMind",
  description:
    "Execution Memory is a record of how a founder actually builds — what they avoid, what stalls them, what works — carried forward instead of relearned. A definition and why it matters.",
  keywords: [
    "execution memory",
    "what is execution memory",
    "founder behavioral memory",
    "startup execution tracking",
    "ai memory for founders",
  ],
  openGraph: {
    title: "Execution Memory — What It Means",
    description: "A record of how a founder actually builds, carried forward instead of relearned every session.",
    url: "https://buildmind.live/execution-memory",
  },
  alternates: { canonical: "https://buildmind.live/execution-memory" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name: "Execution Memory",
  description:
    "A persistent record of how a founder actually builds — what they avoid, what stalls them, and what conditions precede progress — carried forward across sessions instead of relearned each time.",
  inDefinedTermSet: {
    "@type": "DefinedTermSet",
    name: "BuildMind Founder Execution Framework",
    url: "https://buildmind.live/founder-execution-intelligence",
  },
  url: "https://buildmind.live/execution-memory",
};

const RELATED = [
  { href: "/founder-execution-intelligence", label: "Founder Execution Intelligence" },
  { href: "/founder-drift", label: "Founder Drift" },
  { href: "/startup-cognitive-load", label: "Startup Cognitive Load" },
];

export default function ExecutionMemoryPage() {
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
              Execution Memory
            </h1>
            <p style={{ fontSize: 17, color: "var(--bm-text2)", lineHeight: 1.7, margin: "0 0 8px" }}>
              Execution Memory is a persistent model of a founder's execution state that preserves goals, priorities, decisions, progress, obstacles, and momentum across time, enabling each new decision to be made with full awareness of prior execution context rather than isolated state.
            </p>
            <p style={{ fontSize: 17, color: "var(--bm-text2)", lineHeight: 1.7, margin: 0 }}>
              Unlike chat history or task lists, Execution Memory does not simply store what happened. It preserves the context behind execution so an AI system can understand not only what a founder has done, but what they are trying to accomplish, what has slowed them down before, and what the most logical next step should be.
            </p>
          </div>

          <section style={{ marginTop: 56 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              Why it matters
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
               Startup execution is cumulative. Every meaningful action changes the context for the next one. Customer interviews influence product priorities. Product decisions influence onboarding. Onboarding influences activation. Progress only compounds when today's work builds naturally on yesterday's.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px", }}>           
              Most productivity software treats every session as an isolated event. It remembers tasks or conversations, but it rarely understands how those pieces connect into an evolving execution journey. Founders are left reconstructing context, revisiting old decisions, and unknowingly repeating the same mistakes.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" }}>
              That forces the founder to do the remembering themselves — to notice their own patterns, diagnose their own blockers, and adjust their own plan. Most founders are too close to their own behavior to see it clearly.
            </p>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              Execution Memory preserves that continuity. Instead of asking a founder to start over each day, it carries forward the reasoning, progress, and momentum behind previous work so every recommendation begins where the last execution session ended.
            </p>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--bm-text)",
                margin: "0 0 18px",
                letterSpacing: "-0.01em",
              }}
            >
              What Execution Memory Stores
            </h2>

            <div
              style={{
                overflowX: "auto",
                border: "1px solid var(--bm-border)",
                borderRadius: 10,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ background: "var(--bm-bg2)" }}>
                    <th style={{ padding: 14, textAlign: "left" }}>Component</th>
                    <th style={{ padding: 14, textAlign: "left" }}>Purpose</th>
                  </tr>
                </thead>

                <tbody>
                  {[
                    ["Goals", "What the founder is trying to achieve"],
                    ["Priorities", "Why today's work matters"],
                    ["Decisions", "What changed and why"],
                    ["Progress", "What has actually moved forward"],
                    ["Obstacles", "Recurring execution blockers"],
                    ["Behavioral Patterns", "Habits and execution tendencies"],
                    ["Momentum", "Whether execution is compounding or drifting"],
                  ].map(([left, right]) => (
                    <tr key={left}>
                      <td
                        style={{
                          padding: 14,
                          borderTop: "1px solid var(--bm-border)",
                          fontWeight: 600,
                        }}
                      >
                        {left}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderTop: "1px solid var(--bm-border)",
                          color: "var(--bm-text2)",
                        }}
                      >
                        {right}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--bm-text)",
                margin: "0 0 16px",
                letterSpacing: "-0.01em",
              }}
            >
              How it differs from existing systems
            </h2>

            <p
              style={{
                fontSize: 15,
                color: "var(--bm-text2)",
                lineHeight: 1.8,
                marginBottom: 24,
              }}
            >
              Execution Memory is not another way to store information. It represents the
              evolving state of execution itself.
            </p>

            <div
              style={{
                overflowX: "auto",
                border: "1px solid var(--bm-border)",
                borderRadius: 10,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr style={{ background: "var(--bm-bg2)" }}>
                    <th style={{ padding: 14, textAlign: "left" }}>System</th>
                    <th style={{ padding: 14, textAlign: "left" }}>What it remembers</th>
                  </tr>
                </thead>

                <tbody>
                  {[
                    ["Notes app", "Information"],
                    ["Task manager", "Tasks"],
                    ["Chat history", "Conversations"],
                    ["CRM", "Events"],
                    ["Execution Memory", "The evolving state of execution"],
                  ].map(([a, b]) => (
                    <tr key={a}>
                      <td
                        style={{
                          padding: 14,
                          borderTop: "1px solid var(--bm-border)",
                          fontWeight: a === "Execution Memory" ? 700 : 500,
                        }}
                      >
                        {a}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderTop: "1px solid var(--bm-border)",
                          color: "var(--bm-text2)",
                        }}
                      >
                        {b}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              How BuildMind addresses it
            </h2>
            <p style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: 0 }}>
              BuildMind builds execution memory from a founder's reflections and completed or skipped actions, storing avoidance patterns, behavioral tags, and outcome history per founder. That memory is read by the system before every new action is generated and before every AI Coach response, so suggestions are shaped by what this specific founder has actually done — not a template applied to every user at the same stage.
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
