"use client";

import { useEffect, useRef } from "react";
import { isNativeIOS } from "@/lib/native";

/**
 * Initializes RevenueCat and syncs the iOS subscription plan with Supabase.
 *
 * - Runs once per app session on native iOS only (no-op on web)
 * - Fetches the Supabase user ID, passes it to RevenueCat as the App User ID
 * - Reads current entitlements and calls /api/revenuecat/sync-plan
 *
 * Usage: call inside NativeAppLayout (AppShellClient.tsx) alongside
 * usePushNotifications().
 */
export function useRevenueCat(): void {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    if (!isNativeIOS()) return;

    initialized.current = true;
    void initAndSync();
  }, []);
}

// ─── Implementation (module-level, not a hook) ───────────────────────────────

async function initAndSync(): Promise<void> {
  try {
    // Dynamic import to avoid loading Supabase client code path on SSR
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("[RC] No authenticated user — skipping init");
      return;
    }

    const { initRevenueCat, checkUserSubscription } = await import(
      "@/services/revenuecat"
    );

    await initRevenueCat(user.id);

    const plan = await checkUserSubscription();
    console.log("[RC] Startup entitlement check → plan:", plan);

    await syncPlanWithSupabase(plan);
  } catch (error) {
    // Non-fatal — app continues normally; plan will be re-synced on next purchase
    console.error("[RC] Startup init error:", error);
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
      console.log("[RC] Supabase plan synced:", data.plan ?? plan);
    } else {
      const text = await response.text();
      console.error("[RC] Sync-plan API error:", response.status, text);
    }
  } catch (error) {
    console.error("[RC] Failed to reach sync-plan endpoint:", error);
  }
}
