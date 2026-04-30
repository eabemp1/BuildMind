import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | BuildMind",
  description: "BuildMind Privacy Policy — how we collect, use, and protect your personal information.",
};

const EFFECTIVE = "April 14, 2026";
const COMPANY   = "BuildMind";
const DOMAIN    = "buildmind.live";
const EMAIL     = "hello@buildmind.live";

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--bm-text3)" }}>
            Effective date: {EFFECTIVE}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          <Section title="1. Introduction">
            <p>{COMPANY} ("we," "us," or "our") operates the website <strong>{DOMAIN}</strong> and provides the BuildMind platform (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use our Service.</p>
            <p>By using the Service, you consent to the practices described in this Policy. If you do not agree, please discontinue use of the Service.</p>
          </Section>

          <Section title="2. Information We Collect">
            <p><strong>Information you provide directly:</strong></p>
            <ul>
              <li><strong>Account data</strong> — name, email address, and password when you register</li>
              <li><strong>Profile data</strong> — startup name, stage, industry, and goals you enter during onboarding</li>
              <li><strong>Project data</strong> — tasks, milestones, reflections, and notes you create in the Service</li>
              <li><strong>Payment data</strong> — billing information collected by Paystack; we do not store full card numbers</li>
              <li><strong>Communications</strong> — messages you send us via email or in-app support</li>
            </ul>
            <p><strong>Information collected automatically:</strong></p>
            <ul>
              <li><strong>Usage data</strong> — pages visited, features used, actions taken, timestamps</li>
              <li><strong>Device data</strong> — browser type, operating system, IP address, referring URLs</li>
              <li><strong>Cookies and local storage</strong> — used to maintain your session, remember preferences (theme, active project), and track streaks locally</li>
              <li><strong>Push notification tokens</strong> — if you opt in to browser push notifications</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use collected information to:</p>
            <ul>
              <li>Provide, operate, and improve the Service</li>
              <li>Generate personalised AI-powered daily actions, reports, and coaching based on your project data</li>
              <li>Process payments and manage your subscription</li>
              <li>Send transactional emails (account confirmation, password reset, payment receipts)</li>
              <li>Send product updates and feature announcements (you may opt out at any time)</li>
              <li>Detect and prevent fraud, abuse, and security incidents</li>
              <li>Comply with legal obligations</li>
              <li>Analyse aggregate, anonymised usage patterns to improve the product</li>
            </ul>
            <p>We do not sell your personal data to third parties. We do not use your data to train AI models without your explicit consent.</p>
          </Section>

          <Section title="4. AI and Your Data">
            <p>BuildMind uses AI models (provided by Anthropic) to generate daily actions, coaching responses, weekly reports, and other AI Content. To do this, we send relevant context — including your startup stage, task history, and reflection notes — to the AI provider as part of each request.</p>
            <p>This data is transmitted over encrypted connections and is governed by Anthropic's data usage policies. We do not share your name, email, or payment information with AI providers.</p>
            <p>AI responses are not stored beyond what is necessary to display them to you in the session.</p>
          </Section>

          <Section title="5. Sharing Your Information">
            <p>We share your information only in the following circumstances:</p>
            <ul>
              <li><strong>Service providers</strong> — Supabase (database hosting), Anthropic (AI inference), Paystack (payment processing), and infrastructure providers. These parties process data on our behalf under confidentiality obligations.</li>
              <li><strong>Legal requirements</strong> — if required by law, court order, or government authority</li>
              <li><strong>Business transfers</strong> — in the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity</li>
              <li><strong>With your consent</strong> — for example, if you opt in to the public Founder Feed, your displayed name and action summary become visible to other users</li>
            </ul>
            <p>We never sell, rent, or trade your personal information to third parties for marketing purposes.</p>
          </Section>

          <Section title="6. Cookies and Local Storage">
            <p>We use the following technologies to store data on your device:</p>
            <ul>
              <li><strong>Authentication cookies</strong> — set by Supabase to maintain your logged-in session (necessary; cannot be disabled without breaking the Service)</li>
              <li><strong>Preference storage</strong> — localStorage entries for theme, active project, streak data, and onboarding state (functional)</li>
              <li><strong>Analytics</strong> — we may use privacy-respecting analytics that do not set third-party tracking cookies</li>
            </ul>
            <p>You can clear cookies and local storage via your browser settings at any time. Doing so will log you out and reset your local preferences.</p>
          </Section>

          <Section title="7. Data Retention">
            <p>We retain your account and project data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where we are required to retain it for legal or accounting purposes (typically up to 7 years for transaction records).</p>
            <p>Aggregated, anonymised analytics data may be retained indefinitely as it cannot be used to identify you.</p>
          </Section>

          <Section title="8. Security">
            <p>We implement industry-standard security measures including:</p>
            <ul>
              <li>Encrypted data transmission using TLS/HTTPS</li>
              <li>Encrypted database storage via Supabase</li>
              <li>Row-level security policies so users can only access their own data</li>
              <li>Access controls limiting employee access to personal data</li>
            </ul>
            <p>No method of transmission or storage is 100% secure. If you suspect a security breach affecting your account, contact us immediately at <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a>.</p>
          </Section>

          <Section title="9. Your Rights">
            <p>Depending on your location, you may have the following rights regarding your personal data:</p>
            <ul>
              <li><strong>Access</strong> — request a copy of the data we hold about you</li>
              <li><strong>Correction</strong> — request correction of inaccurate data</li>
              <li><strong>Deletion</strong> — request deletion of your account and associated data</li>
              <li><strong>Portability</strong> — request an export of your project data in a machine-readable format</li>
              <li><strong>Objection</strong> — object to certain types of data processing</li>
              <li><strong>Withdraw consent</strong> — withdraw previously given consent (e.g., marketing emails)</li>
            </ul>
            <p>To exercise any of these rights, email us at <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a>. We will respond within 30 days.</p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>The Service is not directed to children under the age of 16. We do not knowingly collect personal information from children under 16. If we become aware that a child under 16 has provided us with personal data, we will delete it promptly. If you believe a child has submitted data to us, please contact us at <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a>.</p>
          </Section>

          <Section title="11. International Data Transfers">
            <p>BuildMind operates globally. Your data may be transferred to and processed in countries other than your own, including the United States. Where we transfer data internationally, we ensure appropriate safeguards are in place in accordance with applicable data protection laws.</p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>We may update this Privacy Policy periodically. We will notify you of material changes by posting the new policy on this page with an updated effective date and, for significant changes, by sending an email notification.</p>
          </Section>

          <Section title="13. Contact Us">
            <p>For any privacy-related questions, requests, or concerns, please contact us at:</p>
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "16px 18px", marginTop: 12 }}>
              <div style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 500 }}>{COMPANY} — Privacy</div>
              <a href={`mailto:${EMAIL}`} style={{ fontSize: 13, color: "var(--bm-accent)", textDecoration: "none" }}>{EMAIL}</a>
              <div style={{ fontSize: 13, color: "var(--bm-text3)", marginTop: 4 }}>{DOMAIN}</div>
            </div>
          </Section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid var(--bm-border)", display: "flex", gap: 24 }}>
          <a href="/legal/terms" style={{ fontSize: 13, color: "var(--bm-text3)", textDecoration: "none" }}>Terms of Service</a>
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
