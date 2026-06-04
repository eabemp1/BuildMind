import type { FounderContext } from "@/lib/founderContext";
import type { FounderMemory } from "@/lib/founderMemory";
import { createAdminClient } from "@/lib/supabase/admin";

export type DebtLevel = "none" | "building" | "high" | "critical";
export type DebtSignal = "override_cluster" | "avoidance_loop" | "temporal_gap" | "compound" | null;

export interface ExecutionDebt {
  level: DebtLevel;
  signal: DebtSignal;
  category: string | null;
  message: string;
  deferralCount: number;
  daysSinceLastEngagement: number | null;
  interventionHint: string;
  cooledDown?: boolean;
}

const NO_DEBT: ExecutionDebt = {
  level: "none",
  signal: null,
  category: null,
  message: "",
  deferralCount: 0,
  daysSinceLastEngagement: null,
  interventionHint: "",
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  "customer-validation": ["customer", "user interview", "discovery", "validation", "outreach", "feedback", "interview", "prospect"],
  sales: ["sales", "sell", "revenue", "pricing", "charge", "payment", "close", "demo", "pitch"],
  shipping: ["ship", "launch", "deploy", "release", "publish", "mvp", "build", "feature", "code"],
  marketing: ["marketing", "content", "social", "post", "tweet", "blog", "seo", "ads", "growth", "distribution"],
  "investor-comms": ["investor", "fundraise", "raise", "pitch deck", "vc", "angel", "funding"],
};

function canonicalCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) return category;
  }
  return null;
}

function categoryFrequency(items: string[] = []): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const item of items) {
    const category = canonicalCategory(item);
    if (category) freq[category] = (freq[category] ?? 0) + 1;
  }
  return freq;
}

function buildDebtMessage(signal: DebtSignal, category: string, deferralCount: number, daysSince: number | null): string {
  const human = category.replace(/-/g, " ");
  if (signal === "compound") {
    const time = daysSince ? ` and you have not touched it in ${daysSince} days` : "";
    return `You've deferred ${human} ${deferralCount} times${time}. That is not a scheduling problem; it is a pattern. What specifically is making this hard to do today?`;
  }
  if (signal === "temporal_gap" && daysSince) {
    return `It has been ${daysSince} days since you last did anything on ${human}. Either it is no longer important, or something is blocking you. Which is true?`;
  }
  if (signal === "override_cluster") {
    return `You've skipped ${human} tasks ${deferralCount} times. The pattern suggests a decision you have not named yet. What's actually going on with ${human}?`;
  }
  if (signal === "avoidance_loop") {
    return `${human.charAt(0).toUpperCase() + human.slice(1)} keeps appearing as avoided work. ${deferralCount} signals is enough to stop pretending this is random. What feels bad about doing it?`;
  }
  return `You're building up debt in ${human}. Name the block or change the plan.`;
}

function buildInterventionHint(category: string): string {
  const hints: Record<string, string> = {
    "customer-validation": "Start with one 20-minute no-agenda user call. Ask about their current workflow, not your idea.",
    sales: "Send one pricing message or commitment ask. Make willingness to pay visible today.",
    shipping: "Timebox two hours and ship the smallest incomplete version that can teach you something.",
    marketing: "Repurpose one thing already written into a public post instead of creating a new campaign.",
    "investor-comms": "Send a five-bullet update to one warm contact instead of rebuilding the deck.",
  };
  return hints[category] ?? `Ask one direct question about the block behind ${category.replace(/-/g, " ")}.`;
}

function applyCooldown(debt: ExecutionDebt, lastDebtSurfaced?: Record<string, string> | null): ExecutionDebt {
  if (!debt.category || debt.level === "none") return debt;
  const last = lastDebtSurfaced?.[debt.category];
  if (!last) return debt;
  const hours = (Date.now() - new Date(last).getTime()) / 36e5;
  if (Number.isFinite(hours) && hours < 48) {
    return { ...NO_DEBT, cooledDown: true };
  }
  return debt;
}

export function computeExecutionDebt(
  context: Pick<FounderContext, "avoidance_zones" | "override_reasons" | "tasks_overridden_this_week" | "topics_mentioned_repeatedly" | "days_inactive">,
  memory: Pick<FounderMemory, "avoidance_zones" | "decision_patterns" | "personality_tags" | "last_debt_surfaced">,
  options?: { lastCustomerConversationDate?: string },
): ExecutionDebt {
  const overrideFreq = categoryFrequency([...(context.override_reasons ?? []), ...(context.avoidance_zones ?? [])]);
  const highOverrideCategory = Object.entries(overrideFreq).filter(([, count]) => count >= 3).sort(([, a], [, b]) => b - a)[0];

  const persistentAvoidFreq = categoryFrequency([...(context.avoidance_zones ?? []), ...(memory.avoidance_zones ?? [])]);
  const persistentAvoidCategory = Object.entries(persistentAvoidFreq).filter(([, count]) => count >= 2).sort(([, a], [, b]) => b - a)[0];

  let daysSinceCustomerConvo: number | null = null;
  if (options?.lastCustomerConversationDate) {
    daysSinceCustomerConvo = Math.floor((Date.now() - new Date(options.lastCustomerConversationDate).getTime()) / 86400000);
  }

  const repeatedCategory = Object.entries(categoryFrequency(context.topics_mentioned_repeatedly ?? [])).filter(([, count]) => count >= 2)[0];

  let debt = NO_DEBT;
  if (highOverrideCategory && persistentAvoidCategory && highOverrideCategory[0] === persistentAvoidCategory[0]) {
    const category = highOverrideCategory[0];
    const count = (overrideFreq[category] ?? 0) + (persistentAvoidFreq[category] ?? 0);
    debt = {
      level: count >= 6 ? "critical" : "high",
      signal: "compound",
      category,
      message: buildDebtMessage("compound", category, count, category === "customer-validation" ? daysSinceCustomerConvo : null),
      deferralCount: count,
      daysSinceLastEngagement: category === "customer-validation" ? daysSinceCustomerConvo : null,
      interventionHint: buildInterventionHint(category),
    };
  } else if (daysSinceCustomerConvo !== null && daysSinceCustomerConvo >= 5) {
    debt = {
      level: daysSinceCustomerConvo >= 10 ? "critical" : "high",
      signal: "temporal_gap",
      category: "customer-validation",
      message: buildDebtMessage("temporal_gap", "customer-validation", 0, daysSinceCustomerConvo),
      deferralCount: 0,
      daysSinceLastEngagement: daysSinceCustomerConvo,
      interventionHint: buildInterventionHint("customer-validation"),
    };
  } else if (highOverrideCategory) {
    const [category, count] = highOverrideCategory;
    debt = {
      level: count >= 5 ? "critical" : "high",
      signal: "override_cluster",
      category,
      message: buildDebtMessage("override_cluster", category, count, null),
      deferralCount: count,
      daysSinceLastEngagement: null,
      interventionHint: buildInterventionHint(category),
    };
  } else if (persistentAvoidCategory) {
    const [category, count] = persistentAvoidCategory;
    debt = {
      level: count >= 4 ? "high" : "building",
      signal: "avoidance_loop",
      category,
      message: buildDebtMessage("avoidance_loop", category, count, null),
      deferralCount: count,
      daysSinceLastEngagement: null,
      interventionHint: buildInterventionHint(category),
    };
  } else if (repeatedCategory) {
    const [category, count] = repeatedCategory;
    debt = {
      level: "building",
      signal: "avoidance_loop",
      category,
      message: `You've mentioned ${category.replace(/-/g, " ")} ${count} times without action. At some point, thinking about it becomes the avoidance.`,
      deferralCount: count,
      daysSinceLastEngagement: null,
      interventionHint: buildInterventionHint(category),
    };
  }

  return applyCooldown(debt, memory.last_debt_surfaced);
}

export function buildDebtPromptInjection(debt: ExecutionDebt): string {
  if (debt.level === "none" || !debt.signal) return "";
  if (debt.level === "critical") {
    return `EXECUTION DEBT - CRITICAL:
Address this before the normal task. Observation: "${debt.message}"
Intervention: ${debt.interventionHint}`;
  }
  if (debt.level === "high") {
    return `EXECUTION DEBT - HIGH:
Debt category: ${debt.category}. Surface this early: "${debt.message}"
Intervention: ${debt.interventionHint}`;
  }
  return `EXECUTION DEBT BUILDING:
Watch for emerging avoidance of "${debt.category}". If relevant, mention: "${debt.message}"`;
}

export function debtSuppressesTask(debt: ExecutionDebt, consecutiveHighDebtSessions = 0): boolean {
  if (debt.level === "critical") return true;
  if (debt.level === "high" && consecutiveHighDebtSessions >= 1) return true;
  return false;
}

export async function markDebtSurfaced(userId: string, debt: ExecutionDebt): Promise<void> {
  if (!debt.category) return;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("founder_memory")
    .select("last_debt_surfaced")
    .eq("user_id", userId)
    .maybeSingle();
  const current = (data?.last_debt_surfaced ?? {}) as Record<string, string>;
  await supabase.from("founder_memory").upsert({
    user_id: userId,
    last_debt_surfaced: { ...current, [debt.category]: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}
