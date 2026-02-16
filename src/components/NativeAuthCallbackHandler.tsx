"use client";

import { useEffect, useRef } from "react";
import { registerPlugin } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import {
  buildPostAuthRedirectPath,
  consumeAuthCallbackUrl,
  isAuthCallbackUrl,
} from "@/lib/auth-callback";
import { isNativeApp } from "@/lib/native";

type AppUrlOpenEvent = {
  url: string;
};

type ListenerHandle = {
  remove: () => Promise<void>;
};

type CapacitorAppPlugin = {
  addListener: (
    eventName: "appUrlOpen",
    listener: (event: AppUrlOpenEvent) => void
  ) => Promise<ListenerHandle>;
  getLaunchUrl: () => Promise<{ url?: string }>;
};

const App = registerPlugin<CapacitorAppPlugin>("App");

export function NativeAuthCallbackHandler() {
  const lastHandledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;

    const supabase = createClient();

    const finalizeRedirect = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      window.location.replace(buildPostAuthRedirectPath(true, Boolean(user)));
    };

    const handleUrl = async (url: string | undefined) => {
      if (!url || !isAuthCallbackUrl(url)) return;
      if (lastHandledUrl.current === url) return;
      lastHandledUrl.current = url;

      const result = await consumeAuthCallbackUrl(supabase, url);
      if (result.error) {
        console.error("[native-auth-callback] Failed to restore session:", result.error);
      }

      // Best-effort profile provisioning for flows that don't auto-create profiles.
      await fetch("/api/auth/ensure-profile", { method: "POST" }).catch(() => undefined);
      await finalizeRedirect();
    };

    let listener: ListenerHandle | null = null;
    let disposed = false;

    const init = async () => {
      const launch = await App.getLaunchUrl().catch(() => ({ url: undefined }));
      if (!disposed) {
        await handleUrl(launch.url);
      }

      listener = await App.addListener("appUrlOpen", (event) => {
        void handleUrl(event.url);
      });
    };

    void init();

    return () => {
      disposed = true;
      if (listener) {
        void listener.remove();
      }
    };
  }, []);

  return null;
}
