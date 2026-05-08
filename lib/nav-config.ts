/**
 * lib/nav-config.ts — Progressive nav unlock
 *
 * Nav items are gated by tasksCompleted milestone so new users
 * only see what's relevant at their stage. The sidebar reads
 * localStorage("bm_tasks_completed_total") which is written by
 * the today page on every check-in.
 *
 * Unlock thresholds:
 *   0  tasks  → Today only
 *   1  task   → + Reflect
 *   3  tasks  → + Overview, Projects, Ventures
 *   7  tasks  → + AI Tools, Reports, Achievements, Invite
 *  14  tasks  → everything
 */

import type { Plan } from "@/lib/plan";
import type { ElementType } from "react";

export type NavItemConfig = {
  href: string;
  label: string;
  icon: ElementType<{ size?: number }>;
  enabled: boolean;
  section: string | null;
  badge: string | null;
  showDot: boolean;
  requiredPlan?: Plan;
  unlocksAt?: number; // tasks completed threshold
};

const iconStub = (_name: string): ElementType<{ size?: number }> => function NavIcon() { return null; };

export const NAV: readonly NavItemConfig[] = [
  // Always visible — the core loop
  { href: "/today",            label: "Today",          icon: iconStub("Zap"),             enabled: true,  section: "DAILY",     badge: null,      showDot: false, unlocksAt: 0 },
  { href: "/reflect",          label: "Reflect",        icon: iconStub("RefreshCw"),       enabled: true,  section: null,        badge: null,      showDot: true,  unlocksAt: 1 },

  // Unlocks after 3 tasks — they've seen the product work
  { href: "/overview",         label: "Overview",       icon: iconStub("LayoutDashboard"), enabled: true,  section: "WORKSPACE", badge: null,      showDot: false, unlocksAt: 3 },
  { href: "/projects",         label: "Projects",       icon: iconStub("FolderKanban"),    enabled: true,  section: null,        badge: null,      showDot: false, unlocksAt: 3 },
  { href: "/ventures",         label: "Ventures",       icon: iconStub("Map"),             enabled: true,  section: null,        badge: "New",     showDot: false, unlocksAt: 3 },

  // Unlocks after 7 tasks — they're retained, show power features
  { href: "/ai-coach",         label: "AI Coach",       icon: iconStub("Bot"),             enabled: true,  section: "AI TOOLS",  badge: null,      showDot: false, unlocksAt: 7 },
  { href: "/break-my-startup", label: "Break Startup",  icon: iconStub("Flame"),           enabled: true,  section: null,        badge: null,      showDot: false, unlocksAt: 7 },
  { href: "/startup-kit",      label: "Startup Kit",    icon: iconStub("Lightbulb"),       enabled: false, section: null,        badge: null,      requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/reports",          label: "Reports",        icon: iconStub("LineChart"),       enabled: true,  section: null,        badge: null,      requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/achievements",     label: "Achievements",   icon: iconStub("Trophy"),          enabled: true,  section: "ACCOUNT",   badge: null,      showDot: false, unlocksAt: 7 },
  { href: "/invite",           label: "Invite & Earn",  icon: iconStub("Users"),           enabled: true,  section: null,        badge: "Free mo", showDot: false, unlocksAt: 7 },

  // Always at bottom
  { href: "/explore",          label: "Founder Feed",   icon: iconStub("Globe"),           enabled: false, section: null,        badge: null,      requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 14 },
  { href: "/notifications",    label: "Notifications",  icon: iconStub("Bell"),            enabled: true,  section: null,        badge: null,      showDot: false, unlocksAt: 0 },
  { href: "/settings",         label: "Settings",       icon: iconStub("Settings"),        enabled: true,  section: null,        badge: null,      showDot: false, unlocksAt: 0 },
] as const;

export function hasPlanAccess(current: Plan, required: Plan): boolean {
  const order = ["free", "builder"] as string[];
  return order.indexOf(current) >= order.indexOf(required);
}

/** Read tasks completed from localStorage (client-side only) */
export function getTasksCompleted(): number {
  if (typeof window === "undefined") return 99; // SSR: show everything
  try {
    return parseInt(localStorage.getItem("bm_tasks_completed_total") ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Sync tasks_completed_total from Supabase back into localStorage.
 * Call once on app load (e.g. in sidebar useEffect) so the counter
 * survives device switches. Fire-and-forget — never awaited in render path.
 */
export async function syncTasksCompletedFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("founder_context")
      .select("tasks_completed_total")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.tasks_completed_total != null) {
      const serverVal = data.tasks_completed_total;
      const localVal = getTasksCompleted();
      // Take the max — if localStorage is ahead (offline writes), keep it
      const resolved = Math.max(serverVal, localVal);
      localStorage.setItem("bm_tasks_completed_total", String(resolved));
      // Write back the resolved value to Supabase if local was ahead
      if (localVal > serverVal) {
        await supabase.from("founder_context").upsert(
          { user_id: user.id, tasks_completed_total: resolved },
          { onConflict: "user_id" }
        );
      }
    }
  } catch {
    // Non-fatal — localStorage value remains active
  }
}
