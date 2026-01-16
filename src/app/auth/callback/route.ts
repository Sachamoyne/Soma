import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  // Default redirect to /decks (main app) instead of /welcome
  const redirectPath = nextParam && nextParam.startsWith("/") ? nextParam : "/decks";
  const redirectUrl = new URL(redirectPath, url.origin);

  if (!code) {
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  
  if (error) {
    console.error("[auth/callback] Error exchanging code for session:", error);
    return NextResponse.redirect(redirectUrl);
  }

  // Ensure profile exists after OAuth authentication
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

        // Create profile if it doesn't exist (idempotent)
        await adminSupabase
          .from("profiles")
          .upsert(
            {
              id: data.user.id,
              email: data.user.email || "",
              role: "user",
              plan: "free",
            },
            {
              onConflict: "id",
              ignoreDuplicates: false,
            }
          );
      }
    } catch (profileError) {
      // Log but don't fail - profile creation is non-blocking
      console.error("[auth/callback] Failed to ensure profile:", profileError);
    }
  }

  return NextResponse.redirect(redirectUrl);
}
