"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  buildPostAuthRedirectPath,
  consumeAuthCallbackUrl,
} from "@/lib/auth-callback";
import { isNativeApp } from "@/lib/native";
import { useTranslation } from "@/i18n";

export default function AuthCallbackPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const supabase = createClient();

    const run = async () => {
      const callbackUrl = window.location.href;
      const result = await consumeAuthCallbackUrl(supabase, callbackUrl);

      if (result.error) {
        console.error("[auth/callback] Failed to restore session:", result.error);
      }

      // Best-effort profile provisioning for OAuth and email verification edge-cases.
      await fetch("/api/auth/ensure-profile", { method: "POST" }).catch(() => undefined);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const target = buildPostAuthRedirectPath(isNativeApp(), Boolean(user));
      router.replace(target);
      router.refresh();
    };

    void run();
  }, [router]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <p className="text-sm text-muted-foreground">{t("auth.finalizingAuthentication")}</p>
    </div>
  );
}
