import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidCode } from "@/lib/signalLinks";
import { VerifyButton } from "./VerifyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm", robots: { index: false, follow: false } };

const PHRASE: Record<string, string> = {
  reply: "replied to a message from them",
  conversation: "had a conversation with them",
  call: "had a call with them",
};

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isValidCode(code)) notFound();
  const { data: link } = await createAdminClient().from("signal_links").select("claim_kind, label").eq("code", code).eq("kind", "confirm").maybeSingle();
  if (!link) notFound();
  const what = PHRASE[String(link.claim_kind)] ?? "were in touch with them";
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px 16px", background: "var(--bm-bg, #0e0e10)", color: "var(--bm-text, #f2f2f2)" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, lineHeight: 1.3, fontWeight: 700, margin: "0 0 10px" }}>A quick confirmation</h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--bm-text2, #b4b4b8)", margin: "0 0 20px", overflowWrap: "anywhere" }}>
          A founder using BuildMind says you {what}. Only confirm if that is true. It takes one tap and shares nothing about you.
        </p>
        <VerifyButton code={code} />
      </div>
    </main>
  );
}
