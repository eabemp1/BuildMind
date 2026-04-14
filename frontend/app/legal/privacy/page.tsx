import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 72px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: "var(--bm-text3)", marginBottom: 20 }}>Last updated: April 14, 2026</p>

      <p>
        This Privacy Policy explains how BuildMind collects, uses, and safeguards information when you use the platform.
      </p>

      <h2>1. Information We Collect</h2>
      <p>
        We may collect account information, usage activity, project content you provide, and technical telemetry needed to operate and improve the service.
      </p>

      <h2>2. How We Use Information</h2>
      <p>
        We use information to provide the product, personalize features, process billing, maintain security, and support users.
      </p>

      <h2>3. Data Storage and Security</h2>
      <p>
        We use reasonable technical and organizational safeguards to protect data. No security method is perfect, but we continuously improve controls.
      </p>

      <h2>4. Third-Party Services</h2>
      <p>
        BuildMind may rely on third-party providers for infrastructure, analytics, authentication, and payments. Those providers process data according to their own policies.
      </p>

      <h2>5. Your Rights</h2>
      <p>
        You can request access, correction, or deletion of your personal information, subject to legal and operational requirements.
      </p>

      <h2>6. Contact</h2>
      <p>
        For privacy inquiries, contact support@buildmind.live.
      </p>

      <p style={{ marginTop: 24 }}>
        <Link href="/legal">Back to legal</Link>
      </p>
    </main>
  );
}
