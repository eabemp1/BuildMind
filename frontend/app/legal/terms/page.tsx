import Link from "next/link";

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 72px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ color: "var(--bm-text3)", marginBottom: 20 }}>Last updated: April 14, 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By using BuildMind, you agree to these Terms of Service and any applicable policies referenced here.
      </p>

      <h2>2. Account Responsibilities</h2>
      <p>
        You are responsible for maintaining account security and for activities performed under your account.
      </p>

      <h2>3. Acceptable Use</h2>
      <p>
        You agree not to misuse the service, interfere with platform operations, or violate applicable laws.
      </p>

      <h2>4. Subscriptions and Billing</h2>
      <p>
        Paid features are billed according to your selected plan. You may cancel according to the billing terms shown at checkout.
      </p>

      <h2>5. Intellectual Property</h2>
      <p>
        BuildMind and its content are protected by intellectual property laws. You retain rights to content you provide.
      </p>

      <h2>6. Disclaimer</h2>
      <p>
        BuildMind is provided on an "as is" and "as available" basis without warranties to the fullest extent permitted by law.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        To the extent permitted by law, BuildMind is not liable for indirect, incidental, or consequential damages arising from use of the platform.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about these terms: support@buildmind.live.
      </p>

      <p style={{ marginTop: 24 }}>
        <Link href="/legal">Back to legal</Link>
      </p>
    </main>
  );
}
