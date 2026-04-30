import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | BuildMind",
  description: "BuildMind Refund Policy — our fair and transparent policy on subscription refunds.",
};

const EFFECTIVE = "April 14, 2026";
const COMPANY   = "BuildMind";
const DOMAIN    = "buildmind.live";
const EMAIL     = "hello@buildmind.live";

export default function RefundPage() {
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
            Refund Policy
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--bm-text3)" }}>
            Effective date: {EFFECTIVE}
          </p>
        </div>

        {/* TL;DR card */}
        <div style={{
          background: "rgba(111,207,151,0.06)",
          border: "1px solid rgba(111,207,151,0.2)",
          borderRadius: 14,
          padding: "20px 22px",
          marginBottom: 48,
        }}>
          <div style={{ fontSize: 11, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>
            TL;DR
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.7 }}>
            New subscribers get a <strong style={{ color: "var(--bm-text)" }}>7-day money-back guarantee</strong>. If you're not happy with your first subscription, email us within 7 days of your first charge and we'll refund you in full — no questions asked. After that window, subscriptions are non-refundable but you keep access until the end of your billing period.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          <Section title="1. Scope">
            <p>This Refund Policy applies to all paid subscriptions purchased on <strong>{DOMAIN}</strong> for the {COMPANY} platform. It does not apply to any third-party products or services accessed through the platform.</p>
          </Section>

          <Section title="2. 7-Day Money-Back Guarantee">
            <p>We offer a full refund within <strong>7 calendar days</strong> of your <strong>first subscription payment</strong>. To qualify:</p>
            <ul>
              <li>The refund request must be submitted within 7 days of the initial charge</li>
              <li>This applies to first-time Builder or Venture plan subscribers only</li>
              <li>The guarantee is limited to one refund per customer</li>
            </ul>
            <p>To request a refund under this guarantee, email <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a> with your registered email address and the subject line <strong>"Refund Request"</strong>. We will process your refund within 5–10 business days. Refunds are returned to the original payment method.</p>
          </Section>

          <Section title="3. Renewals">
            <p>Subscription renewals (monthly or annual) are <strong>non-refundable</strong>. When your subscription renews, you will receive a reminder email at least 3 days in advance. You can cancel before renewal takes effect to avoid being charged.</p>
            <p>If you are charged for a renewal you intended to cancel, please contact us within <strong>48 hours</strong> of the renewal charge and we will review your case on a discretionary basis.</p>
          </Section>

          <Section title="4. Annual Plans">
            <p>For annual subscriptions, the 7-day money-back guarantee applies from the date of the first annual payment. We do not offer pro-rated refunds for the unused portion of an annual subscription after the 7-day window has passed.</p>
            <p>We strongly recommend starting with a monthly plan if you are unsure about long-term commitment.</p>
          </Section>

          <Section title="5. Exceptional Circumstances">
            <p>Outside the standard 7-day window, we may offer refunds in exceptional cases, including:</p>
            <ul>
              <li>Extended Service outages (more than 72 consecutive hours) directly caused by us</li>
              <li>Duplicate charges or billing errors on our part</li>
              <li>Demonstrable technical issues that prevented access to the Service for an unreasonable period</li>
            </ul>
            <p>These cases are reviewed individually. We aim to respond to all refund requests within 3 business days.</p>
          </Section>

          <Section title="6. How to Request a Refund">
            <p>All refund requests should be sent to <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a> and must include:</p>
            <ul>
              <li>Your name and the email address associated with your {COMPANY} account</li>
              <li>The date of the charge you are requesting a refund for</li>
              <li>A brief reason for your request (optional but helpful)</li>
            </ul>
            <p>We do not accept refund requests via social media or in-app chat — email is the only valid channel.</p>
          </Section>

          <Section title="7. Cancellations">
            <p>Cancelling your subscription is different from requesting a refund. When you cancel:</p>
            <ul>
              <li>Your subscription will not renew at the next billing date</li>
              <li>You retain full access to your paid plan until the end of the current billing period</li>
              <li>No further charges will be made</li>
            </ul>
            <p>You can cancel anytime from <strong>Settings → Plan</strong> in your {COMPANY} account, or by emailing <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a>.</p>
          </Section>

          <Section title="8. Payment Processors">
            <p>Payments are processed by Paddle (for international users) or Paystack (for users in Africa). Refunds are issued through the same processor that handled the original payment. Processing times vary by provider:</p>
            <ul>
              <li><strong>Paddle</strong>: 5–10 business days to appear on your statement</li>
              <li><strong>Paystack</strong>: 3–7 business days to appear on your statement</li>
            </ul>
            <p>We are not responsible for delays caused by your bank or card issuer.</p>
          </Section>

          <Section title="9. Disputes">
            <p>If you have a billing dispute, please contact us at <a href={`mailto:${EMAIL}`} style={{ color: "var(--bm-accent)" }}>{EMAIL}</a> before initiating a chargeback with your bank. We are committed to resolving issues fairly and quickly.</p>
            <p>Initiating a chargeback without first contacting us may result in your account being suspended pending resolution.</p>
          </Section>

          <Section title="10. Contact">
            <p>For refund requests or billing questions, reach us at:</p>
            <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "16px 18px", marginTop: 12 }}>
              <div style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 500 }}>{COMPANY} — Billing Support</div>
              <a href={`mailto:${EMAIL}`} style={{ fontSize: 13, color: "var(--bm-accent)", textDecoration: "none" }}>{EMAIL}</a>
              <div style={{ fontSize: 13, color: "var(--bm-text3)", marginTop: 4 }}>{DOMAIN}</div>
            </div>
          </Section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid var(--bm-border)", display: "flex", gap: 24 }}>
          <a href="/legal/terms" style={{ fontSize: 13, color: "var(--bm-text3)", textDecoration: "none" }}>Terms of Service</a>
          <a href="/legal/privacy" style={{ fontSize: 13, color: "var(--bm-text3)", textDecoration: "none" }}>Privacy Policy</a>
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
