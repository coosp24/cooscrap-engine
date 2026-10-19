import { readFile } from "node:fs/promises";
import { getModels } from "../api/model.js";
import { getStories, insertStories } from "../api/story.js";
import { scrapeImage, scrapeName } from "./image-name-scraper.js";
import { printLine } from "../util/helpers.js";
import { getDataUsageMB, getPage } from "../util/context.js";

// One run for all three: every model's name, image and current story, read
// straight from coomeet's server (page/socket.js) instead of opening each
// model's dialog page — so no page renders to wait for, and several models
// are looked up at once. The old scrape-stories and scrape-images ops still
// work, and read the same things the slow way.
//
// No friend requests: coomeet hands over a stranger's story too; the request
// was only ever needed to make the story ring show on her page.

/* ===================== SETTINGS ===================== */

// Models looked up at a time. Each lookup is two requests sent together
// (~0.12s), so 10 at a time is 20 requests in flight — measured clean at
// that load (12ms a model, nothing failed). More would gain a few seconds
// and look less like someone using the site.
const CONCURRENCY = 10;
// Models whose name and image are saved at a time, behind the lookups.
const WRITE_CONCURRENCY = 5;
// Models handed to the page per round, so the log and the saving move along
// as the run goes.
const CHUNK = 50;
// A request coomeet doesn't answer in `timeout` is asked again, up to
// `attempts` times in all, `retryDelay` apart.
const REQUEST = { timeout: 5000, attempts: 4, retryDelay: 2000 };
// How long coomeet's connection gets to open and be authorized.
const READY_TIMEOUT = 20000;

// coomeet's placeholder name for a deleted account. scrapeName keeps the
// dashboard's name instead of recording it.
const DELETED_ACCOUNT_NAME = "Account deleted";

/* ===================== PAGE ===================== */

// Loads page/socket.js into every page before coomeet's own code.
export async function injectSocket(page) {
  const source = await readFile(new URL("../page/socket.js", import.meta.url), "utf8");
  await page.evaluateOnNewDocument(source);
}

/* ===================== SYNC ===================== */

// `only` (index.js --model=<id>[,<id>…]): just those, for testing a change.
// `dryRun`: look everything up and report what would change, writing
// nothing. `url`: a page of coomeet's app to work from, reloaded so its
// connection opens logged in.
export default async function sync({ only = null, dryRun = false, url }) {
  // Even for --model, her row comes from the database: the name and image
  // there are what a change is measured against.
  const all = await getModels();
  const wanted = only ? new Set(only.split(",").map((id) => id.trim())) : null;
  const models = wanted ? all.filter((m) => wanted.has(String(m.id))) : all;
  if (wanted && models.length < wanted.size) {
    console.warn(`⚠️ Not in the models table, skipped: ${[...wanted].filter((id) => !models.some((m) => String(m.id) === id)).join(", ")}`);
  }

  const page = getPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => window.__cooscrap.socketReady(), {
      timeout: READY_TIMEOUT,
    });
  } catch {
    throw new Error("❌ coomeet's connection didn't open");
  }
  // A dry run inserts nothing, so it compares against the stories already
  // saved to tell which would be new.
  const savedStories = dryRun ? new Set((await getStories()).map((s) => s.story)) : null;
  if (dryRun) console.log("🧪 Dry run — nothing will be written");

  const counts = {
    names: 0,
    images: 0,
    stories: 0,
    withStory: 0,
    deleted: 0,
    lookupFailed: 0,
    saveFailed: 0,
  };

  // Writes run behind the lookups: each chunk's saving is queued here, one
  // chunk after another, while the next chunk is being looked up — so the
  // run never waits on the database until the very end.
  let saving = Promise.resolve();

  for (let from = 0; from < models.length; from += CHUNK) {
    const chunk = models.slice(from, from + CHUNK);
    const results = await page.evaluate(
      (ids, options) => window.__cooscrap.lookupModels(ids, options),
      chunk.map((m) => String(m.id)),
      { concurrency: CONCURRENCY, ...REQUEST },
    );

    const label = `${from + 1}–${from + chunk.length} of ${models.length}`;
    printLine();
    console.log(`🦅 Looked up models ${label}`);
    const found = [];
    const stories = [];
    for (const [i, result] of results.entries()) {
      const model = chunk[i];
      if (result.error) {
        counts.lookupFailed++;
        console.warn(`❌ ${model.id}: ${result.error}`);
        continue;
      }
      if (result.deleted) counts.deleted++;
      if (result.story) {
        counts.withStory++;
        stories.push({ model_id: model.id, story: result.story.src });
      }

      // A deleted account is handed to scrapeName under coomeet's
      // placeholder, so it keeps the name the dashboard gave her.
      const name = result.deleted ? DELETED_ACCOUNT_NAME : result.name;
      if (dryRun) {
        if (!result.deleted && name && name !== model.name) {
          counts.names++;
          console.log(`🏷️  ${model.id}: name ${model.name ?? "—"} → ${name}`);
        }
        if (result.image && result.image !== model.image) {
          counts.images++;
          console.log(`🖼️  ${model.id}: new image ${result.image}`);
        }
      } else {
        found.push({ model, name, image: result.image });
      }
    }

    if (dryRun) {
      const fresh = stories.filter((s) => !savedStories.has(s.story));
      counts.stories += fresh.length;
      for (const s of fresh) console.log(`🎞️  ${s.model_id}: new story ${s.story}`);
      console.log(`🧪 ${fresh.length} new of ${stories.length} current stories`);
    } else {
      saving = saving.then(() => saveChunk(label, found, stories, counts));
    }
  }
  await saving;

  printLine();
  console.log(`🦅 Models looked up:  ${models.length - counts.lookupFailed} of ${models.length}`);
  console.log(`🎞️  With a story now:  ${counts.withStory}`);
  console.log(`${dryRun ? "🧪 Would add" : "🆕 Added"}:          ${counts.stories} stories, ${counts.names} names, ${counts.images} images`);
  console.log(`🪦 Deleted accounts:  ${counts.deleted}`);
  console.log(`⚠️  Lookups failed:    ${counts.lookupFailed}`);
  if (!dryRun) console.log(`⚠️  Stories unsaved:   ${counts.saveFailed}`);
  console.log(`📡 Data consumed:     ${getDataUsageMB()} MB`);
  return { stories: counts.stories, images: counts.images };
}

/* ===================== SAVING ===================== */

// Calls `fn` on every item, at most `limit` at a time.
async function eachLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Saves one chunk: each model's name and image through scrapeName and
// scrapeImage (which only touch the database when something changed), a
// few models at a time, then the chunk's stories in one request — only new
// ones are counted.
async function saveChunk(label, found, stories, counts) {
  await eachLimit(found, WRITE_CONCURRENCY, async ({ model, name, image }) => {
    if ((await scrapeName(model.id, name, model.name)).scraped) counts.names++;
    if (await scrapeImage(model.id, image, model.image)) counts.images++;
  });
  if (!stories.length) return;
  try {
    const inserted = await insertStories(stories);
    counts.stories += inserted.length;
    for (const s of inserted) console.log(`✅ Inserted story for model: ${s.model_id}\n${s.story}`);
    console.log(`💾 Models ${label}: ${inserted.length} new of ${stories.length} current stories`);
  } catch (error) {
    counts.saveFailed += stories.length;
    console.warn(error.message);
  }
}
