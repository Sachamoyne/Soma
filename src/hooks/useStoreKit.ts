"use client";

import { useEffect, useRef } from "react";
import { isNativeIOS } from "@/lib/native";

/**
 * Initializes StoreKit entitlements check and syncs the iOS subscription plan
 * with Supabase.
 *
 * - Runs once per app session on native iOS only (no-op on web)
 * - Reads current StoreKit entitlements via Transaction.currentEntitlements
 * - Calls /api/revenuecat/sync-plan to mirror the plan in Supabase
 * - Re-syncs on foreground resume (throttled, max once per 30s)
 *
 * Usage: call inside NativeAppLayout (AppShellClient.tsx).
 */
export function useStoreKit(): void {
  const initialized = useRef(false);

  // ── Initial check + sync (once per session) ────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    if (!isNativeIOS()) return;

    initialized.current = true;
    void checkAndSync();
  }, []);

  // ── Foreground re-sync (throttled) ─────────────────────────────────────────
  useEffect(() => {
    if (!isNativeIOS()) return;

    let lastSyncAt = 0;
    const THROTTLE_MS = 30_000;

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSyncAt < THROTTLE_MS) return;
      lastSyncAt = now;
      void checkAndSync();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);
}

// ─── Implementation ───────────────────────────────────────────────────────────

async function checkAndSync(): Promise<void> {
  try {
    const { checkCurrentPlan } = await import("@/services/storekit");
    const plan = await checkCurrentPlan();
    console.log("[SK] Startup entitlement check → plan:", plan);
    await syncPlanWithSupabase(plan);
  } catch (error) {
    console.error("[SK] checkAndSync error:", error);
  }
}

async function syncPlanWithSupabase(plan: string): Promise<void> {
  try {
    const response = await fetch("/api/revenuecat/sync-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("[SK] Supabase plan synced:", data.plan ?? plan);
    } else {
      const text = await response.text();
      console.error("[SK] sync-plan API error:", response.status, text);
    }
  } catch (error) {
    console.error("[SK] Failed to reach sync-plan endpoint:", error);
  }
}
