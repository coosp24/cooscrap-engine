import { getModels, updateModelName, updateModelImage } from "../api/model.js";
import { insertImage } from "../api/image.js";
import { insertName } from "../api/name.js";
import { click, printLine } from "../util/helpers.js";
import { getPage, surf, getDataUsageMB } from "../util/context.js";

/* ===================== SELECTORS ===================== */

// This scraper runs logged OUT (see LOGIN_OPS in index.js), so every model
// renders the guest invite form — the only UI these selectors target.
const selectors = {
  avatarSelector: ".send-invite-form__avatar .ui-user-avatar__story-button",

  imageSelector: ".photo-viewer__image img",

  modelNameSelector: ".send-invite-form__username",
};

/* ===================== SCRAPING ===================== */

async function getModelName() {
  const page = getPage();
  try {
    // Short timeout: the default (30s) stalled the whole run on any model
    // whose invite form doesn't render.
    await page.waitForSelector(selectors.modelNameSelector, { timeout: 2000 });
    return await page.$eval(selectors.modelNameSelector, (el) =>
      el.textContent.trim(),
    );
  } catch {
    return null;
  }
}

async function getImageSrcFromPopup(modelId) {
  const page = getPage();
  try {
    await click(page, selectors.avatarSelector, 500);
    await page.waitForSelector(selectors.imageSelector, { timeout: 750 });

    return page.$eval(selectors.imageSelector, (img) => img.src);
  } catch {
    throw new Error(`❌ Image does not exist for model: ${modelId}`);
  }
}

export async function scrapeName(modelId, currentName) {
  try {
    const name = await getModelName();
    if (!name) {
      throw new Error(`❌ Name not found for model: ${modelId}`);
    }

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

  for (const [index, model] of models.entries()) {
    printLine();
    console.log(
      `🦅 Scraping model: ${model.id} (${index + 1}/${models.length})`,
    );
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
