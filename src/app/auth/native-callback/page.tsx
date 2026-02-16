"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { isNativeApp } from "@/lib/native";

/**
 * OAuth callback page for iOS.
 *
 * Two modes:
 *
 * 1. CAPACITOR WEBVIEW (Universal Link navigated the WebView here):
 *    → Exchange the code directly, ensure profile, navigate to /decks.
 *    → No redirect to soma://, no intermediate page.
 *
 * 2. REGULAR BROWSER (fallback if Universal Links didn't intercept):
 *    → Try to redirect to soma:// custom scheme.
 */
function NativeCallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState("Connexion en cours...");
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      console.error("[NativeCallback] OAuth error:", errorParam);
      setStatus("Erreur d'authentification.");
      router.replace("/login?error=" + encodeURIComponent(errorParam));
      return;
    }

    if (!code) {
      console.error("[NativeCallback] No code in URL.");
      setStatus("Erreur : code manquant.");
      router.replace("/login");
      return;
    }

    // Mode 1: Inside Capacitor WebView → handle directly
    if (isNativeApp()) {
      console.log("[NativeCallback] Running inside Capacitor. Exchanging code directly...");
      handleCapacitorOAuth(code);
      return;
    }

    // Mode 2: Regular browser → try soma:// redirect
    console.log("[NativeCallback] Not in Capacitor. Trying soma:// redirect...");
    const schemeUrl = "soma://auth/callback?code=" + encodeURIComponent(code);
    window.location.replace(schemeUrl);
  }, [searchParams, router]);

  const handleCapacitorOAuth = async (code: string) => {
    try {
      // Step 1: Close any open SFSafariViewController
      try {
        const { Browser } = await import("@capacitor/browser");
        void Browser.close();
        console.log("[NativeCallback] Browser closed.");
      } catch {
        // Browser plugin might not be available
      }

      // Step 2: Exchange code for session
      console.log("[NativeCallback] Exchanging code for session...");
      setStatus("Authentification...");
      const supabase = createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[NativeCallback] exchangeCodeForSession error:", error);
        setStatus("Erreur d'authentification.");
        router.replace("/login");
        return;
      }
      console.log("[NativeCallback] Session established.");

      // Step 3: Ensure profile exists
      console.log("[NativeCallback] Ensuring profile...");
      setStatus("Préparation du compte...");
      try {
        await fetch("/api/auth/ensure-profile", { method: "POST" });
      } catch (profileErr) {
        console.warn("[NativeCallback] Profile ensure failed (non-blocking):", profileErr);
      }

      // Step 4: Navigate to /decks
      console.log("[NativeCallback] Navigating to /decks.");
      router.replace("/decks");
    } catch (err) {
      console.error("[NativeCallback] Unexpected error:", err);
      setStatus("Erreur inattendue.");
      router.replace("/login");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">{status}</p>
    </div>
  );
}

export default function NativeCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Connexion en cours...</p>
        </div>
      }
    >
      <NativeCallbackHandler />
    </Suspense>
  );
}
