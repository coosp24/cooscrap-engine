import supabase from "../util/supabase.js";

export const getImages = async () => {
  const { data, error } = await supabase.from("model_images").select();
  console.log(data || error);
  return data;
};

export const insertImage = async (modelId, imageUrl) => {
  const { error } = await supabase
    .from("model_images")
    .insert({ model_id: modelId, image_url: imageUrl })
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505")
      return `⚠️ Image already exists for model ${modelId}`;
    throw new Error(
      `❌ Failed to insert image for model ${modelId}: ${error.message}`,
    );
  }

  return `✅ Inserted image for model: ${modelId}\n${imageUrl}`;
};
