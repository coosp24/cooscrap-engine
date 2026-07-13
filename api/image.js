import supabase from "../util/supabase.js";

export const getImages = async () => {
  const { data, error } = await supabase.from("images").select();
  if (error) {
    throw new Error(`❌ Failed to fetch model images: ${error.message}`);
  }
  return data;
};

export const insertImage = async (modelId, image) => {
  const { error } = await supabase
    .from("images")
    .insert({ model_id: modelId, image: image })
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505")
      return `⚠️ Image already exists for model: ${modelId}`;
    throw new Error(
      `❌ Failed to insert image for model ${modelId}: ${error.message}`,
    );
  }

  return `✅ Inserted image for model: ${modelId}\n${image}`;
};
