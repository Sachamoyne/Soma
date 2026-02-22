import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicUrl } from "@/lib/env";

/**
 * Supabase admin client — uses the service role key.
 *
 * ONLY use server-side (API routes / server actions).
 * Never import this file in client components.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
export function createAdminClient() {
  const url = getSupabasePublicUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
