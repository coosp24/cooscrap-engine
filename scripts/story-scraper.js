import { getModels } from "../api/model.js";
import { insertStory } from "../api/story.js";
import { click, printLine } from "../util/helpers.js";
import { getPage, surf } from "../util/context.js";

/* ===================== SELECTORS ===================== */

const selectors = {
  writeButtonSelector:
    ".send-invite-form__actions .ui-simple-button.color-blue",

  guestStoryAvatarSelector: ".promo-form__avatar .ui-user-avatar__story-button",

  hangedRequestStoryAvatarSelector:
    ".invite-request-form__avatar .ui-user-avatar__story-button",

  friendStoryAvatarSelector:
    "#application-wrapper > div.coomeet-chat > div.chat-area.dialog-selected > div.right-column > div.messages-list > div.messages-list-header.pointer.visible > div.ui-user-avatar.stroked > div.ui-user-avatar__story-button > div.ui-user-avatar__story-button--bg",

  storySelector: ".story-viewer__video video",

  guestModelNameSelector: ".send-invite-form__username",

  declinedRequestStoryNameSelector:
    "#application-wrapper > div.coomeet-chat > div.chat-area.dialog-selected > div.right-column > div.messages-list > div.invite-form > div > div.invite-request-form > div.invite-request-form__username",

  friendModelNameSelector:
    "#application-wrapper > div.coomeet-chat > div.chat-area.dialog-selected > div.right-column > div.messages-list > div.messages-list-header.pointer.visible > div.user-info > div.user-name > div.user-name__text",
};

/* ===================== SCRAPING LOGIC ===================== */

async function getModelName() {
  const page = getPage();
  for (const selector of [
    selectors.guestModelNameSelector,
    selectors.friendModelNameSelector,
    selectors.declinedRequestStoryNameSelector,
  ]) {
    try {
      await page.waitForSelector(selector, { timeout: 2000 });
      return await page.$eval(selector, (el) => el.textContent.trim());
    } catch {}
  }
  return null;
}

async function getVideoSrcFromPopup(modelId, modelName) {
  const page = getPage();
  printLine();
  console.log(`🐦 Scraping story for model: ${modelId} (${modelName})`);
  try {
    await click(page, selectors.writeButtonSelector, 750);
    await click(page, selectors.guestStoryAvatarSelector, 750);
    await click(page, selectors.hangedRequestStoryAvatarSelector, 750);
    await click(page, selectors.friendStoryAvatarSelector, 750);
    await page.waitForSelector(selectors.storySelector, { timeout: 750 });
    return page.$eval(selectors.storySelector, (story) => story.src);
  } catch {
    throw new Error(`❌ Story does not exist for model: ${modelId}`);
  }
}

export async function scrapeStory(modelId) {
  try {
    await surf(modelId);
    const modelName = await getModelName();
    const videoSrc = await getVideoSrcFromPopup(modelId, modelName);
    const res = await insertStory(modelId, videoSrc, modelName);
    console.log(res);
  } catch (error) {
    console.warn(error.message);
  }
}

export default async function scrape() {
  const models = await getModels();
  for (const model of models) {
    await scrapeStory(model.id);
  }
}
