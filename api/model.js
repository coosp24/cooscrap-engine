import { fetchAll } from "../util/fetch-all.js";
import supabase from "../util/supabase.js";

// Every model, oldest first. Paged — a single request stops at 1000 rows.
export const getModels = () => fetchAll("models", { label: "model data" });

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
