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
          console.info("[NativeOAuthCallback] Deep link requires auth, redirecting to /login.");
          router.replace("/login");
          return;
        }
      }

      console.info("[NativeOAuthCallback] Routing deep link:", deepLinkPath);
      router.replace(deepLinkPath);
    };

    const handleUrl = async (incomingUrl: string) => {
      if (inProgressRef.current) return;
      if (processedRef.current === incomingUrl) return;

      try {
        console.info("[NativeOAuthCallback] appUrlOpen:", incomingUrl);
        const parsed = new URL(incomingUrl);
        if (!isOAuthCallbackUrl(parsed)) {
          await routeDeepLinkIfSupported(incomingUrl);
          return;
        }

        processedRef.current = incomingUrl;
        inProgressRef.current = true;
        void Browser.close();

        const query = parsed.searchParams;
        const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        const code = query.get("code") ?? hash.get("code");
        const accessToken = hash.get("access_token") ?? query.get("access_token");
        const refreshToken = hash.get("refresh_token") ?? query.get("refresh_token");

        if (accessToken && refreshToken) {
          console.info("[NativeOAuthCallback] Restoring session via access+refresh token.");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          console.info("[NativeOAuthCallback] Restoring session via code exchange.");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          throw new Error("OAuth callback missing code and tokens.");
        }

        // Guard against race conditions where cookies/local storage are not ready yet.
        let hasSession = false;
        for (let i = 0; i < 5; i += 1) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            hasSession = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 120));
        }

        if (!hasSession) {
          throw new Error("Session restoration completed but no active session was found.");
        }

        console.info("[NativeOAuthCallback] Session restored. Redirecting to /decks.");
        router.replace(DECKS_PATH);
      } catch (error) {
        console.error("[NativeOAuthCallback] Failed to process incoming URL:", error);
      } finally {
        inProgressRef.current = false;
      }
    };

    const setup = async () => {
      try {
        listener = await App.addListener("appUrlOpen", (event) => {
          void handleUrl(event.url);
        });
        console.info("[NativeOAuthCallback] appUrlOpen listener registered.");

        const launch = await App.getLaunchUrl();
        if (!cancelled && launch?.url) {
          console.info("[NativeOAuthCallback] Launch URL detected:", launch.url);
          await handleUrl(launch.url);
        }
      } catch (error) {
        console.error("[NativeOAuthCallback] Listener setup failed:", error);
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
