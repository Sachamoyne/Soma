"use client";

import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { isNativeApp, isNativeIOS } from "@/lib/native";

type OAuthProvider = "google" | "apple";

// iOS: redirect to an HTTPS intermediate page that triggers the soma:// deep link.
// SFSafariViewController (used by @capacitor/browser) cannot navigate to custom
// URL schemes directly, so we bounce through this HTTPS page first.
const IOS_OAUTH_REDIRECT_URL = "https://soma-edu.com/auth/native-callback";

interface OAuthButtonsProps {
  loading?: boolean;
  disabled?: boolean;
  onError: (message: string) => void;
}

export function OAuthButtons({ loading: externalLoading, disabled, onError }: OAuthButtonsProps) {
  const { t } = useTranslation();
  const [oauthLoading, setOauthLoading] = useState(false);
  const nativeIOS = isNativeIOS();
  const showApple = isNativeApp();
  const loading = externalLoading || oauthLoading;

  const startOAuth = async (provider: OAuthProvider) => {
    setOauthLoading(true);
    onError("");

    try {
      const platform = nativeIOS ? "ios" : "web";
      console.log(`[OAuth] Starting ${provider} on ${platform}...`);

      const supabase = createClient();

      const redirectTo = nativeIOS
        ? IOS_OAUTH_REDIRECT_URL
        : `${window.location.origin}/auth/callback`;

      console.log(`[OAuth] redirectTo: ${redirectTo}`);
      console.log(`[OAuth] skipBrowserRedirect: ${nativeIOS}`);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: nativeIOS,
        },
      });

      console.log("[OAuth] signInWithOAuth result — error:", error);
      console.log("[OAuth] signInWithOAuth result — data:", JSON.stringify(data));
      console.log("[OAuth] signInWithOAuth result — data.url:", data?.url);

      if (error) {
        console.error(`[OAuth] ${provider} error:`, error.message);
        onError(t("auth.unexpectedError"));
        setOauthLoading(false);
        return;
      }

      if (nativeIOS) {
        if (!data?.url) {
          console.error(`[OAuth] CRITICAL: data.url is missing for ${provider} on iOS. data =`, JSON.stringify(data));
          onError(t("auth.unexpectedError"));
          setOauthLoading(false);
          return;
        }

        if (!/^https?:\/\//i.test(data.url)) {
          console.error(`[OAuth] Invalid URL returned:`, data.url);
          onError(t("auth.unexpectedError"));
          setOauthLoading(false);
          return;
        }

        console.log(`[OAuth] Opening system browser with URL: ${data.url.substring(0, 100)}...`);
        await Browser.open({ url: data.url });
        setOauthLoading(false);
        return;
      }

      // Web: Supabase handles the redirect automatically (skipBrowserRedirect is false)
      console.log(`[OAuth] ${provider} redirect initiated (web)`);
    } catch (err) {
      console.error(`[OAuth] Unexpected error during ${provider}:`, err);
      onError(t("auth.unexpectedError"));
      setOauthLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => startOAuth("google")}
        className="w-full h-11"
        disabled={loading || disabled}
      >
        <svg
          className="mr-2 h-4 w-4"
          aria-hidden="true"
          focusable="false"
          role="img"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 488 512"
        >
          <path
            fill="#4285F4"
            d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
          />
        </svg>
        {t("auth.continueWithGoogle")}
      </Button>

      {showApple && (
        <Button
          type="button"
          variant="outline"
          onClick={() => startOAuth("apple")}
          className="w-full h-11"
          disabled={loading || disabled}
        >
          <svg
            className="mr-2 h-4 w-4"
            aria-hidden="true"
            focusable="false"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 384 512"
          >
            <path
              fill="currentColor"
              d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-62.1 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
            />
          </svg>
          Continue with Apple
        </Button>
      )}
    </>
  );
}
