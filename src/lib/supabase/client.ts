import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "@/lib/env";

export function createClient() {
  return createBrowserClient(
    getSupabasePublicUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        get(name: string) {
          const value = document.cookie
            .split('; ')
            .find(row => row.startsWith(name + '='))
            ?.split('=')[1];
          return value ? decodeURIComponent(value) : undefined;
        },
        set(name: string, value: string, options: any) {
          let cookie = `${name}=${encodeURIComponent(value)}; path=/`;
          if (options?.maxAge) {
            cookie += `; max-age=${options.maxAge}`;
          }
          cookie += '; SameSite=Lax';
          if (options?.secure) {
            cookie += '; Secure';
          }
          document.cookie = cookie;
        },
        remove(name: string, options: any) {
          document.cookie = `${name}=; path=/; max-age=0`;
        },
      },
    }
  );
}
