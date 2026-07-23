import { getModels, updateModelName, updateModelImage } from "../api/model.js";
import { insertImage } from "../api/image.js";
import { insertName } from "../api/name.js";
import { click, printLine } from "../util/helpers.js";
import { getPage, surf, getDataUsageMB } from "../util/context.js";

/* ===================== SELECTORS ===================== */

const selectors = {
  avatarSelector: ".send-invite-form__avatar .ui-user-avatar__story-button",

  hangedRequestAvatarSelector:
    ".invite-request-form__avatar .ui-user-avatar__story-button",

  friendAvatarSelector:
    "#application-wrapper > div.coomeet-chat > div.chat-area.dialog-selected > div.right-column > div.messages-list > div.messages-list-header.pointer.visible > div.ui-user-avatar.stroked > div.ui-user-avatar__story-button > div.ui-user-avatar__story-button--bg",

  imageSelector: ".photo-viewer__image img",

  modelNameSelector: ".send-invite-form__username",

  declinedRequestNameSelector:
    "#application-wrapper > div.coomeet-chat > div.chat-area.dialog-selected > div.right-column > div.messages-list > div.invite-form > div > div.invite-request-form > div.invite-request-form__username",

  friendModelNameSelector:
    "#application-wrapper > div.coomeet-chat > div.chat-area.dialog-selected > div.right-column > div.messages-list > div.messages-list-header.pointer.visible > div.user-info > div.user-name > div.user-name__text",
};

/* ===================== SCRAPING ===================== */

// The name element differs per relationship state (guest invite form, friend
// chat header, declined request), so try each with a short timeout — the old
// guest-only wait had no timeout and stalled 30s on every non-guest model.
async function getModelName() {
  const page = getPage();
  for (const selector of [
    selectors.modelNameSelector,
    selectors.friendModelNameSelector,
    selectors.declinedRequestNameSelector,
  ]) {
    try {
      await page.waitForSelector(selector, { timeout: 2000 });
      return await page.$eval(selector, (el) => el.textContent.trim());
    } catch {}
  }
  return null;
}

async function getImageSrcFromPopup(modelId) {
  const page = getPage();
  try {
    // Same avatar-variant sweep as the story scraper: clicks on selectors
    // that aren't present are silently skipped.
    await click(page, selectors.avatarSelector, 500);
    await click(page, selectors.hangedRequestAvatarSelector, 500);
    await click(page, selectors.friendAvatarSelector, 500);
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
