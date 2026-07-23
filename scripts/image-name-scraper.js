import { getModels, updateModelName, updateModelImage } from "../api/model.js";
import { insertImage } from "../api/image.js";
import { insertName } from "../api/name.js";
import { click, printLine } from "../util/helpers.js";
import { getPage, surf, getDataUsageMB } from "../util/context.js";

/* ===================== SELECTORS ===================== */

const selectors = {
  avatarSelector: ".send-invite-form__avatar .ui-user-avatar__story-button",

  imageSelector: ".photo-viewer__image img",

  modelNameSelector: ".send-invite-form__username",
};

/* ===================== SCRAPING ===================== */

async function getImageSrcFromPopup(modelId) {
  const page = getPage();
  try {
    await click(page, selectors.avatarSelector, 500);
    await page.waitForSelector(selectors.imageSelector, { timeout: 500 });

    return page.$eval(selectors.imageSelector, (img) => img.src);
  } catch {
    throw new Error(`❌ Image does not exist for model: ${modelId}`);
  }
}

export async function scrapeName(modelId, currentName) {
  const page = getPage();
  try {
    const modelNameEl = await page.waitForSelector(selectors.modelNameSelector);
    const name = await modelNameEl.evaluate((el) => el.textContent.trim());

    if (name === currentName) {
      console.log(`⚠️  Name unchanged for model: ${modelId} (${name})`);
      return { name, scraped: false };
    }

    // A duplicate insert (name already in the history) reports
    // inserted=false, so only genuinely new names are counted.
    const res = await insertName(modelId, name);
    await updateModelName(modelId, name);
    console.log(res.message);
    return { name, scraped: res.inserted };
  } catch (error) {
    console.warn(error.message);
    return { name: null, scraped: false };
  }
}

export async function scrapeImage(modelId, currentImage) {
  try {
    const imgSrc = await getImageSrcFromPopup(modelId);

    if (imgSrc === currentImage) {
      console.log(`⚠️  Image unchanged for model: ${modelId}`);
      return false;
    }

    // Same dedupe rule as names: count only genuinely new images.
    const res = await insertImage(modelId, imgSrc);
    await updateModelImage(modelId, imgSrc);
    console.log(res.message);
    return res.inserted;
  } catch (error) {
    console.warn(error.message);
    return false;
  }
}

export default async function scrape() {
  const models = await getModels();
  let namesScraped = 0;
  let imagesScraped = 0;

  for (const model of models) {
    printLine();
    console.log(`🦅 Scraping model: ${model.id}`);
    await surf(model.id);
    const { scraped: nameSaved } = await scrapeName(model.id, model.name);
    const imageSaved = await scrapeImage(model.id, model.image);
    if (nameSaved) namesScraped++;
    if (imageSaved) imagesScraped++;
  }

  printLine();
  console.log(`🏷️  Names scraped:   ${namesScraped}`);
  console.log(`🖼️  Images scraped:  ${imagesScraped}`);
  console.log(`📡 Data consumed:   ${getDataUsageMB()} MB`);
}
