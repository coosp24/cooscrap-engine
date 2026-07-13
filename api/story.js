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
    if (error.code === "23505")
      return `⚠️ Story already exists for model: ${modelId}`;
    throw new Error(
      `❌ Failed to insert story for model ${modelId}: ${error.message}`,
    );
  }

  return `✅ Inserted story for model: ${modelId}\n${storyUrl}`;
};
