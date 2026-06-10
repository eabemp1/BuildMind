import { buildPersonalizedTodayDraft } from "@/lib/todayDrafts";

export type TodayActionData = {
  action: string;
  platform: string;
  target_user: string;
  message: string;
  why: string;
  time: string;
  stage?: string;
  isAI?: boolean;
  reflexion?: {
    verdict: string;
    criticPersona: string;
    rationale: string;
    loopRan: boolean;
    passedCritic: boolean;
    lastReflectionUsed: boolean;
  };
  reflexion_status?: string;
};

export type TodayActionCache = {
  date: string;
  projectId: string;
  stage: string;
  data: TodayActionData;
  generatedAt: string;
  source: "overnight" | "today-action";
  /** How many times this exact task has been served without a matching reflection. */
  shown_count?: number;
};

type ProjectLike = {
  id: string;
  name?: string | null;
  title?: string | null;
  target_users?: string | null;
  problem?: string | null;
  description?: string | null;
};

type SupabaseAdminLike = {
  from: (table: string) => {
    upsert: (
      rows: Record<string, unknown> | Array<Record<string, unknown>>,
      options?: { onConflict?: string },
    ) => PromiseLike<{ error?: { message?: string } | null }>;
  };
};

function inferPlatform(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes("linkedin")) return "LinkedIn";
  if (lower.includes("whatsapp")) return "WhatsApp";
  if (lower.includes("email")) return "Email";
  if (lower.includes("twitter") || lower.includes("x/")) return "Twitter/X";
  if (lower.includes("reddit")) return "Reddit";
  if (lower.includes("call")) return "Phone call";
  if (lower.includes("screen share")) return "Screen share";
  return "LinkedIn or WhatsApp";
}

function inferTargetUser(action: string, explicitTargetUsers: string): string {
  if (explicitTargetUsers.trim()) return explicitTargetUsers.trim();
  const match = action.match(/\b(?:to|with|call|message|dm|email|post to)\s+(?:\d+\s+)?(.+?)(?:\s+(?:on|via|today|who|and|about)|[.,-]|$)/i);
  return match?.[1]?.trim() || "people in your target segment";
}

function localDateKey(timezoneOffset = 0, now = new Date()): string {
  return new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildTodayActionCacheFromBriefing(input: {
  briefing: { action: string; risk?: string | null };
  project: ProjectLike;
  stage: string;
  date?: string;
  timezoneOffset?: number;
}): TodayActionCache {
  const title = input.project.name ?? input.project.title ?? "";
  const targetUsers = input.project.target_users ?? "";
  const problem = input.project.problem ?? "";
  const fallback = {
    action: input.briefing.action,
    platform: inferPlatform(input.briefing.action),
    target_user: inferTargetUser(input.briefing.action, targetUsers),
    message: "",
    why: input.briefing.risk
      ? `Because today's biggest risk is: ${input.briefing.risk}`
      : `Because this is the highest-leverage move for your ${input.stage} stage right now.`,
    time: "30-60 minutes",
  };

  const data: TodayActionData = {
    ...fallback,
    message: buildPersonalizedTodayDraft(input.briefing.action, fallback, {
      title,
      targetUsers,
      problem,
      stage: input.stage,
    }),
    stage: input.stage,
    isAI: true,
    reflexion: {
      verdict: "pass",
      criticPersona: "Overnight Reflexion",
      rationale: fallback.why,
      loopRan: true,
      passedCritic: true,
      lastReflectionUsed: true,
    },
    reflexion_status: "precomputed",
  };

  return {
    date: input.date ?? localDateKey(input.timezoneOffset),
    projectId: input.project.id,
    stage: input.stage,
    data,
    generatedAt: new Date().toISOString(),
    source: "overnight",
  };
}

export async function upsertTodayActionCache(
  admin: SupabaseAdminLike,
  userId: string,
  cache: TodayActionCache,
): Promise<void> {
  // Read existing cache to increment shown_count if the task is the same
  let shownCount = 1;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (admin as any)
      .from("user_behavior_state")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "today_action_cache")
      .maybeSingle();
    const prev = existing?.data?.value as TodayActionCache | null;
    if (prev?.data?.action) {
      const prevTitle = prev.data.action.toLowerCase().slice(0, 60);
      const newTitle = (cache.data.action ?? "").toLowerCase().slice(0, 60);
      // Substantial similarity: share 3+ words or one is a substring of the other
      const prevWords = new Set(prevTitle.split(/\s+/).filter((w: string) => w.length > 4));
      const newWords = newTitle.split(/\s+/).filter((w: string) => w.length > 4);
      const overlap = newWords.filter((w: string) => prevWords.has(w)).length;
      if (overlap >= 3 || prevTitle.includes(newTitle.slice(0, 30)) || newTitle.includes(prevTitle.slice(0, 30))) {
        shownCount = (prev.shown_count ?? 1) + 1;
      }
    }
  } catch { /* non-fatal — default shown_count=1 */ }

  const { error } = await admin
    .from("user_behavior_state")
    .upsert(
      {
        user_id: userId,
        key: "today_action_cache",
        value: { ...cache, shown_count: shownCount },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" },
    );

  if (error) {
    throw new Error(error.message ?? "Failed to persist today_action_cache");
  }
}
