export type PlanName = "free" | "starter" | "pro";

export const PLAN_LIMITS: Readonly<Record<PlanName, number>> = {
  free: 0,
  starter: 200,
  pro: Number.POSITIVE_INFINITY,
};

export function getPlanLimit(plan: string | null | undefined): number {
  if (plan === "starter") {
    return PLAN_LIMITS.starter;
  }
  if (plan === "pro") {
    return PLAN_LIMITS.pro;
  }
  return PLAN_LIMITS.free;
}

export function serializePlanLimit(limit: number): number {
  if (Number.isFinite(limit)) {
    return limit;
  }
  return Number.MAX_SAFE_INTEGER;
}
