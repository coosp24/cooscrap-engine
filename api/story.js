import { fetchAll } from "../util/fetch-all.js";
import supabase from "../util/supabase.js";

// Every story row. Paged — a single request stops at 1000 rows.
export const getStories = () => fetchAll("stories", { label: "model stories" });

// Inserts many stories ({ model_id, story } rows) in one request, quietly
// skipping the ones already in the table (the story URL is the primary key).
// Answers the rows that were new — so only genuinely new stories are counted.
export const insertStories = async (rows) => {
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from("stories")
    .upsert(rows, { onConflict: "story", ignoreDuplicates: true })
    .select("model_id, story");

  if (error) {
    throw new Error(`❌ Failed to insert ${rows.length} stories: ${error.message}`);
  }
  return data ?? [];
};
