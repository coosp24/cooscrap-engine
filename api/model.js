import supabase from "../util/supabase.js";

export const getModels = async () => {
  const { data, error } = await supabase.from("models").select();
  // console.log(data || error);
  return data;
};
