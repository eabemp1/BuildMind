import { ConfirmButton } from "./ConfirmButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

/**
 * Opening this page changes nothing: email scanners open links automatically, so the signup is confirmed
 * only when the person presses the button.
 */
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px 16px", background: "var(--bm-bg, #0e0e10)", color: "var(--bm-text, #f2f2f2)" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, lineHeight: 1.3, fontWeight: 700, margin: "0 0 10px" }}>Confirm your email</h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--bm-text2, #b4b4b8)", margin: "0 0 20px" }}>Press the button to finish joining the early list.</p>
        <ConfirmButton token={token} />
      </div>
    </main>
  );
}
