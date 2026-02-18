"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { useIsNativeIOS } from "@/hooks/useIsNativeIOS";

interface QuotaInfo {
  plan: string;
  used: number;
  limit: number;
  remaining: number;
}

export function QuotaIndicator() {
  const { t } = useTranslation();
  const isNativeIOS = useIsNativeIOS();
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const response = await fetch("/api/quota");
        if (response.ok) {
          const data = await response.json();
          setQuota(data);
        }
      } catch (error) {
        console.error("Failed to fetch quota:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuota();
  }, []);

  if (loading || !quota) {
    return null;
  }

  if (isNativeIOS) {
    return null;
  }

  // Only show for Starter plan (Pro is unlimited, Free has no AI)
  if (quota.plan !== "starter") {
    return null;
  }

  const percentage = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;
  const isLow = percentage > 80;
  const isVeryLow = percentage > 95;

  return (
    <div className="rounded-lg border bg-muted/50 p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-muted-foreground">
          Cards: {quota.used} / {quota.limit}
        </span>
        <span
          className={`font-medium ${
            isVeryLow
              ? "text-destructive"
              : isLow
              ? "text-orange-500"
              : "text-muted-foreground"
          }`}
        >
          {quota.remaining} remaining
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${
            isVeryLow
              ? "bg-destructive"
              : isLow
              ? "bg-orange-500"
              : "bg-primary"
          }`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
    </div>
  );
}
