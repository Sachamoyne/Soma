"use client";

import { useEffect, useState } from "react";

export type Plan = "free" | "starter" | "pro";

interface PlanInfo {
  plan: Plan;
  canUseAI: boolean;
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
          setPlanInfo({
            plan,
            canUseAI: plan !== "free",
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
