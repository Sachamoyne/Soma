import AppShellClient from "./AppShellClient";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isNativeIOSUserAgent } from "@/lib/native-server";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const nativeIOSRequest = isNativeIOSUserAgent(headerStore.get("user-agent"));

  // Simple server-side auth guard for all routes under (app)
  // - If no authenticated user: redirect to /login
  // - If authenticated: render the authenticated app shell
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // subscription_status is the SINGLE SOURCE OF TRUTH
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status")
    .eq("id", user.id)
    .single();

  const subscriptionStatus = (profile as any)?.subscription_status as string | null | undefined;

  // RULE 1: subscription_status === "active" → unconditional access
  if (subscriptionStatus === "active") {
    return <AppShellClient>{children}</AppShellClient>;
  }

  // RULE 2: subscription_status === "pending_payment" → /pricing
  if (subscriptionStatus === "pending_payment") {
    redirect(nativeIOSRequest ? "/decks" : "/pricing");
  }

  // RULE 3: Free user (null or "free") → email required for email/password signups only.
  // OAuth users (Google, Apple) have verified emails by definition — skip the check.
  const isOAuthUser = user.app_metadata?.provider !== "email";
  if (!isOAuthUser && !user.email_confirmed_at) {
    redirect("/login");
  }

  // Free user with confirmed email → access granted

  return <AppShellClient>{children}</AppShellClient>;
}
