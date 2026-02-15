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
import {
  isProtectedDeepLinkPath,
  parseDeepLinkUrl,
  setPostLoginRedirect,
} from "@/lib/deepLinks";

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
const DECKS_PATH = "/decks";

function isOAuthCallbackUrl(parsed: URL): boolean {
  return (
    parsed.protocol === "soma:" &&
    ((parsed.hostname === "auth" && parsed.pathname === "/callback") ||
      parsed.hostname === "auth-callback")
  );
}

export function NativeOAuthCallbackHandler() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const inProgressRef = useRef(false);
  const processedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeIOS()) return;
    if (!Capacitor.isPluginAvailable("App")) return;

    let listener: PluginListenerHandle | null = null;
    let cancelled = false;

    const routeDeepLinkIfSupported = async (incomingUrl: string) => {
      const deepLinkPath = parseDeepLinkUrl(incomingUrl);
      if (!deepLinkPath) return;

      const protectedPath = isProtectedDeepLinkPath(deepLinkPath);
      if (protectedPath) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setPostLoginRedirect(deepLinkPath);
          console.log("[NativeOAuth] Deep link requires auth, redirecting to /login.");
          router.replace("/login");
          return;
        }
      }

      console.log("[NativeOAuth] Routing deep link:", deepLinkPath);
      router.replace(deepLinkPath);
    };

    const handleUrl = async (incomingUrl: string) => {
      // Guard: prevent double execution
      if (inProgressRef.current) {
        console.log("[NativeOAuth] Already processing a URL, skipping.");
        return;
      }
      // Guard: skip already-processed URLs
      if (processedRef.current === incomingUrl) {
        console.log("[NativeOAuth] URL already processed, skipping.");
        return;
      }

      try {
        console.log("[NativeOAuth] Step 1: appUrlOpen received:", incomingUrl);
        const parsed = new URL(incomingUrl);

        if (!isOAuthCallbackUrl(parsed)) {
          await routeDeepLinkIfSupported(incomingUrl);
          return;
        }

        processedRef.current = incomingUrl;
        inProgressRef.current = true;

        // Step 2: Close the system browser
        console.log("[NativeOAuth] Step 2: Closing browser...");
        void Browser.close();

        // Step 3: Extract tokens or code
        const query = parsed.searchParams;
        const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        const code = query.get("code") ?? hash.get("code");
        const accessToken = hash.get("access_token") ?? query.get("access_token");
        const refreshToken = hash.get("refresh_token") ?? query.get("refresh_token");

        if (accessToken && refreshToken) {
          console.log("[NativeOAuth] Step 3: Restoring session via tokens...");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          console.log("[NativeOAuth] Step 3: Exchanging code for session...");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          throw new Error("OAuth callback missing code and tokens.");
        }

        // Step 4: Confirm session is ready
        console.log("[NativeOAuth] Step 4: Confirming session...");
        let hasSession = false;
        for (let i = 0; i < 5; i += 1) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            hasSession = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        if (!hasSession) {
          throw new Error("Session restoration completed but no active session found.");
        }

        // Step 5: Ensure profile exists
        console.log("[NativeOAuth] Step 5: Ensuring profile exists...");
        try {
          await fetch("/api/auth/ensure-profile", { method: "POST" });
        } catch (profileErr) {
          // Non-blocking: profile might already exist from a previous login
          console.warn("[NativeOAuth] Profile ensure failed (non-blocking):", profileErr);
        }

        // Step 6: Navigate to /decks
        console.log("[NativeOAuth] Step 6: Redirecting to /decks");
        if (!cancelled) {
          router.replace(DECKS_PATH);
        }
      } catch (error) {
        console.error("[NativeOAuth] Failed to process OAuth callback:", error);
      } finally {
        inProgressRef.current = false;
      }
    };

    const setup = async () => {
      try {
        listener = await App.addListener("appUrlOpen", (event) => {
          void handleUrl(event.url);
        });
        console.log("[NativeOAuth] appUrlOpen listener registered.");

        const launch = await App.getLaunchUrl();
        if (!cancelled && launch?.url) {
          console.log("[NativeOAuth] Launch URL detected:", launch.url);
          await handleUrl(launch.url);
        }
      } catch (error) {
        console.error("[NativeOAuth] Listener setup failed:", error);
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
