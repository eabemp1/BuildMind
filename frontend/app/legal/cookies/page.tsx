import Link from "next/link";

export default function CookiePolicyPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 72px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Cookie Policy</h1>
      <p style={{ color: "var(--bm-text3)", marginBottom: 20 }}>Last updated: April 14, 2026</p>

      <h2>1. What Are Cookies</h2>
      <p>
        Cookies are small text files stored on your device that help websites remember preferences and improve user experience.
      </p>

      <h2>2. How BuildMind Uses Cookies</h2>
      <p>
        We use cookies and similar storage for authentication state, essential functionality, analytics, and performance diagnostics.
      </p>

      <h2>3. Managing Cookies</h2>
      <p>
        You can control cookies through your browser settings. Disabling essential cookies may affect product functionality.
      </p>

      <h2>4. Third-Party Cookies</h2>
      <p>
        Some integrated providers may set their own cookies in connection with analytics, payment, or support features.
      </p>

      <h2>5. Contact</h2>
      <p>
        For cookie-related questions, contact support@buildmind.live.
      </p>

      <p style={{ marginTop: 24 }}>
        <Link href="/legal">Back to legal</Link>
      </p>
    </main>
  );
}
