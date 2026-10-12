"use client";

/**
 * components/layout/side-pane-context.tsx
 *
 * The side-by-side pane. Any page can call `openPane(...)` to put a detail view
 * (the AI coach, an insight, a project or task, an agent's output) next to the
 * page the founder is on, instead of navigating away and losing their place.
 *
 * Outside a provider the hook returns no-ops, so components that call it still
 * render in tests and in places that are not inside the app shell.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface PaneFact { label: string; value: string }

export type PaneRequest =
  | { kind: "coach"; title?: string; prompt?: string }
  | {
      kind: "reader";
      title: string;
      eyebrow?: string;
      subtitle?: string;
      markdown: string;
      facts?: PaneFact[];
      href?: string;
      hrefLabel?: string;
    }
  | { kind: "project"; projectId: string; title?: string; taskId?: string };

export type OpenPane = PaneRequest & { key: number };

export interface CoachChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
}

interface SidePaneApi {
  pane: OpenPane | null;
  openPane: (req: PaneRequest) => void;
  closePane: () => void;
  width: number;
  setWidth: (w: number) => void;
  coachMessages: CoachChatMessage[];
  setCoachMessages: React.Dispatch<React.SetStateAction<CoachChatMessage[]>>;
}

export const PANE_MIN = 340;
export const PANE_MAX = 760;
const PANE_DEFAULT = 440;
const WIDTH_KEY = "bm_side_pane_width";

const noop: SidePaneApi = {
  pane: null, openPane: () => {}, closePane: () => {}, width: PANE_DEFAULT, setWidth: () => {},
  coachMessages: [], setCoachMessages: () => {},
};

const Ctx = createContext<SidePaneApi>(noop);

export function useSidePane(): SidePaneApi {
  return useContext(Ctx);
}

export function clampPaneWidth(w: number): number {
  return Math.min(PANE_MAX, Math.max(PANE_MIN, Math.round(w)));
}

export function SidePaneProvider({ children }: { children: React.ReactNode }) {
  const [pane, setPane] = useState<OpenPane | null>(null);
  const [width, setWidthState] = useState(PANE_DEFAULT);
  const [coachMessages, setCoachMessages] = useState<CoachChatMessage[]>([]);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) setWidthState(clampPaneWidth(saved));
    } catch { /* storage unavailable */ }
  }, []);

  const setWidth = useCallback((w: number) => {
    const next = clampPaneWidth(w);
    setWidthState(next);
    try { window.localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* ignore */ }
  }, []);

  const openPane = useCallback((req: PaneRequest) => setPane({ ...req, key: Date.now() }), []);
  const closePane = useCallback(() => setPane(null), []);

  useEffect(() => {
    if (!pane) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPane(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pane]);

  const value = useMemo<SidePaneApi>(
    () => ({ pane, openPane, closePane, width, setWidth, coachMessages, setCoachMessages }),
    [pane, openPane, closePane, width, setWidth, coachMessages],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
