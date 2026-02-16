"use client";

import { useEffect, useMemo, useRef } from "react";
import { Browser } from "@capacitor/browser";
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isNativeIOS } from "@/lib/native";

type AppUrlOpen = { url: string };
type AppLaunchUrl = { url?: string };
type AppPlugin = {
  addListener(
    eventName: "appUrlOpen",
    listenerFunc: (event: AppUrlOpen) => void,
  ): Promise<PluginListenerHandle>;
  getLaunchUrl(): Promise<AppLaunchUrl>;
};

const App = registerPlugin<AppPlugin>("App");

/**
 * Extract code from an exact soma://auth/callback URL.
 */
function extractOAuthCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "soma:" || parsed.hostname !== "auth" || parsed.pathname !== "/callback") {
      return null;
    }
    return parsed.searchParams.get("code");
  } catch {
    return null;
  }
}

export function NativeOAuthCallbackHandler() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const inProgressRef = useRef(false);
  const processedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeIOS()) {
      console.log("[NativeOAuth] Not native iOS, skipping listener setup.");
      return;
    }
    if (!Capacitor.isPluginAvailable("App")) {
      console.log("[NativeOAuth] App plugin not available, skipping.");
      return;
    }

    let listener: PluginListenerHandle | null = null;
    let cancelled = false;

    const handleUrl = async (url: string) => {
      console.log("[NativeOAuth] ▶ appUrlOpen fired:", url);

      if (inProgressRef.current) {
        console.log("[NativeOAuth] ✗ Already processing, skipping.");
        return;
      }
      if (processedRef.current === url) {
        console.log("[NativeOAuth] ✗ Already processed this URL, skipping.");
        return;
      }

      const code = extractOAuthCode(url);
      if (!code) {
        console.log("[NativeOAuth] Not soma://auth/callback, ignoring URL.");
        return;
      }

      processedRef.current = url;
      inProgressRef.current = true;

      try {
        console.log("[NativeOAuth] 1/4 Closing browser...");
        void Browser.close();

        console.log("[NativeOAuth] 2/4 Code extracted:", code ? "yes" : "NO");

        console.log("[NativeOAuth] 3/5 Exchanging code for session...");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[NativeOAuth] exchangeCodeForSession failed:", error.message);
          return;
        }
        console.log("[NativeOAuth] 3/5 Session established ✓");

        console.log("[NativeOAuth] 4/5 Ensuring profile exists...");
        try {
          await fetch("/api/auth/ensure-profile", { method: "POST" });
        } catch (e) {
          console.warn("[NativeOAuth] ensure-profile call failed (non-blocking):", e);
        }

        if (!cancelled) {
          console.log("[NativeOAuth] 5/5 Navigating to /decks...");
          router.replace("/decks");
        }
      } catch (err) {
        console.error("[NativeOAuth] Unexpected error:", err);
      } finally {
        inProgressRef.current = false;
      }
    };

    const setup = async () => {
      // Register listener
      listener = await App.addListener("appUrlOpen", (event) => {
        console.log("[NativeOAuth] ★ appUrlOpen event received");
        void handleUrl(event.url);
      });
      console.log("[NativeOAuth] ✓ Listener registered");

      // Cold start: check if app was launched with a URL
      const launch = await App.getLaunchUrl();
      if (!cancelled && launch?.url) {
        console.log("[NativeOAuth] Cold start URL detected:", launch.url);
        await handleUrl(launch.url);
      }
    };

    void setup();

    return () => {
      cancelled = true;
      void listener?.remove();
    };
  }, [router, supabase]);

  return null;
}
