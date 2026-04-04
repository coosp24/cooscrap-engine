import { getModels } from "../api/model.js";
import { insertImage } from "../api/image.js";
import { click, printLine } from "../util/helpers.js";
import { getPage, surf } from "../util/context.js";

/* ===================== SELECTORS ===================== */

const selectors = {
  avatarSelector: ".send-invite-form__avatar .ui-user-avatar__story-button",

  imageSelector: ".photo-viewer__image img",

  modelNameSelector: ".send-invite-form__username",
};

/* ===================== SCRAPING ===================== */

async function getImageSrcFromPopup(modelId, modelName) {
  const page = getPage();
  try {
    await click(page, selectors.avatarSelector, 500);
    await page.waitForSelector(selectors.imageSelector, { timeout: 500 });

    return page.$eval(selectors.imageSelector, (img) => img.src);
  } catch {
    throw new Error(
      `❌ Image does not exist for model: ${modelId} (${modelName})`,
    );
  }
}

export async function scrapeImage(modelId) {
  printLine();
  console.log(`🐦 Scraping image for model: ${modelId}`);
  const page = getPage();
  try {
    await surf(modelId);
    const modelNameEl = await page.waitForSelector(selectors.modelNameSelector);
    const modelName = await modelNameEl.evaluate((el) => el.textContent.trim());
    const imgSrc = await getImageSrcFromPopup(modelId, modelName);
    const res = await insertImage(modelId, imgSrc, modelName);
    console.log(res);
  } catch (error) {
    console.warn(error.message);
  }
}

export default async function scrape() {
  const models = await getModels();
  for (const model of models) {
    await scrapeImage(model.id);
  }
}
