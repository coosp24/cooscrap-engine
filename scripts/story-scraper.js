import { getModels } from "../api/model.js";
import { insertStory } from "../api/story.js";
import { printLine, wait } from "../util/helpers.js";
import {
  getPage,
  surf,
  surfProfile,
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

  // The invite form's blue button: sends her a friend request.
  inviteButtonSelector: ".send-invite-form__actions .ui-simple-button.color-blue",

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

/* ===================== FRIEND REQUESTS ===================== */

// coomeet only shows a model's story — her ring, on every page of hers, logged
// in or out — to an account that has sent her a friend request or is her
// friend. A model added to the collection without one never shows a story, so
// the scraper sends the request itself, then reads her story as usual.
//
// No limit by default: every stranger in the collection is sent one, every
// run. MAX_REQUESTS_PER_RUN can set a cap if one is ever wanted.
const MAX_REQUESTS_PER_RUN = process.env.MAX_REQUESTS_PER_RUN
  ? Number(process.env.MAX_REQUESTS_PER_RUN)
  : Infinity;
const REQUEST_SENT_TIMEOUT = 5000;

let requestsSent = 0;

// A stranger: her page is the plain invite form — no request waiting, not a
// friend — which is the only case a request is sent for.
async function isStranger() {
  return getPage().evaluate((sel) => {
    const visible = (s) =>
      [...document.querySelectorAll(s)].some((el) => el.getBoundingClientRect().width > 0);
    return (
      visible(sel.guestAvatarSelector) &&
      !visible(sel.hangedRequestAvatarSelector) &&
      !visible(sel.friendAvatarSelector)
    );
  }, selectors);
}

// coomeet's refusal, e.g. "Action unavailable — Account blocked" when her own
// account is blocked. It stays over the page until closed.
const POPUP_SELECTOR = ".popup-overlay.visible";

const closePopup = async () => {
  const page = getPage();
  await page.evaluate((sel) => {
    const popup = document.querySelector(sel);
    const close = [...(popup?.querySelectorAll("button, [class*='button']") ?? [])].find((el) =>
      /close/i.test(el.innerText),
    );
    close?.click();
  }, POPUP_SELECTOR);
  await page.keyboard.press("Escape");
};

// Sends the request from her profile link, which adds her even when she's a
// model coomeet won't let you add from elsewhere yet. Answers { sent: true }
// once the page shows it went — the form turned into a waiting request, or the
// button went away — or { sent: false, reason } with coomeet's refusal.
async function sendFriendRequest(modelId) {
  const page = getPage();
  await surfProfile(modelId);
  let button;
  try {
    button = await page.waitForFunction(
      (sel) =>
        [...document.querySelectorAll(sel)].find((el) => el.getBoundingClientRect().width > 0),
      { timeout: PAGE_READY_TIMEOUT },
      selectors.inviteButtonSelector,
    );
  } catch {
    return { sent: false, reason: "her invite form didn't load" };
  }
  await button.asElement().click();
  try {
    const outcome = await page.waitForFunction(
      (sel, popupSel) => {
        const visible = (s) =>
          [...document.querySelectorAll(s)].some((el) => el.getBoundingClientRect().width > 0);
        if (visible(sel.hangedRequestAvatarSelector) || !visible(sel.inviteButtonSelector)) {
          return { sent: true };
        }
        const popup = document.querySelector(popupSel);
        if (popup) return { sent: false, reason: popup.innerText.replace(/\s+/g, " ").replace(/close$/i, "").trim() };
        return null;
      },
      { timeout: REQUEST_SENT_TIMEOUT },
      selectors,
      POPUP_SELECTOR,
    );
    const result = await outcome.jsonValue();
    if (!result.sent) await closePopup();
    return result;
  } catch {
    return { sent: false, reason: "the page didn't react" };
  }
}

// Her story button, sending her a request first when that's what's hiding it.
async function storyButtonFor(modelId) {
  const storyButton = await openStoryButton(modelId);
  if (storyButton) return storyButton;
  if (requestsSent >= MAX_REQUESTS_PER_RUN || !(await isStranger())) return null;

  const request = await sendFriendRequest(modelId);
  if (!request.sent) {
    console.warn(`⚠️ Couldn't send a friend request to model: ${modelId} — ${request.reason}`);
    return null;
  }
  requestsSent++;
  console.log(`📨 Sent a friend request to model: ${modelId} (${requestsSent} this run)`);
  // Her page is now the waiting-request form, which shows her ring.
  return findStoryButton(modelId);
}

async function getVideoSrcFromPopup(modelId) {
  const page = getPage();

  const storyButton = await storyButtonFor(modelId);
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

export default async function scrape({ only = null } = {}) {
  // `only` (index.js --model=<id>[,<id>…]): just those, for testing a change.
  const models = only
    ? only.split(",").map((id) => ({ id: id.trim(), name: null }))
    : await getModels();
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
  console.log(`📨 Requests sent:    ${requestsSent}`);
  console.log(`📡 Data consumed:    ${getDataUsageMB()} MB`);
  return storiesScraped;
}
