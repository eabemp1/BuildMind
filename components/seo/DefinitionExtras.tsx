import React from "react";
import Link from "next/link";
import { EXTRAS } from "@/lib/seo/definitionContent";

type Key = keyof typeof EXTRAS;
const H2 = { fontSize: 18, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 16px", letterSpacing: "-0.01em" } as const;
const P = { fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, margin: "0 0 14px" } as const;

/** Extra sections, a visible FAQ (with matching FAQPage JSON-LD) and a soft CTA. */
export function DefinitionExtras({ page }: { page: Key }) {
  const { sections, faq } = EXTRAS[page];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      {sections.map((s) => (
        <section key={s.heading} style={{ marginTop: 48 }}>
          <h2 style={H2}>{s.heading}</h2>
          {s.paragraphs.map((p, i) => <p key={i} style={P}>{p}</p>)}
          {s.bullets && (
            <ul style={{ margin: "0 0 14px", paddingLeft: 20 }}>
              {s.bullets.map((b) => <li key={b} style={{ fontSize: 15, color: "var(--bm-text2)", lineHeight: 1.8, marginBottom: 6 }}>{b}</li>)}
            </ul>
          )}
        </section>
      ))}

      <section style={{ marginTop: 48 }}>
        <h2 style={H2}>Common questions</h2>
        {faq.map((f) => (
          <div key={f.q} style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--bm-text)", margin: "0 0 6px" }}>{f.q}</h3>
            <p style={{ ...P, margin: 0 }}>{f.a}</p>
          </div>
        ))}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </section>

      <section style={{ marginTop: 48, border: "1px solid var(--bm-border2)", borderRadius: 12, padding: "18px 20px" }}>
        <h2 style={{ ...H2, fontSize: 16, margin: "0 0 8px" }}>Try it on your own startup</h2>
        <p style={{ ...P, margin: "0 0 12px" }}>
          Paste your idea into the free stress test and get a scored read in about 30 seconds, with the weakest spot to test first. No account needed.
        </p>
        <Link href="/break" style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", textDecoration: "none", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 14px", display: "inline-block" }}>
          Break My Startup →
        </Link>
      </section>
    </>
  );
}
