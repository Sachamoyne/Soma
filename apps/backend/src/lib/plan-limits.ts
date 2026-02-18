export type PlanName = "free" | "starter" | "pro";
export type PaidPlanName = Exclude<PlanName, "free">;

export const PLAN_LIMITS: Readonly<Record<PlanName, number>> = {
  free: 0,
  starter: 200,
  pro: Number.POSITIVE_INFINITY,
};

export function isPaidPlan(plan: string | null | undefined): plan is PaidPlanName {
  return plan === "starter" || plan === "pro";
}

export function getPlanLimit(plan: string | null | undefined): number {
  if (plan === "starter") {
    return PLAN_LIMITS.starter;
  }
  if (plan === "pro") {
    return PLAN_LIMITS.pro;
  }
  return PLAN_LIMITS.free;
}
