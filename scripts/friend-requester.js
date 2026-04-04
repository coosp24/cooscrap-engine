import { getModels } from "../api/model.js";
import { click, printLine } from "../util/helpers.js";
import { getPage, surf } from "../util/context.js";

/* ===================== SELECTORS ===================== */

const selectors = {
  writeButtonSelector:
    ".send-invite-form__actions .ui-simple-button.color-blue",

  writeUnfriendedButtonSelector:
    ".banned-actions .ui-simple-button.color-green",
};

/* ===================== SCRAPING ===================== */

export async function sendFriendRequest(modelId) {
  console.log(`🐦 Sending friend request to model: ${modelId}`);
  const page = getPage();
  try {
    await surf(modelId);
    await click(page, selectors.writeButtonSelector, 1000);
    await click(page, selectors.writeUnfriendedButtonSelector, 1000);
  } catch (error) {
    console.warn(`⚠️ Friend request is already pending for model: ${modelId}`);
    return;
  }
}

export default async function addModels() {
  const models = await getModels();
  printLine();
  for (const model of models) {
    await sendFriendRequest(model.id);
    printLine();
  }
}
