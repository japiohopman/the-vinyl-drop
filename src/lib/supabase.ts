import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from '../config/env';

// Polyfill global WebSocket if missing in Node < 22 runtime environments
if (typeof globalThis.WebSocket === 'undefined') {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (globalThis as any).WebSocket = WebSocket;
}

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
