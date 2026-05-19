"use client";

type BehaviorValues = Record<string, unknown>;

export async function fetchBehaviorState<T extends BehaviorValues>(keys: string[]): Promise<Partial<T>> {
  if (typeof window === "undefined" || keys.length === 0) return {};
  try {
    const res = await fetch(`/api/user/behavior-state?keys=${encodeURIComponent(keys.join(","))}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return {};
    const payload = await res.json().catch(() => null) as { ok?: boolean; values?: Partial<T> } | null;
    return payload?.ok ? (payload.values ?? {}) : {};
  } catch {
    return {};
  }
}

export function persistBehaviorState(values: BehaviorValues): void {
  if (typeof window === "undefined") return;
  fetch("/api/user/behavior-state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  }).catch(() => {});
}
