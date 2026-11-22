/**
 * lib/leads/save.ts: saving found leads, and saying plainly why writing them failed. SERVER-SIDE ONLY.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead } from "@/lib/leads/validate";
import type { ProductBrief } from "@/lib/leads/plan";

/** Why the AI step failed, in words a founder can act on. Pure. */
export function generationFailure(modelError: string | undefined, timedOut = false): string {
  const e = (modelError ?? "").toLowerCase();
  const why = timedOut ? "took too long"
    : /429|rate.?limit|quota|too many requests|busy|overload/.test(e) ? "was busy and refused the request (a rate limit)"
    : /timeout|timed out|abort/.test(e) ? "took too long"
    : "failed";
  return `The pages were found and read, but the step that writes the leads ${why}. Nothing was lost: you can retry writing the leads without searching again.`;
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
/** The page address without the product tag that keeps one-off batches for different products apart. Pure. */
export const plainUrl = (u: string) => u.replace(/#for-[a-z0-9-]*$/, "");

/**
 * Saves leads for one batch. Returns how many could not be saved. Select-then-write: the unique index is on an
 * expression (user, project, url), so a one-off search for a second product that finds the same page is stored under
 * "<url>#for-<product>". Without that, the second search overwrote the first product's saved lead and its draft.
 */
export async function saveLeads(
  admin: SupabaseClient,
  a: { userId: string; projectId: string | null; country: string; city: string; product?: ProductBrief; leads: Lead[] },
): Promise<number> {
  let failed = 0;
  for (const l of a.leads) {
    const scoped = !a.projectId && a.product?.name ? `${l.url}#for-${slug(a.product.name)}` : l.url;
    const find = async (url: string) => {
      let q = admin.from("lead_results").select("id,payload").eq("user_id", a.userId).eq("lead_url", url);
      q = a.projectId ? q.eq("project_id", a.projectId) : q.is("project_id", null);
      return (await q.limit(1).maybeSingle()).data as { id?: string; payload?: { brief?: { name?: string } } } | null;
    };
    let existing = await find(scoped);
    let key = scoped;
    // Rows saved before products were tagged sit under the plain url: reuse one only if it is this same product's.
    if (!existing?.id && scoped !== l.url) {
      const old = await find(l.url);
      if (old?.id && sameProduct(old.payload?.brief?.name, a.product?.name)) { existing = old; key = l.url; }
    }
    // The product name travels with each lead, so a one-off batch is always listed under its own product.
    const payload = a.product ? { ...l, brief: { name: a.product.name } } : l;
    const row = { country: a.country, city: a.city, lead_name: l.name, lead_kind: l.kind, payload, updated_at: new Date().toISOString() };
    const { error } = existing?.id
      ? await admin.from("lead_results").update(row).eq("id", existing.id)
      : await admin.from("lead_results").insert({ user_id: a.userId, project_id: a.projectId, lead_url: key, ...row });
    if (error) { failed++; console.error("[leads] save failed:", error.message); }
  }
  return failed;
}

/** Same product name, ignoring case and spacing. Pure. */
export function sameProduct(a?: string | null, b?: string | null): boolean {
  const n = (x?: string | null) => (x ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return n(a) !== "" && n(a) === n(b);
}

/** True when a search read something a retry can work from. Pure. */
export function hasMaterial(sink: { material?: { pages?: unknown[]; places?: unknown[] } }): boolean {
  return Boolean(sink.material && ((sink.material.pages?.length ?? 0) > 0 || (sink.material.places?.length ?? 0) > 0));
}
