import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveFounderState, type FounderState, type SelfReport } from "@/lib/founderState";

/**
 * Gathers what BuildMind already knows about how the founder is doing, then
 * derives the state (lib/founderState.ts). Every read is best-effort: any
 * failure just means less evidence, never a broken request.
 */
export async function loadFounderState(
  admin: SupabaseClient | null,
  userId: string,
  opts: { clientHour?: number | null; now?: number } = {},
): Promise<FounderState> {
  const now = opts.now ?? Date.now();
  const since72 = new Date(now - 72 * 3_600_000).toISOString();
  const since48 = new Date(now - 48 * 3_600_000).toISOString();
  const dayStart = `${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`;

  let localHour: number | null = Number.isInteger(opts.clientHour) && (opts.clientHour as number) >= 0 && (opts.clientHour as number) <= 23 ? (opts.clientHour as number) : null;
  let selfReport: SelfReport | null = null;
  const texts: Array<{ text: string; at: string }> = [];
  const swaps: Array<{ reason: string | null; at: string }> = [];
  let recentOutcomes: string[] = [];
  let completedToday = 0;

  if (admin) {
    const [energy, refl, sw, ctx] = await Promise.allSettled([
      admin.from("user_behavior_state").select("value").eq("user_id", userId).eq("key", "founder_energy").maybeSingle(),
      admin.from("reflections").select("note, what_happened, blocker, outcome, created_at").eq("user_id", userId).gte("created_at", since72).order("created_at", { ascending: false }).limit(20),
      admin.from("today_swaps").select("reason, created_at").eq("user_id", userId).gte("created_at", since48).limit(20),
      localHour == null ? admin.from("founder_context").select("timezone_offset").eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    if (energy.status === "fulfilled") {
      const v = (energy.value as { data?: { value?: SelfReport } | null }).data?.value;
      if (v && typeof v.at === "string" && ["fresh", "ok", "low", "wiped"].includes(String(v.level))) selfReport = { level: v.level, at: v.at };
    }
    if (refl.status === "fulfilled") {
      const rows = ((refl.value as { data?: Array<{ note?: string | null; what_happened?: string | null; blocker?: string | null; outcome?: string | null; created_at: string }> | null }).data ?? []);
      for (const r of rows) {
        const text = [r.note, r.what_happened, r.blocker].filter(Boolean).join(" ");
        if (text) texts.push({ text, at: r.created_at });
      }
      recentOutcomes = rows.map((r) => String(r.outcome ?? "")).filter(Boolean);
      completedToday = rows.filter((r) => r.outcome === "completed" && r.created_at >= dayStart).length;
    }
    if (sw.status === "fulfilled") {
      for (const s of ((sw.value as { data?: Array<{ reason: string | null; created_at: string }> | null }).data ?? [])) swaps.push({ reason: s.reason, at: s.created_at });
    }
    if (localHour == null && ctx.status === "fulfilled") {
      const off = Number((ctx.value as { data?: { timezone_offset?: number } | null }).data?.timezone_offset);
      if (Number.isFinite(off)) localHour = (new Date(now).getUTCHours() + Math.round(off) + 24) % 24;
    }
  }

  return deriveFounderState({ now, localHour, selfReport, texts, swaps, recentOutcomes, completedToday });
}
