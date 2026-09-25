import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';
import type { TimeOfDay } from '@/components/AddToStackSheet';
import { parseServings } from '@/utils/servings';

/**
 * Best-effort server sync for the local stack. The local AppState stack is
 * the source of truth for the UI; these calls mirror changes to the account
 * when signed in and never throw.
 */

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function syncAddToStack(productId: string, timeOfDay: TimeOfDay, loggedAt: Date, quantity?: string) {
  try {
    const token = await accessToken();
    if (token) await api.addToStack(token, productId, timeOfDay, { loggedAt, notes: quantity, quantity: parseServings(quantity) });
  } catch { /* the stack tab re-syncs on focus */ }
}

export async function syncRemoveFromStack(productId: string) {
  try {
    const token = await accessToken();
    if (!token) return;
    const entries = await api.getStack(token);
    const entry = entries.find((e) => e.product_id === productId);
    if (entry) await api.removeFromStack(token, entry.id);
  } catch { /* non-fatal */ }
}
