import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidCode, recordVisit, type SignalLink } from "@/lib/signalLinks";
import { cleanDesign, emptyDesign } from "@/lib/landing/design";
import { PublishedPage } from "@/components/landing/PublishedPage";

export const dynamic = "force-dynamic";

export default async function InterestPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isValidCode(code)) notFound();
  const admin = createAdminClient();
  // "*" so the page still loads before the design column exists; older pages then use the plain layout.
  const { data } = await admin.from("signal_links").select("*").eq("code", code).eq("kind", "interest").maybeSingle();
  const link = data as (SignalLink & { headline: string; pitch: string | null; design?: unknown }) | null;
  if (!link) notFound();

  try {
    const h = await headers();
    const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    await recordVisit(admin, link as SignalLink, { ip, ua: h.get("user-agent") ?? "" });
  } catch { /* counting is best effort */ }

  const design = (link.design ? cleanDesign(link.design) : null) ?? emptyDesign();
  return <PublishedPage headline={link.headline} pitch={link.pitch ?? ""} design={design} code={code} />;
}

export function generateMetadata() {
  return { title: "Join the early list", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}
