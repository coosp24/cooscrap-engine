import { getModels, updateModelName, updateModelImage } from "../api/model.js";
import { insertImage } from "../api/image.js";
import { insertName } from "../api/name.js";
import { printLine, wait } from "../util/helpers.js";
import {
  getPage,
  surf,
  openDialogInApp,
  getDataUsageMB,
} from "../util/context.js";

/* ===================== SELECTORS ===================== */

// This scraper runs logged OUT (see LOGIN_OPS in index.js), so every model
// renders the guest invite form — the only UI these selectors target.
const selectors = {
  avatarSelector: ".send-invite-form__avatar .ui-user-avatar",

  avatarImageSelector: ".ui-user-avatar__image",

  modelNameSelector: ".send-invite-form__username",
};

// What the site shows instead of a name once a model's account is gone. Those
// models are renamed by hand in the dashboard, so this is never recorded — see
// scrapeName.
const DELETED_ACCOUNT_NAME = "account deleted";

const isDeletedAccount = (name) =>
  name.trim().toLowerCase() === DELETED_ACCOUNT_NAME;

/* ===================== SCRAPING ===================== */

// Generous on purpose: the wait ends as soon as the form renders (~150ms after
// in-app navigation, ~1s after a reload), so it only runs to the limit when a
// page is slow or broken.
const PAGE_READY_TIMEOUT = 10000;

// The image wasn't seen to arrive after the avatar in testing, but a missing
// one is checked once more after this short pause, as the story scraper does.
const NO_IMAGE_RECHECK_DELAY = 300;

// Reads the name and image straight off the invite form. The avatar's
// background-image is the same URL the photo viewer opens (it matched in every
// model tested), so there's no popup to click and wait for. A model without an
// image renders the avatar with no background at all, so that's known at once
// instead of after a timeout.
async function readProfile(modelId) {
  const page = getPage();
  try {
    const profile = await page.waitForFunction(
      (sel) => {
        const avatar = document.querySelector(sel.avatarSelector);
        const name = document.querySelector(sel.modelNameSelector);
        if (!avatar?.getBoundingClientRect().width || !name) return null;

        const bg = avatar.querySelector(sel.avatarImageSelector)?.style
          .backgroundImage;
        return {
          name: name.textContent.trim() || null,
          image: bg?.match(/url\("?(.*?)"?\)/)?.[1] || null,
        };
      },
      { timeout: PAGE_READY_TIMEOUT },
      selectors,
    );
    return await profile.jsonValue();
  } catch {
    throw new Error(`❌ Model page did not load for model: ${modelId}`);
  }
}

async function findProfile(modelId) {
  const profile = await readProfile(modelId);
  if (profile.image) return profile;
  await wait(NO_IMAGE_RECHECK_DELAY);
  return readProfile(modelId);
}

// In-app navigation is the fast path; a full reload is the fallback whenever
// it doesn't work out, so a change on the site slows the run down rather than
// losing names and images.
async function getProfile(modelId) {
  const leftovers = `${selectors.avatarSelector}, ${selectors.modelNameSelector}`;
  if (await openDialogInApp(modelId, leftovers)) {
    try {
      return await findProfile(modelId);
    } catch {}
  }
  console.warn(`↻ In-app navigation failed — reloading for model: ${modelId}`);
  await surf(modelId);
  return findProfile(modelId);
}

export async function scrapeName(modelId, name, currentName) {
  try {
    if (!name) {
      throw new Error(`❌ Name not found for model: ${modelId}`);
    }

    // A deleted account has no real name to scrape, and writing the placeholder
    // would wipe the name the dashboard put there by hand.
    if (isDeletedAccount(name)) {
      console.log(`⚠️  Account deleted — keeping name for model: ${modelId}`);
      return { name: currentName, scraped: false };
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

export async function scrapeImage(modelId, imgSrc, currentImage) {
  try {
    if (!imgSrc) {
      throw new Error(`❌ Image does not exist for model: ${modelId}`);
    }

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
    let profile;
    try {
      profile = await getProfile(model.id);
    } catch (error) {
      console.warn(error.message);
      continue;
    }

    const { scraped: nameSaved } = await scrapeName(
      model.id,
      profile.name,
      model.name,
    );
    const imageSaved = await scrapeImage(model.id, profile.image, model.image);
    if (nameSaved) namesScraped++;
    if (imageSaved) imagesScraped++;
  }

  printLine();
  console.log(`🏷️  Names scraped:   ${namesScraped}`);
  console.log(`🖼️  Images scraped:  ${imagesScraped}`);
  console.log(`📡 Data consumed:   ${getDataUsageMB()} MB`);
  // Images are the run's content count (names ride along in the same visit).
  return imagesScraped;
}
