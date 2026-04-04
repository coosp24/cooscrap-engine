import supabase from "../util/supabase.js";

export const getStories = async () => {
  const { data, error } = await supabase.from("model_stories").select();
  console.log(data || error);
  return data;
};

export const insertStory = async (modelId, storyUrl) => {
  const { error } = await supabase
    .from("model_stories")
    .insert({ model_id: modelId, story_url: storyUrl })
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505")
      return `⚠️ Story already exists for model ${modelId}`;
    throw new Error(
      `❌ Failed to insert story for model ${modelId}: ${error.message}`,
    );
  }

  return `✅ Inserted story for model: ${modelId}\n${storyUrl}`;
};
