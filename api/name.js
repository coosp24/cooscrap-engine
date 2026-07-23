import supabase from "../util/supabase.js";

export const getNames = async () => {
  const { data, error } = await supabase.from("names").select();
  if (error) {
    throw new Error(`❌ Failed to fetch model names: ${error.message}`);
  }
  return data;
};

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
