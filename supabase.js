// KNG Schedule - Supabase client configuration.
// IMPORTANT: use the NEW KNG SCHEDULE Supabase project here.
// Do NOT use the KNG Staff Portal project.
// The publishable/anon key is safe to ship to the browser.
// Never put a Supabase service-role/secret key in this file.

const SUPABASE_URL = 'PASTE_YOUR_KNG_SCHEDULE_SUPABASE_URL_HERE';
const SUPABASE_PUBLISHABLE_KEY = 'PASTE_YOUR_KNG_SCHEDULE_PUBLISHABLE_KEY_HERE';

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
