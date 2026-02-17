import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getSupabasePublicUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot set cookies; ignore for SSR reads.
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set(name, "", { ...options, maxAge: 0 });
          } catch {
            // Server Components cannot set cookies; ignore for SSR reads.
          }
        },
      },
    }
  );
}
