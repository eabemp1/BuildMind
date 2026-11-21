/** GET /o/[slug]/go — counts one click on the offer button, then sends the visitor to the founder's own contact. */
import { createAdminClient } from "@/lib/supabase/admin";
import { contactHref, type OfferContent } from "@/lib/offers/page";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return new Response("Not found", { status: 404 });
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("offer_pages").select("content").eq("slug", slug).eq("status", "published").maybeSingle();
    const contact = (data as { content: OfferContent } | null)?.content?.contact;
    if (!contact) return new Response("Not found", { status: 404 });
    await admin.rpc("bm_offer_count", { p_slug: slug, p_kind: "click" });
    return new Response(null, { status: 302, headers: { Location: contactHref(contact), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
