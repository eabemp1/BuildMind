"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/buildmind";

export type AdminOverview = {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  aiRequests: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
  role: string;
  isActive: boolean;
  projectCount: number;
};

export type AdminProjectRow = {
  id: string;
  title: string;
  ownerEmail: string;
  milestonesCount: number;
  createdAt: string;
};

export type AdminAiUsageRow = {
  userId: string;
  userEmail: string;
  requests: number;
  tokensUsed: number;
  lastActivity: string | null;
};

async function getRoleForUser(userId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
  if (error) throw error;
  const role = typeof data?.role === "string" ? data.role : "user";
  return role;
}

export async function requireAdminAccess(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  const role = await getRoleForUser(user.id);
  if (role !== "admin") {
    throw new Error("FORBIDDEN");
  }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  await requireAdminAccess();
  const supabase = createClient();
  const [{ count: usersCount }, { count: activeUsersCount }, { count: projectsCount }, { data: usageRows }] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("onboarding_completed", true),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("ai_usage").select("count"),
  ]);

  const aiRequests = (usageRows ?? []).reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  return {
    totalUsers: usersCount ?? 0,
    activeUsers: activeUsersCount ?? 0,
    totalProjects: projectsCount ?? 0,
    aiRequests,
  };
}

export async function getAdminUsers(search?: string): Promise<AdminUserRow[]> {
  await requireAdminAccess();
  const supabase = createClient();
  let usersQuery = supabase.from("users").select("*").order("created_at", { ascending: false });
  if (search?.trim()) {
    usersQuery = usersQuery.ilike("email", `%${search.trim()}%`);
  }
  const { data: users, error } = await usersQuery;
  if (error) throw error;

  const { data: projects } = await supabase.from("projects").select("user_id");
  const projectCountMap = new Map<string, number>();
  for (const row of projects ?? []) {
    const userId = String(row.user_id);
    projectCountMap.set(userId, (projectCountMap.get(userId) ?? 0) + 1);
  }

  return (users ?? []).map((u) => ({
    id: String(u.id),
    email: String(u.email ?? ""),
    createdAt: String(u.created_at ?? ""),
    role: typeof u.role === "string" ? u.role : "user",
    isActive: typeof u.is_active === "boolean" ? u.is_active : true,
    projectCount: projectCountMap.get(String(u.id)) ?? 0,
  }));
}

export async function promoteUserToAdmin(userId: string): Promise<void> {
  await requireAdminAccess();
  const supabase = createClient();
  const { error } = await supabase.from("users").update({ role: "admin" }).eq("id", userId);
  if (error) throw error;
}

export async function suspendUser(userId: string): Promise<void> {
  await requireAdminAccess();
  const supabase = createClient();
  const { error } = await supabase.from("users").update({ is_active: false }).eq("id", userId);
  if (error) throw error;
}

export async function getAdminProjects(): Promise<AdminProjectRow[]> {
  await requireAdminAccess();
  const supabase = createClient();
  const [{ data: projects, error: projectsError }, { data: users }, { data: milestones }] = await Promise.all([
    supabase.from("projects").select("id,title,user_id,created_at").order("created_at", { ascending: false }),
    supabase.from("users").select("id,email"),
    supabase.from("milestones").select("id,project_id"),
  ]);
  if (projectsError) throw projectsError;

  const emailByUserId = new Map<string, string>((users ?? []).map((u) => [String(u.id), String(u.email ?? "")]));
  const milestoneCountMap = new Map<string, number>();
  for (const row of milestones ?? []) {
    const pid = String(row.project_id);
    milestoneCountMap.set(pid, (milestoneCountMap.get(pid) ?? 0) + 1);
  }

  return (projects ?? []).map((p) => ({
    id: String(p.id),
    title: String(p.title ?? ""),
    ownerEmail: emailByUserId.get(String(p.user_id)) ?? "Unknown",
    milestonesCount: milestoneCountMap.get(String(p.id)) ?? 0,
    createdAt: String(p.created_at ?? ""),
  }));
}

export async function getAdminAiUsage(): Promise<AdminAiUsageRow[]> {
  await requireAdminAccess();
  const supabase = createClient();
  const [{ data: usage, error }, { data: users }] = await Promise.all([
    supabase.from("ai_usage").select("user_id,count,tokens_used,last_activity"),
    supabase.from("users").select("id,email"),
  ]);
  if (error) throw error;
  const emailByUserId = new Map<string, string>((users ?? []).map((u) => [String(u.id), String(u.email ?? "")]));

  return (usage ?? []).map((u) => ({
    userId: String(u.user_id),
    userEmail: emailByUserId.get(String(u.user_id)) ?? "Unknown",
    requests: Number(u.count ?? 0),
    tokensUsed: Number(u.tokens_used ?? 0),
    lastActivity: (u.last_activity as string | null) ?? null,
  }));
}

export async function sendAdminNotification(message: string, type: string): Promise<number> {
  await requireAdminAccess();
  const supabase = createClient();
  const { data: users, error } = await supabase.from("users").select("id");
  if (error) throw error;
  const rows = (users ?? []).map((u) => ({
    user_id: u.id,
    type,
    message,
    is_read: false,
  }));
  if (rows.length) {
    const { error: insertError } = await supabase.from("notifications").insert(rows);
    if (insertError) throw insertError;
  }
  return rows.length;
}
