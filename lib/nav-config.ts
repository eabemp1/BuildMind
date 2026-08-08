/**
 * lib/nav-config.ts — Page-based Founder Intelligence OS nav
 *
 * Core: Today (what matters now) · Insights (what BuildMind is noticing) ·
 *       Progress (trends & patterns) · Projects (what's being built) ·
 *       Settings
 * Intelligence: AI Coach (/ai-coach) · Founder Mirror · Break My Startup ·
 *       Agent Workforce · Weekly Report · Achievements
 *
 * Every item maps to a real, working route. No placeholder pages were
 * created for spec concepts (Strategy/Goals/Tasks/Experiments/Metrics)
 * that don't have a dedicated route or backing data in this codebase.
 * Where those concepts exist, they live inside an existing page instead:
 *   Metrics/Trends → inside /progress
 *   Tasks          → inside /today (Today's Focus Plan)
 *   Goals          → surfaced via GhostGoalBanner inside /today
 *
 * "Memory" is deliberately NOT a nav item — /memory is a retired redirect
 * stub (redirect("/progress?tab=patterns")); every field it used to render
 * was already merged into /insights and /progress. Adding it back to the
 * sidebar would just point founders at a redirect. See app/memory/page.tsx.
 *
 * Reflect is NOT a nav item. It surfaces as a bottom-sheet modal from Today's
 * done state.
 *
 * Secondary items (hidden: true) remain routable but won't appear in sidebar.
 */

import type { Plan } from "@/lib/plan";
import type { LucideIcon } from "lucide-react";
import { storage } from "@/lib/storage";
import {
  Bell,
  Bot,
  Brain,
  Briefcase,
  CircleDot,
  ClipboardList,
  FolderKanban,
  Gauge,
  Hammer,
  Lightbulb,
  Package,
  Rocket,
  Settings,
  TrendingUp,
  Trophy,
  UserCircle,
  UserPlus,
} from "lucide-react";

export type NavItemConfig = {
  href: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  hidden?: boolean;
  section: string | null;
  badge: string | null;
  showDot: boolean;
  requiredPlan?: Plan;
  unlocksAt?: number;
};

export const NAV: readonly NavItemConfig[] = [
  // ── Primary destinations (page-based Founder Intelligence OS shell) ─────
  // Each maps to a real, working route — no placeholder pages were created
  // for spec concepts (Strategy/Goals/Tasks/Experiments/Metrics) that don't
  // have a dedicated route or backing data in this codebase today. Where
  // those concepts DO exist, they live inside an existing page instead:
  //   Metrics/Trends  → inside /progress
  //   Tasks           → inside /today (Today's Focus Plan)
  //   Goals           → surfaced via GhostGoalBanner inside /today
  { href: "/today",    label: "Today",    icon: CircleDot,    enabled: true, section: null, badge: null, showDot: false, unlocksAt: 0 },
  { href: "/insights", label: "Insights", icon: Lightbulb,    enabled: true, section: null, badge: null, showDot: false, unlocksAt: 3 },
  { href: "/progress", label: "Progress", icon: TrendingUp,   enabled: true, section: null, badge: null, showDot: false, unlocksAt: 1 },
  { href: "/projects", label: "Projects", icon: FolderKanban, enabled: true, section: null, badge: null, showDot: false, unlocksAt: 0 },
  { href: "/settings", label: "Settings", icon: Settings,     enabled: true, section: null, badge: null, showDot: false, unlocksAt: 0 },

  // ── Intelligence section (visible in sidebar after unlock) ──────────────
  { href: "/ai-coach",         label: "AI Coach",        icon: Brain,          enabled: true,  hidden: false, section: "Intelligence", badge: null, showDot: false, unlocksAt: 3 },
  { href: "/founder-mirror",   label: "Founder Mirror",  icon: UserCircle,     enabled: true,  hidden: false, section: "Intelligence", badge: null, showDot: false, unlocksAt: 7 },
  { href: "/break-my-startup", label: "Break My Startup",icon: Hammer,         enabled: true,  hidden: false, section: "Intelligence", badge: null, showDot: false, unlocksAt: 3 },
  { href: "/agents",           label: "Agent Workforce",  icon: Bot,           enabled: true,  hidden: false, section: "Intelligence", badge: "NEW", showDot: false, requiredPlan: "builder" as Plan, unlocksAt: 5 },
  { href: "/reports",          label: "Weekly Report",   icon: ClipboardList,  enabled: true,  hidden: false, section: "Intelligence", badge: null, requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/achievements",     label: "Achievements",    icon: Trophy,         enabled: true,  hidden: false, section: "Intelligence", badge: null, showDot: true,  unlocksAt: 1 },
  { href: "/progress?tab=patterns", label: "My Profile",      icon: UserCircle,     enabled: true,  hidden: true, section: "Intelligence", badge: null, showDot: false, unlocksAt: 1 },

  // ── Settings section items ────────────────────────────────────────────────
  { href: "/upgrade",          label: "Upgrade",         icon: Rocket,         enabled: true,  hidden: false, section: "Settings", badge: null, showDot: false, unlocksAt: 0 },

  // ── Hidden / routable-only ────────────────────────────────────────────────
  { href: "/overview",         label: "Execution",       icon: Gauge,          enabled: true,  hidden: true, section: null, badge: null, showDot: false, unlocksAt: 3 },
  { href: "/ventures",         label: "Ventures",        icon: Briefcase,      enabled: false, hidden: true, section: null, badge: null, requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/startup-kit",      label: "Startup Kit",     icon: Package,        enabled: false, hidden: true, section: null, badge: null, requiredPlan: "builder" as Plan, showDot: false, unlocksAt: 7 },
  { href: "/invite",           label: "Invite",          icon: UserPlus,       enabled: false, hidden: true, section: null, badge: null, showDot: false, unlocksAt: 7 },
  { href: "/notifications",    label: "Notifications",   icon: Bell,           enabled: false, hidden: true, section: null, badge: null, showDot: false, unlocksAt: 0 },
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
