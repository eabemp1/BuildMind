import type { Plan } from "@/lib/plan";

export const PLAN_PRICE_MONTHLY: Record<Plan, number> = {
  free: 0,
  builder: 19,
};

export const PLAN_PRICE_LABEL: Record<Plan, string> = {
  free: "$0",
  builder: "$19/mo",
};

export const PLAN_NAME: Record<Plan, string> = {
  free: "Free",
  builder: "Builder",
};
