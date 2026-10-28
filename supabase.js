// KNG Staff Portal - Supabase client configuration.
// The publishable/anon key is safe to ship to the browser.
// Database security is enforced by Supabase RLS and server-side functions.
const SUPABASE_URL = 'https://xjlndqjaorgntfkfoakn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vMjTiNITLlElwFV7_bSuIw_qjFDbNe0';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
