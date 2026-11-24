/** Everything the command palette can open or run. Pure data, built from the same sources as the sidebar and Work. */
import type { LucideIcon } from "lucide-react";
import {
  Bell, BookOpen, Bot, Brain, Briefcase, CircleDot, ClipboardList, CreditCard, FileText, FlaskConical, FolderKanban, Gauge, Globe, Hammer,
  Layers, LifeBuoy, LogOut, MessageSquare, Moon, Plug2, Radar, Rocket, Settings, Shield, Sparkles, Sun, Timer, TrendingUp, Trophy, User,
  UserCircle, Users, Wrench, CheckCircle2, Map, Activity,
} from "lucide-react";
import { NAV, hasPlanAccess } from "@/lib/nav-config";
import { catalog, GROUP_LABEL } from "@/lib/work/registry";
import { FEATURES } from "@/lib/features";
import type { Plan } from "@/lib/plan";

export type CommandGroup = "Actions" | "Pages" | "Work tools" | "Settings" | "Help";
export type ActionId = "focus" | "log" | "tour" | "coach" | "brief" | "theme" | "signout";

export interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  /** Right-hand context: where it goes, or what it is. */
  hint: string;
  keywords: string;
  icon: LucideIcon;
  href?: string;
  action?: ActionId;
  /** Shown instead of running: why it can't be opened yet. */
  locked?: { reason: string; href?: string };
  shortcut?: string;
}

export interface PaletteContext { plan: Plan; tasksCompleted: number; theme: "dark" | "light" }

const NAV_ICON: Record<string, LucideIcon> = { "/today": CircleDot, "/work": Layers, "/progress": TrendingUp, "/projects": FolderKanban, "/settings": Settings, "/ai-coach": Brain, "/customers": Users, "/experiments": FlaskConical, "/break-my-startup": Hammer, "/achievements": Trophy, "/upgrade": Rocket, "/overview": Gauge, "/founder-mirror": UserCircle, "/agents": Bot, "/reports": ClipboardList };

function gate(ctx: PaletteContext, item: { unlocksAt?: number; requiredPlan?: Plan }): Command["locked"] | undefined {
  if (item.requiredPlan && !hasPlanAccess(ctx.plan, item.requiredPlan)) return { reason: "Builder plan", href: "/upgrade" };
  const need = item.unlocksAt ?? 0;
  if (ctx.tasksCompleted < need) return { reason: `Unlocks after ${need} completed task${need === 1 ? "" : "s"}` };
  return undefined;
}

export function buildCommands(ctx: PaletteContext): Command[] {
  const out: Command[] = [];
  const seen = new Set<string>();
  const add = (c: Command) => { if (seen.has(c.id)) return; seen.add(c.id); out.push(c); };

  // ── Actions ──
  add({ id: "act:focus", group: "Actions", label: "Start a focus session", hint: "Today", keywords: "focus timer pomodoro start work block deep work", icon: Timer, action: "focus" });
  add({ id: "act:log", group: "Actions", label: "Log today's outcome", hint: "Today", keywords: "check in log outcome complete done finished reflect", icon: CheckCircle2, action: "log" });
  add({ id: "act:coach", group: "Actions", label: "Ask your coach beside this page", hint: "Coach", keywords: "coach ask chat help advice side pane", icon: Sparkles, action: "coach", shortcut: "Ctrl J" });
  add({ id: "act:brief", group: "Actions", label: "Open the daily brief", hint: "Co-founder", keywords: "daily brief cofounder co-founder companion nudges", icon: MessageSquare, action: "brief" });
  add({ id: "act:project", group: "Actions", label: "Create a project", hint: "Projects", keywords: "new project start add create", icon: FolderKanban, href: "/projects" });
  add({ id: "act:tour", group: "Actions", label: "Take the product tour", hint: "Help", keywords: "tour guide walkthrough onboarding help intro how it works", icon: Map, action: "tour" });
  add({ id: "act:theme", group: "Actions", label: ctx.theme === "dark" ? "Switch to light mode" : "Switch to dark mode", hint: "Appearance", keywords: "theme dark light mode appearance colors", icon: ctx.theme === "dark" ? Sun : Moon, action: "theme" });
  add({ id: "act:signout", group: "Actions", label: "Sign out", hint: "Account", keywords: "logout log out sign out leave", icon: LogOut, action: "signout" });

  // ── Pages ── the sidebar's own list (including pages that live behind tabs), then pages it doesn't list.
  for (const n of NAV) {
    if (!n.enabled && !(n.href === "/notifications" && FEATURES.notifications)) continue;
    if (n.href === "/upgrade" && ctx.plan !== "free") continue;
    const kw: Record<string, string> = {
      "/today": "action next step task today", "/work": "write draft message landing page email pitch tools library prepared", "/projects": "workspace roadmap milestones backlog tasks",
      "/progress": "reports trends week patterns heatmap", "/customers": "leads prospects demand check find people outreach", "/break-my-startup": "analysis risk stress test competitors critique",
      "/ai-coach": "ask chat advice intelligence", "/experiments": "test hypothesis experiment", "/achievements": "badges xp wins", "/settings": "profile preferences account",
      "/reports": "weekly report export", "/agents": "scout proof rival workforce", "/founder-mirror": "beliefs mirror", "/upgrade": "pricing builder plan trial pay", "/overview": "execution stats dashboard",
    };
    add({ id: `page:${n.href}`, group: "Pages", label: n.label, hint: n.href.replace("?tab=", " · "), keywords: kw[n.href] ?? n.label, icon: NAV_ICON[n.href] ?? Briefcase, href: n.href, locked: gate(ctx, n) });
  }
  const extra: Array<[string, string, string, string, LucideIcon]> = [
    ["/radar", "Radar", "events hackathon grant people meeting opportunities market radar", "Events, grants and people to meet", Radar],
    ["/reflect", "Reflect", "reflection check in log outcome evening", "End-of-day reflection", ClipboardList],
    ["/journey", "Journey", "lessons curriculum learn", "Lessons", BookOpen],
    ...(FEATURES.publicProjects ? [["/explore", "Explore", "community public projects", "Community", Globe] as [string, string, string, string, LucideIcon]] : []),
  ];
  for (const [href, label, kw, hint, icon] of extra) add({ id: `page:${href}`, group: "Pages", label, hint, keywords: kw, icon, href });
  const progressTabs: Array<[string, string]> = [["week", "This week"], ["patterns", "Patterns"], ["execution", "Execution"], ["mirror", "Mirror"], ["visual", "Visual"]];
  for (const [t, l] of progressTabs) add({ id: `page:/progress?tab=${t}`, group: "Pages", label: `Progress: ${l}`, hint: "Progress", keywords: `progress ${l} tab`, icon: TrendingUp, href: `/progress?tab=${t}`, locked: gate(ctx, { unlocksAt: 1 }) });

  // ── Work tools ── every generator, drawn view and tool in the Work catalog.
  for (const e of catalog()) {
    const builder = /\(Builder\)/i.test(e.blurb);
    add({ id: `work:${e.id}`, group: "Work tools", label: e.label, hint: GROUP_LABEL[e.group].label, keywords: `${e.blurb} work write draft ${GROUP_LABEL[e.group].label}`, icon: e.source === "tool" ? Wrench : e.source === "visual" ? Activity : FileText, href: `/work?open=${encodeURIComponent(e.id)}`, locked: builder && !hasPlanAccess(ctx.plan, "builder") ? { reason: "Builder plan", href: "/upgrade" } : undefined });
  }

  // ── Settings sections ──
  const tabs: Array<[string, string, string, LucideIcon]> = [
    ["profile", "Profile", "name username bio avatar photo picture", User],
    ["account", "Account", "email password export my data delete account download data privacy", Shield],
    ["billing", "Billing", "plan subscription invoice card payment upgrade cancel trial", CreditCard],
    ["integrations", "Integrations", "notion linear connect apps oauth", Plug2],
    ["ai", "AI preferences", "personality tone coach style", Bot],
    ["public", "Public profile", "public page share username", Globe],
    ...(FEATURES.notifications ? [["notifications", "Notifications", "alerts push email reminders toggles", Bell] as [string, string, string, LucideIcon]] : []),
  ];
  for (const [t, l, kw, icon] of tabs) add({ id: `settings:${t}`, group: "Settings", label: `Settings: ${l}`, hint: "Settings", keywords: `settings ${kw}`, icon, href: `/settings?tab=${t}` });

  // ── Help ──
  const help: Array<[string, string, string, string, LucideIcon]> = [
    ["/pricing", "Pricing", "plans cost price free builder", "Plans and prices", CreditCard],
    ["/status", "System status", "status outage down uptime", "Is everything up?", Activity],
    ["/legal/terms", "Terms of service", "terms legal", "Legal", FileText],
    ["/legal/privacy", "Privacy policy", "privacy data legal gdpr", "Legal", Shield],
    ["/legal/cookies", "Cookie policy", "cookies legal", "Legal", FileText],
    ["/refund", "Refund policy", "refund money back cancel", "Legal", LifeBuoy],
  ];
  for (const [href, label, kw, hint, icon] of help) add({ id: `help:${href}`, group: "Help", label, hint, keywords: kw, icon, href });
  return out;
}

/** Data the palette finds by name, shown under the commands. */
export type DataKind = "Projects" | "Milestones" | "Tasks" | "Saved work";
