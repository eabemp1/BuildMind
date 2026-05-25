/**
 * lib/nav-config.ts — Progressive nav unlock  (Product Improvement #1)
 *
 * Restructured from 9 destinations to 3 primary sections:
 *   TODAY    — daily execution loop (Today, Reflect)
 *   ANALYZE  — strategic intelligence (Break My Startup, Ventures, Reports, Overview)
 *   COACH    — AI guidance (AI Coach, Projects)
 *
 * Secondary items (Achievements, Notifications, Settings, Invite) live at
 * the bottom, visually separated so they don't compete with the 3 primary
 * destinations.
 */

import type { Plan } from "@/lib/plan";
import type { LucideIcon } from "lucide-react";
import { storage } from "@/lib/storage";
import { BarChart3, CircleDot, FolderKanban, Settings, TrendingUp } from "lucide-react";

export type NavItemConfig = {
  href: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  hidden?: boolean;  // AUDIT v8: temporarily hidden from nav while simplifying product surface
  section: string | null;
  badge: string | null;
  showDot: boolean;
  requiredPlan?: Plan;
  unlocksAt?: number;
};

export const NAV: readonly NavItemConfig[] = [
  // ── 4 primary destinations ────────────────────────────────────────────────
  { href: "/today",    label: "Today",    icon: CircleDot,    enabled: true, section: null, badge: null, showDot: false, unlocksAt: 0 },
  { href: "/progress", label: "Progress", icon: TrendingUp,   enabled: true, section: null, badge: null, showDot: false, unlocksAt: 1 },
  { href: "/projects", label: "Projects", icon: FolderKanban, enabled: true, section: null, badge: null, showDot: false, unlocksAt: 0 },
  { href: "/settings", label: "Settings", icon: Settings,     enabled: true, section: null, badge: null, showDot: false, unlocksAt: 0 },

  // ── Hidden power-user routes (routable but not in sidebar) ────────────────
  { href: "/ai-coach",         label: "AI Coach",         icon: BarChart3, enabled: true,  hidden: true, section: null, badge: null, showDot: false, unlocksAt: 3 },
  { href: "/reflect",          label: "Reflect",          icon: CircleDot, enabled: true,  hidden: true, section: null, badge: null, showDot: true,  unlocksAt: 1 },
  { href: "/overview",         label: "Execution",        icon: BarChart3, enabled: true,  hidden: true, section: null, badge: null, showDot: false, unlocksAt: 3 },
  { href: "/reports",          label: "Reports",          icon: BarChart3, enabled: true,  hidden: true, section: null, badge: null, requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/break-my-startup", label: "Break My Startup", icon: BarChart3, enabled: true,  hidden: true, section: null, badge: null, showDot: false, unlocksAt: 3 },
  { href: "/insights",         label: "Insights",         icon: BarChart3, enabled: true,  hidden: true, section: null, badge: null, showDot: false, unlocksAt: 3 },
  { href: "/ventures",         label: "Ventures",         icon: BarChart3, enabled: false, hidden: true, section: null, badge: null, requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/startup-kit",      label: "Startup Kit",      icon: BarChart3, enabled: false, hidden: true, section: null, badge: null, requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/achievements",     label: "Achievements",     icon: BarChart3, enabled: false, hidden: true, section: null, badge: null, showDot: false, unlocksAt: 7 },
  { href: "/invite",           label: "Invite",           icon: BarChart3, enabled: false, hidden: true, section: null, badge: null, showDot: false, unlocksAt: 7 },
  { href: "/notifications",    label: "Notifications",    icon: BarChart3, enabled: false, hidden: true, section: null, badge: null, showDot: false, unlocksAt: 0 },
] as const;

export function hasPlanAccess(current: Plan, required: Plan): boolean {
  const order = ["free", "builder"] as string[];
  return order.indexOf(current) >= order.indexOf(required);
}

export function getTasksCompleted(): number {
  if (typeof window === "undefined") return 99;
  return parseInt(storage.get("bm_tasks_completed_total") ?? "0", 10) || 0;
}

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
      const resolved = Math.max(serverVal, localVal);
      storage.set("bm_tasks_completed_total", String(resolved));
      if (localVal > serverVal) {
        await supabase.from("founder_context").upsert(
          { user_id: user.id, tasks_completed_total: resolved },
          { onConflict: "user_id" }
        );
      }
    }
  } catch {
    // Non-fatal
  }
}
