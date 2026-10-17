import { fetchAll } from "../util/fetch-all.js";
import supabase from "../util/supabase.js";

// Every name row. Paged — a single request stops at 1000 rows.
export const getNames = () => fetchAll("names", { label: "model names" });

export const insertName = async (modelId, name) => {
  const { error } = await supabase
    .from("names")
    .insert({ model_id: modelId, name: name })
    .select()
    .maybeSingle();

  if (error) {
    // Duplicate key: the name is already in the table — not a new scrape,
    // so callers must not count it.
    if (error.code === "23505")
      return {
        inserted: false,
        message: `⚠️ Name already exists for model (${name}) ${modelId}`,
      };
    throw new Error(
      `❌ Failed to insert name for model ${modelId} (${name}): ${error.message}`,
    );
  }

  return {
    inserted: true,
    message: `✅ Inserted name for model: ${modelId} (${name})`,
  };
};
