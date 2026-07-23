import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://prevbislidnkafpepvsa.supabase.co';
export const ADMIN_EMAIL = 'studyflow2012@gmail.com';

let cachedClient: SupabaseClient | null | undefined;

// Service-role client for admin-only routes. This key must NEVER be sent to
// the browser — it bypasses row-level security entirely. Set
// SUPABASE_SERVICE_ROLE_KEY in your hosting platform's environment variables
// (Supabase dashboard → Project Settings → API → service_role key).
export function getServiceClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cachedClient = serviceKey ? createClient(SUPABASE_URL, serviceKey) : null;
  return cachedClient;
}

// Verifies a "Bearer <token>" auth header belongs to a real, currently-valid
// session AND that the session's email matches the admin email.
export async function verifyAdmin(authHeaderValue: string | undefined | null): Promise<boolean> {
  const sbAdmin = getServiceClient();
  if (!sbAdmin) return false;
  const token = authHeaderValue?.startsWith('Bearer ') ? authHeaderValue.slice(7) : null;
  if (!token) return false;
  const { data, error } = await sbAdmin.auth.getUser(token);
  if (error || !data?.user) return false;
  return data.user.email === ADMIN_EMAIL;
}
