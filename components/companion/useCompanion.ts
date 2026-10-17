"use client";

import { cachedRead, invalidateRead } from "@/lib/shellCache";
import { useCallback, useEffect, useState } from "react";
import type { ShapedMoment, Style } from "@/lib/companion/moments";
import type { Intensity } from "@/lib/companion/policy";

export interface CompanionData {
  style: Style;
  intensity: Intensity;
  cap: number;
  styles: Array<{ key: Style; label: string; tagline: string; color: string }>;
  moments: ShapedMoment[];
}

const REFRESH = "bm-companion-refresh";

/** One shared read of the Co-founder brief; any component can ask everyone to reload. */
export function useCompanion(projectId?: string | null) {
  const [data, setData] = useState<CompanionData | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      if (force) invalidateRead("companion:");
      const j = await cachedRead(`companion:${qs}`, 90_000, async () => {
        const r = await fetch(`/api/companion/brief${qs}`, { cache: "no-store" });
        return r.ok ? await r.json() : null;
      });
      if (j?.ok && Array.isArray(j.moments)) setData(j as CompanionData);
    } catch { /* the Co-founder is optional; stay quiet */ }
  }, [projectId]);

  useEffect(() => {
    void load();
    const on = () => void load(true);
    window.addEventListener(REFRESH, on);
    const vis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener(REFRESH, on); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  const send = useCallback(async (key: string, status: "dismissed" | "acted") => {
    setData((d) => (d ? { ...d, moments: d.moments.filter((m) => m.key !== key) } : d));
    try {
      await fetch("/api/companion/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, status }) });
    } catch { /* best-effort */ }
  }, []);

  const saveSettings = useCallback(async (patch: { style?: Style; intensity?: Intensity }) => {
    try {
      await fetch("/api/companion/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    } finally {
      window.dispatchEvent(new Event(REFRESH));
    }
  }, []);

  return { data, reload: load, dismiss: (k: string) => send(k, "dismissed"), acted: (k: string) => send(k, "acted"), saveSettings };
}
