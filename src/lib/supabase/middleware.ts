import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          supabaseResponse.cookies.set(name, value, options);
        },
        remove(name: string, options: any) {
          supabaseResponse.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );

  // Refreshing the auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // App mode: when ?app=1 is present on the root path, bypass the landing page
  // and redirect straight to /login (unauthenticated) or /decks (authenticated).
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/" && searchParams.get("app") === "1") {
    const target = user ? "/decks" : "/login";
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  // NOTE:
  // We only use this middleware to keep the Supabase session in sync.
  // Route protection and auth redirects are now handled in:
  // - src/app/(app)/layout.tsx (authenticated app guard)
  // - src/app/login/page.tsx (redirect authenticated users away from /login)

  return supabaseResponse;
}
