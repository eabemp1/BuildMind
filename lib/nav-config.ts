/**
 * lib/nav-config.ts — Pure nav data extracted from components/layout/sidebar-nav.tsx
 *
 * This file has NO imports from next/, framer-motion, or browser APIs so it
 * can be safely imported in tests (vitest Node environment).
 */

import type { Plan } from "@/lib/plan";

export type NavItemConfig = {
  href: string;
  label: string;
  icon: (...args: unknown[]) => unknown; // component function — defined as function type for test compat
  enabled: boolean;
  section: string | null;
  badge: string | null;
  showDot: boolean;
  requiredPlan?: Plan;
};

// Icon stubs — replaced at runtime by lucide-react imports in sidebar-nav.tsx
// These are placeholder identity functions so NAV is usable in Node/test environments
const iconStub = (name: string) => function NavIcon() { return null; };

export const NAV: readonly NavItemConfig[] = [
  { href: "/today",            label: "Today",          icon: iconStub("Zap"),             enabled: true,  section: "DAILY",     badge: null,      showDot: false },
  { href: "/overview",         label: "Overview",       icon: iconStub("LayoutDashboard"), enabled: true,  section: null,        badge: null,      showDot: false },
  { href: "/reflect",          label: "Reflect",        icon: iconStub("RefreshCw"),       enabled: true,  section: null,        badge: null,      showDot: true  },
  { href: "/projects",         label: "Projects",       icon: iconStub("FolderKanban"),    enabled: true,  section: "WORKSPACE", badge: null,      showDot: false },
  { href: "/ventures",         label: "Ventures",       icon: iconStub("Map"),             enabled: true,  section: null,        badge: "New",     showDot: false },
  { href: "/explore",          label: "Founder Feed",   icon: iconStub("Globe"),           enabled: false, section: null,        badge: null,      requiredPlan: "builder" as Plan, showDot: false },
  { href: "/ai-coach",         label: "AI Coach",       icon: iconStub("Bot"),             enabled: true,  section: "AI TOOLS",  badge: null,      showDot: false },
  { href: "/break-my-startup", label: "Break Startup",  icon: iconStub("Flame"),           enabled: true,  section: null,        badge: null,      showDot: false },
  { href: "/startup-kit",      label: "Startup Kit",    icon: iconStub("Lightbulb"),       enabled: false, section: null,        badge: null,      requiredPlan: "builder" as Plan, showDot: false },
  { href: "/notifications",    label: "Notifications",  icon: iconStub("Bell"),            enabled: true,  section: "ACCOUNT",   badge: null,      showDot: false },
  { href: "/reports",          label: "Reports",        icon: iconStub("LineChart"),       enabled: true,  section: null,        badge: null,      requiredPlan: "builder" as Plan, showDot: false },
  { href: "/achievements",     label: "Achievements",   icon: iconStub("Trophy"),          enabled: true,  section: null,        badge: null,      showDot: false },
  { href: "/invite",           label: "Invite & Earn",  icon: iconStub("Users"),           enabled: true,  section: null,        badge: "Free mo", showDot: false },
  { href: "/settings",         label: "Settings",       icon: iconStub("Settings"),        enabled: true,  section: null,        badge: null,      showDot: false },
] as const;

export function hasPlanAccess(current: Plan, required: Plan): boolean {
  const order = ["free", "builder"] as string[];
  return order.indexOf(current) >= order.indexOf(required);
}
