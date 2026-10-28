// KNG Schedule - Supabase client configuration.
// IMPORTANT: use the NEW KNG SCHEDULE Supabase project here.
// Do NOT use the KNG Staff Portal project.
// The publishable/anon key is safe to ship to the browser.
// Never put a Supabase service-role/secret key in this file.

const SUPABASE_URL = 'https://okjqasuwcvrumvyakulo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fEAgFfwXMWSDjA2T0UO-aQ_5ZY5ChLn';

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
