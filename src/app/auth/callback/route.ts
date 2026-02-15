import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const DECKS_PATH = "/decks";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirectUrl = new URL(DECKS_PATH, requestUrl.origin);

  if (!code) {
    console.warn("[auth/callback] Missing code query param. Redirecting to /decks.");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] Error exchanging code for session:", error);
    return NextResponse.redirect(redirectUrl);
  }

  // Ensure profile exists after OAuth authentication.
  if (data?.user) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceKey) {
        const adminSupabase = createServiceClient(supabaseUrl, serviceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });

        // Preserve privileged roles while upserting a profile row.
        const { data: existingProfile } = await adminSupabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .single();

        const privilegedRoles = ["founder", "admin"];
        const existingRole = existingProfile?.role;
        const shouldPreserveRole = existingRole && privilegedRoles.includes(existingRole);

        await adminSupabase
          .from("profiles")
          .upsert(
            {
              id: data.user.id,
              email: data.user.email || "",
              ...(shouldPreserveRole ? { role: existingRole } : { role: "user" }),
              plan: "free",
            },
            {
              onConflict: "id",
              ignoreDuplicates: false,
            }
          );
      }
    } catch (profileError) {
      console.error("[auth/callback] Failed to ensure profile:", profileError);
    }
  }

  console.info("[auth/callback] Session exchange successful. Redirecting to /decks.");
  return NextResponse.redirect(redirectUrl);
}
