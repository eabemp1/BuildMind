import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | BuildMind",
  description: "BuildMind Terms of Service — the rules that govern your use of the BuildMind platform.",
};

const EFFECTIVE = "April 14, 2026";
const COMPANY   = "BuildMind";
const DOMAIN    = "buildmind.live";
const EMAIL     = "hello@buildmind.live";

export default function TermsPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bm-bg)",
      color: "var(--bm-text)",
      fontFamily: "inherit",
      padding: "60px 24px 100px",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Back */}
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--bm-text3)", textDecoration: "none", marginBottom: 40 }}>
          ← Back to {COMPANY}
        </a>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 12 }}>
            Legal
          </div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--bm-text)", lineHeight: 1.15 }}>
            Terms of Service
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--bm-text3)" }}>
            Effective date: {EFFECTIVE}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          <Section title="1. Acceptance of Terms">
            <p>By accessing or using {COMPANY} at <strong>{DOMAIN}</strong> ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.</p>
            <p>We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the revised Terms. We will notify users of material changes via email or an in-app notice.</p>
          </Section>

          <Section title="2. Description of Service">
            <p>{COMPANY} is a daily execution engine for solo founders. The Service provides AI-generated daily actions, startup stage tracking, reflection logs, weekly reports, and community features to help founders build momentum.</p>
            <p>We offer both free and paid subscription plans. Features available under each plan are described on our pricing page and may change with reasonable notice.</p>
          </Section>

          <Section title="3. Eligibility">
            <p>You must be at least 16 years old and capable of forming a binding contract to use the Service. By using {COMPANY}, you represent that you meet these requirements.</p>
            <p>If you use the Service on behalf of a company or organisation, you represent that you have the authority to bind that entity to these Terms.</p>
          </Section>

          <Section title="4. Account Registration">
            <p>You must create an account to access most features. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account.</p>
            <p>You agree to provide accurate, current, and complete information and to update it as necessary. We reserve the right to suspend or terminate accounts with inaccurate information.</p>
          </Section>

          <Section title="5. Subscriptions and Payments">
            <p>Paid plans are billed on a recurring monthly or annual basis. By subscribing, you authorise us to charge your payment method on a recurring basis.</p>
            <p>Payments are processed by Paystack. Your payment information is transmitted directly to Paystack and is not stored on our servers.</p>
            <p>All fees are stated in US dollars and are exclusive of applicable taxes, which will be added at checkout where required by law.</p>
          </Section>

          <Section title="6. Cancellation and Refunds">
            <p>You may cancel your subscription at any time from your account settings. Cancellation takes effect at the end of your current billing period — you retain access until then.</p>
            <p>We offer a <strong>7-day refund window</strong> for first-time subscribers who are unsatisfied with the Service. To request a refund, email <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a> within 7 days of your initial charge. Refunds are not available for renewals or subsequent billing cycles.</p>
          </Section>

          <Section title="7. Acceptable Use">
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service for any unlawful purpose or in violation of any applicable law</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure</li>
              <li>Scrape, crawl, or extract data from the Service using automated means without our written permission</li>
              <li>Reverse-engineer, decompile, or disassemble any part of the Service</li>
              <li>Use the Service to distribute spam, malware, or harmful content</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
            </ul>
            <p>We reserve the right to suspend or permanently terminate any account that violates these rules, without prior notice.</p>
          </Section>

          <Section title="8. User Content">
            <p>You retain ownership of any content you submit to the Service, including project data, reflection notes, and startup descriptions ("User Content").</p>
            <p>By submitting User Content, you grant {COMPANY} a non-exclusive, royalty-free, worldwide licence to use, store, display, and process that content solely to provide and improve the Service. We will not sell your User Content to third parties.</p>
            <p>You are solely responsible for the accuracy and legality of your User Content.</p>
          </Section>

          <Section title="9. AI-Generated Content">
            <p>The Service uses artificial intelligence to generate recommendations, daily actions, reports, and other content ("AI Content"). AI Content is provided for informational and motivational purposes only and does not constitute professional business, legal, or financial advice.</p>
            <p>AI Content may occasionally be inaccurate or incomplete. You should apply your own judgment before acting on any AI-generated recommendation. {COMPANY} is not liable for decisions made based on AI Content.</p>
          </Section>

          <Section title="10. Intellectual Property">
            <p>The Service, including its design, code, trademarks, and content (excluding User Content), is owned by {COMPANY} and protected by applicable intellectual property laws.</p>
            <p>You may not copy, reproduce, or redistribute any part of the Service without our prior written consent.</p>
          </Section>

          <Section title="11. Privacy">
            <p>Your use of the Service is governed by our <a href="/legal/privacy" style={{ color: "var(--bm-accent)" }}>Privacy Policy</a>, which is incorporated into these Terms by reference. Please read it carefully to understand how we collect, use, and protect your personal information.</p>
          </Section>

          <Section title="12. Third-Party Services">
            <p>The Service integrates with third-party services including Supabase (database), Anthropic (AI), Paystack (payments), and others. Your use of these services is subject to their respective terms and privacy policies. We are not responsible for the practices of third-party services.</p>
          </Section>

          <Section title="13. Disclaimer of Warranties">
            <p>The Service is provided <strong>"as is"</strong> and <strong>"as available"</strong> without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>
            <p>We do not warrant that the Service will be uninterrupted, error-free, or free of viruses or other harmful components.</p>
          </Section>

          <Section title="14. Limitation of Liability">
            <p>To the maximum extent permitted by applicable law, {COMPANY} shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising from your use of or inability to use the Service.</p>
            <p>Our total aggregate liability to you for any claims arising under these Terms shall not exceed the greater of (a) the amount you paid us in the 12 months preceding the claim, or (b) USD $50.</p>
          </Section>

          <Section title="15. Indemnification">
            <p>You agree to indemnify and hold harmless {COMPANY} and its officers, employees, and agents from and against any claims, damages, losses, and expenses (including reasonable legal fees) arising from your use of the Service, your User Content, or your violation of these Terms.</p>
          </Section>

          <Section title="16. Termination">
            <p>We may suspend or terminate your account at any time for violation of these Terms, non-payment, or for any other reason at our sole discretion, with or without notice.</p>
            <p>You may terminate your account at any time by contacting us at <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a>. Upon termination, your right to use the Service ceases immediately.</p>
          </Section>

          <Section title="17. Governing Law">
            <p>These Terms are governed by and construed in accordance with applicable law. Any disputes shall be resolved through good-faith negotiation first, followed by binding arbitration if necessary. You waive any right to a jury trial or class action proceeding.</p>
          </Section>

          <Section title="18. Contact">
            <p>If you have questions about these Terms, please contact us at:</p>
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "16px 18px", marginTop: 12 }}>
              <div style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 500 }}>{COMPANY}</div>
              <a href={`mailto:${EMAIL}`} style={{ fontSize: 13, color: "var(--bm-accent)", textDecoration: "none" }}>{EMAIL}</a>
              <div style={{ fontSize: 13, color: "var(--bm-text3)", marginTop: 4 }}>{DOMAIN}</div>
            </div>
          </Section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid var(--bm-border)", display: "flex", gap: 24 }}>
          <a href="/legal/privacy" style={{ fontSize: 13, color: "var(--bm-text3)", textDecoration: "none" }}>Privacy Policy</a>
          <a href="/refund"  style={{ fontSize: 13, color: "var(--bm-text3)", textDecoration: "none" }}>Refund Policy</a>
          <a href="/pricing" style={{ fontSize: 13, color: "var(--bm-text3)", textDecoration: "none" }}>Pricing</a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 600, color: "var(--bm-text)", letterSpacing: "-0.02em" }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.8, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </section>
  );
}
