import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env';

let supabaseClient: SupabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export function getSupabaseClient(): SupabaseClient {
  return supabaseClient;
}

export function setSupabaseClient(client: SupabaseClient): void {
  supabaseClient = client;
}
