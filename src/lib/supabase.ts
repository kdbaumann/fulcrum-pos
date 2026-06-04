import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read from Vite env (.env.local locally; Netlify env vars in production).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when Supabase credentials are present. When false, the app runs in
 *  local-only mode (localStorage) so nothing breaks during the backend transition. */
export const isSupabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
