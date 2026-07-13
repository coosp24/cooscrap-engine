import supabase from "../util/supabase.js";

export const getModels = async () => {
  const { data, error } = await supabase
    .from("models")
    .select()
    .order("id", { ascending: true });
  if (error) {
    throw new Error(`❌ Failed to fetch model data: ${error.message}`);
  }
  return data;
};

export const updateModelName = async (modelId, name) => {
  const { error } = await supabase
    .from("models")
    .update({ name })
    .eq("id", modelId);

  if (error) {
    throw new Error(
      `❌ Failed to update model name for ${modelId}: ${error.message}`,
    );
  }
};

export const updateModelImage = async (modelId, image) => {
  const { error } = await supabase
    .from("models")
    .update({ image })
    .eq("id", modelId);

  if (error) {
    throw new Error(
      `❌ Failed to update model image for ${modelId}: ${error.message}`,
    );
  }
};
