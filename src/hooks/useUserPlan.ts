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
          // Use has_ai_access from API (includes premium plans OR founder/admin role)
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
