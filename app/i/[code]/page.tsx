import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidCode, recordVisit, type SignalLink } from "@/lib/signalLinks";
import { InterestForm } from "./InterestForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join the early list", robots: { index: false, follow: false } };

export default async function InterestPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isValidCode(code)) notFound();
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("signal_links")
    .select("id, user_id, code, kind, target_url, headline, pitch, label")
    .eq("code", code)
    .eq("kind", "interest")
    .maybeSingle();
  if (!link) notFound();

  try {
    const h = await headers();
    const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    await recordVisit(admin, link as SignalLink, { ip, ua: h.get("user-agent") ?? "" });
  } catch { /* counting is best effort */ }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px 16px", background: "var(--bm-bg, #0e0e10)", color: "var(--bm-text, #f2f2f2)" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <h1 style={{ fontSize: 24, lineHeight: 1.25, fontWeight: 700, margin: "0 0 10px", overflowWrap: "anywhere" }}>{link.headline}</h1>
        {link.pitch && <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--bm-text2, #b4b4b8)", margin: "0 0 22px", overflowWrap: "anywhere" }}>{link.pitch}</p>}
        <InterestForm code={code} />
        <p style={{ fontSize: 12, color: "var(--bm-text3, #85858b)", marginTop: 18, lineHeight: 1.5 }}>
          Your email goes only to the person who made this page. Made with BuildMind.
        </p>
      </div>
    </main>
  );
}
