import supabase from "../util/supabase.js";

// Records one finished scrape run (type: "story" | "image"). Logging is
// best-effort: a failure here must never fail the scrape itself.
export const insertScrapeLog = async ({ type, startedAt, finishedAt, scraped }) => {
  const { error } = await supabase.from("scrape_logs").insert({
    type,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    scraped,
  });

  if (error) {
    console.warn(`⚠️ Failed to record scrape log: ${error.message}`);
    return;
  }
  console.log(`📝 Logged ${type} scrape run: ${scraped} scraped`);
};
