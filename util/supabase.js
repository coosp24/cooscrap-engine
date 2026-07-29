import { createClient } from "@supabase/supabase-js";

// The scraper tables are writable with the anon key, but the login step reads
// the primary account's credentials out of `accounts`, which is admin-only
// under RLS. The service role key bypasses RLS and is safe to use here — the
// engine only ever runs on CI or locally, never in a browser — so prefer it and
// fall back to anon for runs that don't need to log in.
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!process.env.SUPABASE_URL || !key) {
  throw new Error(
    "Missing Supabase environment variables. Please check your .env file.",
  );
}

const supabase = createClient(process.env.SUPABASE_URL, key);

export default supabase;
