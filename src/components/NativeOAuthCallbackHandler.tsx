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

    const handleUrl = async (incomingUrl: string) => {
      if (inProgressRef.current) return;
      if (processedRef.current === incomingUrl) return;

      try {
        const parsed = new URL(incomingUrl);
        if (!isOAuthCallbackUrl(parsed)) return;

        processedRef.current = incomingUrl;
        inProgressRef.current = true;
        void Browser.close();

        const query = parsed.searchParams;
        const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        const code = query.get("code") ?? hash.get("code");
        const accessToken = hash.get("access_token") ?? query.get("access_token");
        const refreshToken = hash.get("refresh_token") ?? query.get("refresh_token");
        const nextPath = query.get("next");
        const redirectPath = nextPath && nextPath.startsWith("/") ? nextPath : "/decks";

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          throw new Error("OAuth callback missing code and tokens.");
        }

        router.replace(redirectPath);
      } catch (error) {
        console.error("[NativeOAuthCallback] Failed to restore session:", error);
      } finally {
        inProgressRef.current = false;
      }
    };

    const setup = async () => {
      try {
        listener = await App.addListener("appUrlOpen", (event) => {
          void handleUrl(event.url);
        });

        const launch = await App.getLaunchUrl();
        if (!cancelled && launch?.url) {
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
