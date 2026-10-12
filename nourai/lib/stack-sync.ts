import { supabase } from '@/lib/supabase';

/** The signed-in session's access token, or null for guests. Stack writes live in AppState. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
