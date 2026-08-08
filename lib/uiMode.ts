"use client";

/**
 * lib/uiMode.ts — Lite / Pro display density
 *
 * "Lite"  = the existing, focused Today experience (the current architecture
 *           before the Founder Intelligence OS visual rebuild). Default for
 *           everyone, especially first-time founders who'd be overwhelmed by
 *           a dense intelligence surface on day one.
 * "Pro"   = the deeper Founder Intelligence OS layer (IntelligencePanel,
 *           What Changed, Risks & Gaps, full metric row, evidence/"Why?").
 *
 * This is a per-device DISPLAY preference, not a plan/paywall gate — it uses
 * the same storage semantics as bm_theme (see lib/storage.ts GLOBAL_KEYS).
 * It does not change what data is fetched or how the backend/intelligence
 * engine behaves; it only controls how much of it renders.
 */

import { useCallback, useEffect, useState } from "react";
import { storage } from "@/lib/storage";

export type UIMode = "lite" | "pro";

const KEY = "bm_ui_mode";

export function getUIMode(): UIMode {
  if (typeof window === "undefined") return "lite";
  const v = storage.get(KEY);
  return v === "pro" ? "pro" : "lite";
}

export function setUIModeGlobal(mode: UIMode) {
  storage.set(KEY, mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bm-ui-mode-change", { detail: mode }));
  }
}

/** React hook: reads bm_ui_mode, stays in sync across tabs/components in the same page. */
export function useUIMode(): [UIMode, (mode: UIMode) => void] {
  const [mode, setMode] = useState<UIMode>("lite");

  useEffect(() => {
    setMode(getUIMode());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<UIMode>).detail;
      if (detail) setMode(detail);
    };
    window.addEventListener("bm-ui-mode-change", onChange);
    return () => window.removeEventListener("bm-ui-mode-change", onChange);
  }, []);

  const update = useCallback((next: UIMode) => {
    setUIModeGlobal(next);
    setMode(next);
  }, []);

  return [mode, update];
}
