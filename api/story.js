import supabase from "../util/supabase.js";

export const getStories = async () => {
  const { data, error } = await supabase.from("model_stories").select();
  if (error) {
    throw new Error(`❌ Failed to fetch model stories: ${error.message}`);
  }
  return data;
};

export const insertStory = async (modelId, storyUrl, modelName) => {
  const { error } = await supabase
    .from("model_stories")
    .insert({ model_id: modelId, story_url: storyUrl, model_name: modelName })
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505")
      return `⚠️ Story already exists for model (${modelName}) ${modelId}`;
    throw new Error(
      `❌ Failed to insert story for model ${modelId} (${modelName}): ${error.message}`,
    );
  }

  return `✅ Inserted story for model: ${modelId} (${modelName})\n${storyUrl}`;
};
