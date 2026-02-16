import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { isNativeApp } from "@/lib/native";

export const WEB_EMAIL_CALLBACK_URL = "https://soma-edu.com/auth/callback";
export const IOS_EMAIL_CALLBACK_URL = "soma://auth/callback";

const OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  "signup",
  "magiclink",
  "invite",
  "recovery",
  "email_change",
  "email",
]);

type CallbackParams = {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  tokenHash?: string;
  type?: EmailOtpType;
};

export function getEmailRedirectTo(): string {
  return isNativeApp() ? IOS_EMAIL_CALLBACK_URL : WEB_EMAIL_CALLBACK_URL;
}

export function isAuthCallbackUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol === "soma:") {
      return (
        (parsed.hostname === "auth" && parsed.pathname === "/callback") ||
        parsed.pathname === "/auth/callback"
      );
    }

    return parsed.pathname === "/auth/callback";
  } catch {
    return false;
  }
}

export function buildPostAuthRedirectPath(native: boolean, authenticated: boolean): string {
  if (native) {
    return authenticated ? "/decks?app=1" : "/login?app=1";
  }

  return authenticated ? "/decks" : "/login";
}

function parseCallbackParams(rawUrl: string): CallbackParams {
  const parsed = new URL(rawUrl);
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));

  const pick = (key: string): string | undefined => {
    return hashParams.get(key) ?? parsed.searchParams.get(key) ?? undefined;
  };

  const type = pick("type");

  return {
    accessToken: pick("access_token"),
    refreshToken: pick("refresh_token"),
    code: pick("code"),
    tokenHash: pick("token_hash"),
    type: type && OTP_TYPES.has(type as EmailOtpType) ? (type as EmailOtpType) : undefined,
  };
}

export async function consumeAuthCallbackUrl(
  supabase: SupabaseClient,
  rawUrl: string
): Promise<{ handled: boolean; error?: string }> {
  if (!isAuthCallbackUrl(rawUrl)) {
    return { handled: false };
  }

  const { accessToken, refreshToken, code, tokenHash, type } = parseCallbackParams(rawUrl);

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return { handled: true, error: error.message };
    }

    return { handled: true };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return { handled: true, error: error.message };
    }

    return { handled: true };
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      return { handled: true, error: error.message };
    }

    return { handled: true };
  }

  return { handled: true, error: "No auth callback credentials found in URL" };
}
