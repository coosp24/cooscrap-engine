import { getModels } from "../api/model.js";
import { insertStory } from "../api/story.js";
import { click, printLine } from "../util/helpers.js";
import { getPage, surf, getDataUsageMB } from "../util/context.js";

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

/* ===================== SCRAPING ===================== */

async function getModelName(modelId) {
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

async function getVideoSrcFromPopup(modelId) {
  const page = getPage();
  try {
    await click(page, selectors.writeButtonSelector, 1500);
    await click(page, selectors.guestStoryAvatarSelector, 750);
    await click(page, selectors.hangedRequestStoryAvatarSelector, 750);
    await click(page, selectors.friendStoryAvatarSelector, 750);
    await page.waitForSelector(selectors.storySelector, { timeout: 750 });
    return page.$eval(selectors.storySelector, (story) => story.src);
  } catch {
    throw new Error(`❌ Story does not exist for model: ${modelId}`);
  }
}

export async function scrapeStory(modelId, currentStory) {
  try {
    const videoSrc = await getVideoSrcFromPopup(modelId);

    if (videoSrc === currentStory) {
      console.log(`⚠️  Story unchanged for model: ${modelId}`);
      return false;
    }

    const res = await insertStory(modelId, videoSrc);
    console.log(res);
    return true;
  } catch (error) {
    console.warn(error.message);
    return false;
  }
}

export default async function scrape() {
  const models = await getModels();
  let storiesScraped = 0;

  for (const model of models) {
    printLine();
    const name = model.name || model.id;
    console.log(`🎬 Scraping story for model: ${name} (${model.id})`);
    await surf(model.id);
    const saved = await scrapeStory(model.id, model.story);
    if (saved) storiesScraped++;
  }

  printLine();
  console.log(`🎞️  Stories scraped:  ${storiesScraped}`);
  console.log(`📡 Data consumed:    ${getDataUsageMB()} MB`);
}
