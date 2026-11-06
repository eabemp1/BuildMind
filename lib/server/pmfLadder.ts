/** Loads the real rows the PMF ladder reads. Read-only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConnectedFacts } from "@/lib/integrations/facts";
import { buildPmfVisual, type PmfInputs } from "@/lib/pmf/ladder";

export async function loadPmfInputs(admin: SupabaseClient, userId: string, projectId: string): Promise<PmfInputs> {
  const [people, work, facts] = await Promise.all([
    admin.from("conversation_people").select("status,project_id").eq("user_id", userId).limit(500).then((r) => r, () => ({ data: null })),
    admin.from("prepared_work").select("outcome").eq("user_id", userId).limit(400).then((r) => r, () => ({ data: null })),
    loadConnectedFacts(admin, userId, { maxAgeMs: 6 * 3600_000 }).catch(() => null),
  ]);
  const all = ((people.data ?? []) as Array<{ status: string; project_id: string | null }>);
  // People with no project attached still count; people tied to another project do not.
  const mine = all.filter((p) => !p.project_id || p.project_id === projectId).map((p) => ({ status: p.status }));
  return {
    people: mine,
    outcomes: ((work.data ?? []) as Array<{ outcome: string | null }>).map((r) => r.outcome),
    revenue: (facts?.revenue ?? []).map((r) => {
      const s = r as unknown as { provider?: string; mode?: "live" | "test"; payingCustomers?: number; paymentsLast30d?: number; selfReported?: boolean };
      return { provider: s.provider ?? "revenue", mode: s.mode, selfReported: s.selfReported, payingCustomers: s.payingCustomers ?? 0, paymentsLast30d: s.paymentsLast30d ?? 0 };
    }),
    search: facts?.search ? { clicks: facts.search.clicks } : null,
  };
}

export async function loadPmfVisual(admin: SupabaseClient, userId: string, projectId: string, now?: Date) {
  return buildPmfVisual(await loadPmfInputs(admin, userId, projectId), now);
}
