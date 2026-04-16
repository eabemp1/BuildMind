"use client";

import { useSyncExternalStore } from "react";
import { fetchAndSyncStoredPlanFromBillingStatus, getPlan, subscribePlanChanges, type Plan } from "@/lib/plan";

export function usePlan() {
  const plan = useSyncExternalStore<Plan>(subscribePlanChanges, getPlan, () => "free");

  return {
    plan,
    refreshPlan: fetchAndSyncStoredPlanFromBillingStatus,
  };
}