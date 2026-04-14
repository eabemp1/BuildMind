import Link from "next/link";

const cardStyle = {
  border: "1px solid var(--bm-border2)",
  borderRadius: "14px",
  padding: "16px",
  background: "rgba(255,255,255,0.02)",
};

export default function LegalHomePage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 64px" }}>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Legal</h1>
      <p style={{ color: "var(--bm-text3)", marginBottom: 24 }}>
        BuildMind legal pages and policy references.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Privacy Policy</h2>
          <p style={{ color: "var(--bm-text3)", marginBottom: 12 }}>How we collect, use, and protect your data.</p>
          <Link href="/privacy">Read policy</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Terms of Service</h2>
          <p style={{ color: "var(--bm-text3)", marginBottom: 12 }}>Rules and conditions for using BuildMind.</p>
          <Link href="/terms">Read terms</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Refund Policy</h2>
          <p style={{ color: "var(--bm-text3)", marginBottom: 12 }}>How refunds and cancellations work for paid plans.</p>
          <Link href="/refund">Read policy</Link>
        </div>
      </div>
    </main>
  );
}
