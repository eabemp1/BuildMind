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
import type { ElementType } from "react";
import { storage } from "@/lib/storage";

export type NavItemConfig = {
  href: string;
  label: string;
  icon: ElementType<{ size?: number }>;
  enabled: boolean;
  hidden?: boolean;  // AUDIT v8: temporarily hidden from nav while simplifying product surface
  section: string | null;
  badge: string | null;
  showDot: boolean;
  requiredPlan?: Plan;
  unlocksAt?: number;
};

const iconStub = (_name: string): ElementType<{ size?: number }> => function NavIcon() { return null; };

export const NAV: readonly NavItemConfig[] = [
  // ── TODAY ──────────────────────────────────────────────────────────────────
  { href: "/today",            label: "Today",            icon: iconStub("Zap"),             enabled: true,  section: "TODAY",   badge: null,      showDot: false, unlocksAt: 0 },
  { href: "/reflect",          label: "Reflect",          icon: iconStub("RefreshCw"),       enabled: true,  section: null,      badge: null,      showDot: true,  unlocksAt: 1 },

  // ── ANALYZE ────────────────────────────────────────────────────────────────
  { href: "/break-my-startup", label: "Break My Startup", icon: iconStub("Flame"),           enabled: true,  section: "ANALYZE", badge: null,      showDot: false, unlocksAt: 3 },
  { href: "/overview",         label: "Overview",         icon: iconStub("LayoutDashboard"), enabled: true,  section: null,      badge: null,      showDot: false, unlocksAt: 3 },
  // AUDIT v8 PROD #2: Hide Ventures from primary nav — founders overwhelmed by options
  // AUDIT v8 PROD #10: Insights — behavioral mirror
  { href: "/insights",         label: "Insights",         icon: iconStub("BarChart2"),       enabled: true,  section: null,      badge: null,      showDot: false, unlocksAt: 3 },
  { href: "/ventures",         label: "Ventures",         icon: iconStub("Map"),             enabled: false, hidden: true,  section: null,      badge: "Builder", requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/reports",          label: "Reports",          icon: iconStub("LineChart"),       enabled: true,  section: null,      badge: "Builder", requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },

  // ── COACH ──────────────────────────────────────────────────────────────────
  { href: "/ai-coach",         label: "AI Coach",         icon: iconStub("Bot"),             enabled: true,  section: "COACH",   badge: null,      showDot: false, unlocksAt: 3 },
  { href: "/projects",         label: "Projects",         icon: iconStub("FolderKanban"),    enabled: true,  section: null,      badge: null,      showDot: false, unlocksAt: 3 },

  // ── MORE (bottom) ──────────────────────────────────────────────────────────
  // AUDIT v8 PROD #2: Achievements hidden — gamification before core loop is proven distracts
  { href: "/achievements",     label: "Achievements",     icon: iconStub("Trophy"),          enabled: false, hidden: true,  section: "MORE",    badge: null,      showDot: false, unlocksAt: 7 },
  { href: "/invite",           label: "Invite & Earn",    icon: iconStub("Users"),           enabled: true,  section: null,      badge: "Free mo", showDot: false, unlocksAt: 7 },
  { href: "/notifications",    label: "Notifications",    icon: iconStub("Bell"),            enabled: true,  section: null,      badge: null,      showDot: false, unlocksAt: 0 },
  { href: "/settings",         label: "Settings",         icon: iconStub("Settings"),        enabled: true,  section: null,      badge: null,      showDot: false, unlocksAt: 0 },
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
