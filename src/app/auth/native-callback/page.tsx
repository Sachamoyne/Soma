"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Intermediate page for iOS OAuth flow.
 *
 * SFSafariViewController (used by @capacitor/browser) cannot follow HTTP 302
 * redirects to custom URL schemes like soma://. After Supabase completes OAuth,
 * it redirects here (HTTPS). This page then triggers the soma:// deep link
 * which iOS intercepts, re-opening the app and passing the code to
 * NativeOAuthCallbackHandler.
 */
function NativeCallbackRedirect() {
  const searchParams = useSearchParams();
  const [showManualButton, setShowManualButton] = useState(false);

  const buildSchemeUrl = () => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      return "soma://auth/callback?error=" + encodeURIComponent(errorParam);
    }
    if (code) {
      return "soma://auth/callback?code=" + encodeURIComponent(code);
    }
    // Fallback: pass through the full query string
    const qs = searchParams.toString();
    return "soma://auth/callback" + (qs ? "?" + qs : "");
  };

  const schemeUrl = buildSchemeUrl();

  useEffect(() => {
    // Try to redirect to the custom scheme
    console.log("[NativeCallback] Redirecting to soma:// ...");
    window.location.replace(schemeUrl);

    // Show manual button as fallback after 1.5s
    const timer = setTimeout(() => {
      setShowManualButton(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [schemeUrl]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <p className="text-muted-foreground">Retour vers l&apos;application...</p>
      {showManualButton && (
        <a
          href={schemeUrl}
          className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
        >
          Ouvrir Soma
        </a>
      )}
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
