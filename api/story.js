import supabase from "../util/supabase.js";

export const getStories = async () => {
  const { data, error } = await supabase.from("stories").select();
  if (error) {
    throw new Error(`❌ Failed to fetch model stories: ${error.message}`);
  }
  return data;
};

export const insertStory = async (modelId, storyUrl) => {
  const { error } = await supabase
    .from("stories")
    .insert({ model_id: modelId, story: storyUrl })
    .select()
    .maybeSingle();

  if (error) {
    // Duplicate key: the story is already in the table — not a new scrape,
    // so callers must not count it.
    if (error.code === "23505")
      return {
        inserted: false,
        message: `⚠️ Story already exists for model: ${modelId}`,
      };
    throw new Error(
      `❌ Failed to insert story for model ${modelId}: ${error.message}`,
    );
  }

  return {
    inserted: true,
    message: `✅ Inserted story for model: ${modelId}\n${storyUrl}`,
  };
};
