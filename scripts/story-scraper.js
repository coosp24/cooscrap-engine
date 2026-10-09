import { getModels } from "../api/model.js";
import { insertStory } from "../api/story.js";
import { printLine, wait } from "../util/helpers.js";
import {
  getPage,
  surf,
  openDialogInApp,
  getDataUsageMB,
} from "../util/context.js";

/* ===================== SELECTORS ===================== */

const selectors = {
  // The model's own avatar in each UI. Scoped tightly: the sidebar's contact
  // avatars carry story rings too, and clicking one scrapes the wrong story.
  // The guest form's avatar already shows the ring, so there's no need to
  // click "write" first (logged in, that click doesn't change the page).
  guestAvatarSelector: ".send-invite-form__avatar .ui-user-avatar",

  promoAvatarSelector: ".promo-form__avatar .ui-user-avatar",

  hangedRequestAvatarSelector: ".invite-request-form__avatar .ui-user-avatar",

  friendAvatarSelector:
    '.messages-list-header.visible [data-name="messages-header-avatar"]',

  // Clickable part of a model's story ring, inside the avatar. The friend
  // header needs its --bg layer clicked (the outer button reports "not
  // clickable"); the request form has no --bg layer, only the button.
  storyButtonSelectors: [
    ".ui-user-avatar__story-button--bg",
    ".ui-user-avatar__story-button",
  ],

  storyViewerSelector: ".story-viewer",

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

// The model's avatar in whichever UI the page renders (guest, promo, hanged
// request or friend). It is rendered `stroked` (with a story ring) exactly when
// the model has a story, so once the avatar is on screen we know straight away
// whether there is anything to click — no timeout needed to find out that a
// story is missing.
const MODEL_AVATAR_SELECTOR = [
  selectors.guestAvatarSelector,
  selectors.promoAvatarSelector,
  selectors.hangedRequestAvatarSelector,
  selectors.friendAvatarSelector,
].join(", ");

// Generous on purpose: these waits end as soon as the element shows up (the
// avatar renders ~150ms after in-app navigation, ~1.2s after a reload, and the
// video ~150ms after the click), so they only run to the limit when a page is
// genuinely slow or broken.
const PAGE_READY_TIMEOUT = 10000;
const VIDEO_TIMEOUT = 10000;

// A model that does have a story was, rarely, first seen without its ring
// (~1 in 125 visits in testing), so a missing ring is checked once more after
// this short pause before giving up.
const NO_STORY_RECHECK_DELAY = 300;

async function getModelAvatar(modelId) {
  const page = getPage();
  try {
    // Hidden copies of these avatars stay in the DOM (e.g. the friend header
    // on a guest page) and waitForSelector({ visible }) only checks the first
    // match — so search every match for the one actually on screen.
    const avatar = await page.waitForFunction(
      (sel) =>
        [...document.querySelectorAll(sel)].find(
          (el) => el.getBoundingClientRect().width > 0,
        ),
      { timeout: PAGE_READY_TIMEOUT },
      MODEL_AVATAR_SELECTOR,
    );
    return avatar.asElement();
  } catch {
    throw new Error(`❌ Model page did not load for model: ${modelId}`);
  }
}

async function getStoryButton(modelId) {
  const avatar = await getModelAvatar(modelId);
  const hasStory = await avatar.evaluate((el) =>
    el.classList.contains("stroked"),
  );
  if (!hasStory) return null;

  for (const selector of selectors.storyButtonSelectors) {
    const button = await avatar.$(selector);
    if (button) return button;
  }
  return null;
}

async function findStoryButton(modelId) {
  const storyButton = await getStoryButton(modelId);
  if (storyButton) return storyButton;
  await wait(NO_STORY_RECHECK_DELAY);
  return getStoryButton(modelId);
}

// In-app navigation is the fast path; a full reload is the fallback whenever
// it doesn't work out, so a change on the site slows the run down rather than
// losing stories.
async function openStoryButton(modelId) {
  const leftovers = `${MODEL_AVATAR_SELECTOR}, ${selectors.storyViewerSelector}`;
  if (await openDialogInApp(modelId, leftovers)) {
    try {
      return await findStoryButton(modelId);
    } catch {}
  }
  console.warn(`↻ In-app navigation failed — reloading for model: ${modelId}`);
  await surf(modelId);
  return findStoryButton(modelId);
}

async function getVideoSrcFromPopup(modelId) {
  const page = getPage();

  const storyButton = await openStoryButton(modelId);
  if (!storyButton) {
    throw new Error(`❌ Story does not exist for model: ${modelId}`);
  }

  try {
    await storyButton.click();
    // Wait for the src itself, not just the <video> element, which can be
    // in the DOM a moment before its src is set.
    const src = await page.waitForFunction(
      (sel) => document.querySelector(sel)?.src,
      { timeout: VIDEO_TIMEOUT },
      selectors.storySelector,
    );
    return await src.jsonValue();
  } catch {
    throw new Error(`❌ Story video did not load for model: ${modelId}`);
  }
}

export async function scrapeStory(modelId) {
  try {
    const videoSrc = await getVideoSrcFromPopup(modelId);

    // Dedupe is handled by the DB (story URL is unique): a duplicate insert
    // reports inserted=false, so only genuinely new stories are counted.
    const res = await insertStory(modelId, videoSrc);
    console.log(res.message);
    return res.inserted;
  } catch (error) {
    console.warn(error.message);
    return false;
  }
}

export default async function scrape() {
  const models = await getModels();
  let storiesScraped = 0;

  for (const [index, model] of models.entries()) {
    printLine();
    const name = model.name || model.id;
    console.log(
      `🎬 Scraping story for model: ${name} (${model.id}) (${index + 1}/${models.length})`,
    );
    const saved = await scrapeStory(model.id);
    if (saved) storiesScraped++;
  }

  printLine();
  console.log(`🎞️  Stories scraped:  ${storiesScraped}`);
  console.log(`📡 Data consumed:    ${getDataUsageMB()} MB`);
  return storiesScraped;
}
