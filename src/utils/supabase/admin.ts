import { createClient as createBaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      'WARNING: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Admin operations will fail.'
    );
  }

  return createBaseClient(
    supabaseUrl || '',
    serviceRoleKey || '',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
