import supabase from "../util/supabase.js";

export const getModels = async () => {
  const { data, error } = await supabase.from("models").select();
  if (error) {
    throw new Error(`❌ Failed to fetch model data: ${error.message}`);
  }
  return data;
};
