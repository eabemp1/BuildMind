/**
 * app/students/page.tsx — BuildMind for Students
 * SEO: "startup tools for students", "github student developer startup",
 *      "free startup app student", "indie hacker student"
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "BuildMind for Students — Free Builder Plan | Build Your Startup While Studying",
  description:
    "BuildMind is free for students. GitHub Student Developer Pack or .edu email gets you the Builder plan ($19/mo) at no cost. One daily action. Build your startup between lectures.",
  keywords: ["startup tools for students","free startup app for students","github student developer pack startups","build startup as student","student indie hacker","student founder app free","university startup tools","college founder productivity"],
  openGraph: {
    title: "BuildMind for Students — Free Builder Plan",
    description: "Build your startup between lectures. Free for students with .edu email or GitHub Student Pack.",
    url: "https://buildmind.live/students",
  },
  alternates: { canonical: "https://buildmind.live/students" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "BuildMind for Students",
  description: "Free startup execution tool for university students — one daily action, AI coaching, and weekly accountability.",
  provider: { "@type": "Organization", name: "BuildMind", url: "https://buildmind.live" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", eligibleCustomerType: "http://schema.org/Student" },
  url: "https://buildmind.live/students",
};

const BENEFITS = [
  { icon: "⚡", title: "One action per day", desc: "You have lectures and a life. BuildMind gives you one specific startup action — 30 min to 2 hours max." },
  { icon: "🧠", title: "AI reads your project", desc: "The AI Coach reads your actual data before every response. Not generic advice — specific to your stage and blockers." },
  { icon: "📊", title: "Weekly strategy reports", desc: "See your momentum, where you're stalling, and what to fix next without guessing." },
  { icon: "🔥", title: "Streak accountability", desc: "Build a 14-day streak and you'll have more progress than most founders make in 3 months." },
  { icon: "🌍", title: "Build in public", desc: "Every Friday, generate a shareable card showing your week. Post it. Build an audience before you launch." },
  { icon: "🎓", title: "Free for students", desc: ".edu email or GitHub Student Pack → Builder plan free. The only condition: you ship something." },
];

const STEPS = [
  { n: "01", title: "Sign up free", desc: "Create an account with your student or .edu email." },
  { n: "02", title: "Onboard in 90 seconds", desc: "Your idea, your users, your biggest blocker, your stage. 4 questions." },
  { n: "03", title: "Get your first action", desc: "Immediately get one specific task for today. Not a list. One thing." },
  { n: "04", title: "Reflect every evening", desc: "What happened? BuildMind recalibrates tomorrow based on your reflection." },
  { n: "05", title: "Ship in one semester", desc: "Most student founders who use BuildMind daily reach MVP in 60–90 days." },
];

export default function StudentsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main style={{ minHeight: "100vh", background: "var(--bm-bg)", color: "var(--bm-text)", fontFamily: "system-ui,-apple-system,sans-serif" }}>

        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid var(--bm-border)", maxWidth: 900, margin: "0 auto" }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 15, fontWeight: 600, color: "var(--bm-text)", letterSpacing: "-0.02em" }}>BuildMind</Link>
          <div style={{ display: "flex", gap: 12 }}>
            <Link href="/auth/login" style={{ textDecoration: "none", fontSize: 13, color: "var(--bm-text3)", padding: "7px 14px" }}>Sign in</Link>
            <Link href="/auth/login" style={{ textDecoration: "none", fontSize: 13, fontWeight: 600, color: "black", background: "white", borderRadius: 8, padding: "7px 16px" }}>Get free access →</Link>
          </div>
        </nav>

        <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px" }}>

          <section style={{ textAlign: "center", padding: "72px 0 56px" }}>
            <div style={{ display: "inline-block", fontSize: 11, color: "var(--bm-purple)", background: "var(--bm-pdim)", border: "1px solid var(--bm-pbd)", borderRadius: 99, padding: "4px 14px", marginBottom: 20, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>🎓 Free for students</div>
            <h1 style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 20px" }}>
              Build your startup<br />between lectures.
            </h1>
            <p style={{ fontSize: 16, color: "var(--bm-text2)", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px" }}>
              One specific action every day — decided by AI, based on your startup stage and yesterday&apos;s reflection. No planning paralysis. Just execute.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
              <Link href="/auth/login" style={{ textDecoration: "none", background: "white", color: "black", fontWeight: 700, fontSize: 14, borderRadius: 10, padding: "13px 28px" }}>Start free — student access</Link>
              <Link href="/try" style={{ textDecoration: "none", color: "var(--bm-text2)", fontSize: 14, borderRadius: 10, padding: "13px 28px", border: "1px solid var(--bm-border2)" }}>Try without signing up →</Link>
            </div>
            <p style={{ marginTop: 14, fontSize: 12, color: "var(--bm-text4)" }}>GitHub Student Pack or .edu email → Builder plan free</p>
          </section>

          <section style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 24, color: "var(--bm-text)" }}>What you get</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
              {BENEFITS.map(b => (
                <div key={b.title} style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "20px 22px" }}>
                  <div style={{ fontSize: 22, marginBottom: 10 }}>{b.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", marginBottom: 5 }}>{b.title}</div>
                  <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6 }}>{b.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "28px 32px", marginBottom: 64 }}>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" as const }}>
              <div style={{ fontSize: 36, flexShrink: 0 }}>🐙</div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 8px" }}>Got GitHub Student Developer Pack?</h2>
                <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.7, margin: "0 0 12px", maxWidth: 540 }}>
                  The Pack gives you 100+ free tools — including the domain buildmind.live was built on. If you have Pack access, you qualify for Builder plan free for 12 months.
                </p>
                <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.7, margin: "0 0 18px", maxWidth: 540 }}>
                  Sign up, then send your Pack verification to <strong style={{ color: "var(--bm-text2)" }}>students@buildmind.live</strong>. Upgraded within 24 hours.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                  <Link href="/auth/login" style={{ textDecoration: "none", background: "white", color: "black", fontWeight: 700, fontSize: 13, borderRadius: 8, padding: "9px 18px" }}>Sign up free →</Link>
                  <a href="https://education.github.com/pack" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "var(--bm-text3)", fontSize: 13, borderRadius: 8, padding: "9px 18px", border: "1px solid var(--bm-border2)" }}>Get Student Pack ↗</a>
                </div>
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 24, color: "var(--bm-text)" }}>One semester. One startup.</h2>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: "flex", gap: 18, padding: "18px 0", borderBottom: i < STEPS.length - 1 ? "1px solid var(--bm-border)" : "none" }}>
                <div style={{ flexShrink: 0, fontSize: 10, color: "var(--bm-text4)", fontFamily: "monospace", paddingTop: 3, width: 20 }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </section>

          <section style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.14)", borderRadius: 14, padding: "28px 32px", marginBottom: 64 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px" }}>The honest truth about student startups</h2>
            {["Most student startup ideas die because the founder tries to build everything before talking to a single user. BuildMind&apos;s first action for every idea-stage founder: talk to 5 people today.",
              "The gap between students who ship and those who don&apos;t is not intelligence — it&apos;s daily consistency. A 30-day streak beats a brilliant idea with no execution every time.",
              "You don&apos;t need a co-founder, funding, or a perfect idea. You need to do one thing today. Reflect on it tonight. Do the next thing tomorrow.",
              "The best time to build is at university — time, potential users nearby, and failure costs almost nothing. Most people wait until they have a salary to protect. Don&apos;t."].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < 3 ? 10 : 0 }}>
                <span style={{ color: "var(--bm-purple)", flexShrink: 0, marginTop: 2 }}>→</span>
                <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.7, margin: 0 }} dangerouslySetInnerHTML={{ __html: t }} />
              </div>
            ))}
          </section>

          <section style={{ textAlign: "center", padding: "0 0 80px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10, color: "var(--bm-text)" }}>One decision. Already made.</h2>
            <p style={{ fontSize: 14, color: "var(--bm-text3)", marginBottom: 24 }}>Sign up free. Your first action is waiting.</p>
            <Link href="/auth/login" style={{ textDecoration: "none", background: "white", color: "black", fontWeight: 700, fontSize: 14, borderRadius: 12, padding: "13px 32px", display: "inline-block" }}>
              Start building → free for students
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
