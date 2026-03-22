"use client";

import { useEffect, useState } from "react";

export type Plan = "free" | "starter" | "pro";

interface PlanInfo {
  plan: Plan;
  role?: string;
  canUseAI: boolean;
  used?: number;
  limit?: number;
  remaining?: number;
  reset_at?: string;
  free_trial_used?: number;
  free_trial_limit?: number;
  free_trial_remaining?: number;
}

/**
 * Hook to get user's current plan and AI access status
 * Returns null while loading, then plan info once loaded
 */
export function useUserPlan(): PlanInfo | null {
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const response = await fetch("/api/quota");
        if (response.ok) {
          const data = await response.json();
          const plan = (data.plan || "free") as Plan;
          // has_ai_access: true for paid plans, founder/admin, or free plan with remaining trial
          const canUseAI = Boolean(data.has_ai_access);
          
          // Debug log (dev only)
          if (process.env.NODE_ENV !== "production") {
            console.log("[useUserPlan] Quota data:", {
              plan: data.plan,
              role: data.role,
              has_ai_access: data.has_ai_access,
              canUseAI,
              used: data.used,
              limit: data.limit,
              remaining: data.remaining,
            });
          }
          
          setPlanInfo({
            plan,
            role: data.role,
            canUseAI,
            used: data.used,
            limit: data.limit,
            remaining: data.remaining,
            reset_at: data.reset_at,
            free_trial_used: data.free_trial_used,
            free_trial_limit: data.free_trial_limit,
            free_trial_remaining: data.free_trial_remaining,
          });
        } else {
          // Default to free if quota check fails
          setPlanInfo({
            plan: "free",
            canUseAI: false,
          });
        }
      } catch (error) {
        console.error("Failed to fetch user plan:", error);
        // Default to free on error
        setPlanInfo({
          plan: "free",
          canUseAI: false,
        });
      }
    };

    fetchPlan();
  }, []);

  return planInfo;
}
