"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Intermediate page for iOS OAuth flow.
 *
 * SFSafariViewController (used by @capacitor/browser) cannot navigate to
 * custom URL schemes like soma://. After Supabase completes OAuth, it
 * redirects here (HTTPS). This page then triggers the soma:// deep link
 * which iOS intercepts, re-opening the app and passing the code to
 * NativeOAuthCallbackHandler.
 */
function NativeCallbackRedirect() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (errorParam) {
      console.error("[NativeCallback] OAuth error:", errorParam, errorDescription);
      // Redirect to login on error
      window.location.href = "soma://auth/callback?error=" + encodeURIComponent(errorParam);
      return;
    }

    if (code) {
      console.log("[NativeCallback] Redirecting to soma:// with code...");
      window.location.href = "soma://auth/callback?code=" + encodeURIComponent(code);
      return;
    }

    // Fallback: pass through the full query string
    const qs = searchParams.toString();
    console.log("[NativeCallback] Redirecting to soma:// with query:", qs);
    window.location.href = "soma://auth/callback" + (qs ? "?" + qs : "");
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Redirecting...</p>
    </div>
  );
}

export default function NativeCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <NativeCallbackRedirect />
    </Suspense>
  );
}
