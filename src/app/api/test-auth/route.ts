import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Route Handlers have read-only cookies
          }
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();

  return NextResponse.json({
    authenticated: !!user,
    user: user ? { id: user.id, email: user.email } : null,
    hasSession: !!session,
    error: error?.message,
    cookies: cookieStore.getAll().filter(c => c.name.startsWith('sb-')).map(c => ({
      name: c.name,
      valueLength: c.value.length
    }))
  });
}
