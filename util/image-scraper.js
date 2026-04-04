import { getModels } from "../api/model.js";
import { insertImage } from "../api/image.js";
import { click } from "./helpers.js";

/* ===================== SCRAPING ===================== */

async function getImageSrcFromPopup(page, modelId) {
  try {
    const avatarSelector =
      "#application-wrapper > div.coomeet-chat > div.chat-area.dialog-selected > div.right-column > div.messages-list > div.invite-form > div > div.send-invite-form > div.send-invite-form__avatar > div > div.ui-user-avatar__story-button";

    const imageSelector =
      "#application-wrapper > div.coomeet-chat > div.popup-overlay-wrapper > div.popup-overlay.visible > div > div.popup-overlay-content > div > div.ui-scroll-area > div > div.popup-component > div > div.photo-viewer__image > img";

    await click(page, avatarSelector, 2000);
    await page.waitForSelector(imageSelector, { timeout: 2000 });

    return page.$eval(imageSelector, (img) => img.src);
  } catch {
    throw new Error(`❌ Image does not exist for model: ${modelId}`);
  }
}

async function scrapeImage(page, modelId) {
  try {
    const imgSrc = await getImageSrcFromPopup(page, modelId);
    const res = await insertImage(modelId, imgSrc);
    console.log(res);
  } catch (error) {
    console.warn(error.message);
  }
}

export async function scrape(page, config) {
  const models = await getModels();
  for (const model of models) {
    console.log(`Scraping image for model: ${model.id}`);
    await page.goto(`${config.url}/${model.id}`, {
      waitUntil: "domcontentloaded",
    });
    await scrapeImage(page, model.id);
    console.log("---------------------------------------------");
  }
}
