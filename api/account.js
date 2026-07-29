import supabase from "../util/supabase.js";

// The one account flagged as primary in the dashboard (Accounts → ⋮ → Mark as
// primary). Its credentials are what the scraper logs in with — there is no
// .env fallback any more, so switching accounts is a dashboard action.
export const getPrimaryAccount = async () => {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, email, password, banned")
    .eq("is_primary", true)
    .maybeSingle();

  if (error) {
    throw new Error(`❌ Failed to fetch the primary account: ${error.message}`);
  }

  // Reading `accounts` needs SUPABASE_SERVICE_ROLE_KEY; with only the anon key
  // RLS hides every row, which looks exactly like "no primary account set".
  if (!data) {
    throw new Error(
      "❌ No primary account available. Mark one in the dashboard (Accounts → ⋮ → Mark as primary) and make sure SUPABASE_SERVICE_ROLE_KEY is set.",
    );
  }

  if (!data.password) {
    throw new Error(
      `❌ Primary account ${data.email} has no password saved in the dashboard.`,
    );
  }

  if (data.banned) {
    console.warn(`⚠️  Primary account ${data.email} is marked as banned.`);
  }

  return data;
};
