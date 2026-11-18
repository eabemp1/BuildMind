/**
 * lib/conversations/toExperiment.ts: a status the founder sets in the conversation tracker is something they confirm
 * happened, so it is also recorded as evidence in their running experiment. Nothing is inferred: "to contact" records nothing,
 * and a person is only counted for the state the founder moved them to. Retry-safe: one entry per person and state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventKind } from "@/lib/experiments";
import type { PersonStatus } from "@/lib/conversations/track";
import { loadTestMode } from "@/lib/testMode";
import { EVENT_COLS } from "@/lib/experimentsServer";

const MAP: Partial<Record<PersonStatus, { kind: EventKind; detail: string }>> = {
  sent: { kind: "sent", detail: "Message sent (from the conversation tracker)" },
  replied: { kind: "replied", detail: "Replied (from the conversation tracker)" },
  booked: { kind: "replied", detail: "Replied and a call is booked (from the conversation tracker)" },
  done: { kind: "conversation", detail: "Had the conversation (from the conversation tracker)" },
  no_reply: { kind: "no_reply", detail: "No reply (from the conversation tracker)" },
};

/** Pure: the experiment entry for a tracker status, or null when nothing should be recorded. */
export function eventForStatus(personId: string, name: string, status: PersonStatus, notes?: string | null): { who: string; kind: EventKind; detail: string; clientKey: string } | null {
  const m = MAP[status];
  if (!m || !name.trim()) return null;
  const n = (notes ?? "").replace(/\s+/g, " ").trim();
  const detail = status === "done" && n ? `${m.detail}. Notes: ${n}`.slice(0, 400) : m.detail;
  return { who: name.trim().slice(0, 80), kind: m.kind, detail, clientKey: `conv-${personId}-${status}` };
}

/** Records the entry in the founder's running experiment for that project. Never throws; returns whether one was saved. */
export async function mirrorToExperiment(admin: SupabaseClient, userId: string, person: { id: string; name: string; project_id?: string | null; notes?: string | null }, status: PersonStatus): Promise<boolean> {
  try {
    const ev = eventForStatus(person.id, person.name, status, person.notes);
    if (!ev) return false;
    let q = admin.from("customer_experiments").select("id").eq("user_id", userId).eq("status", "running").order("updated_at", { ascending: false }).limit(1);
    if (person.project_id) q = q.eq("project_id", person.project_id);
    const exp = (await q).data?.[0] as { id: string } | undefined;
    if (!exp) return false;
    const { data: dup } = await admin.from("experiment_events").select("id").eq("user_id", userId).eq("client_key", ev.clientKey).maybeSingle();
    if (dup) return false;
    const synthetic = await loadTestMode(admin, userId);
    const { error } = await admin.from("experiment_events").insert({ experiment_id: exp.id, user_id: userId, who: ev.who, kind: ev.kind, detail: ev.detail, client_key: ev.clientKey, synthetic });
    if (error) return false;
    await admin.from("customer_experiments").update({ updated_at: new Date().toISOString() }).eq("id", exp.id).eq("user_id", userId);
    return true;
  } catch {
    return false;
  }
}
