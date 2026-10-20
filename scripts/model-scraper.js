import { readFile } from "node:fs/promises";
import { getModels, updateModelImage, updateModelName } from "../api/model.js";
import { insertName } from "../api/name.js";
import { insertImage } from "../api/image.js";
import { getStories, insertStories } from "../api/story.js";
import { isDev, passIntro, printLine } from "../util/helpers.js";
import { getDataUsageMB, getPage } from "../util/context.js";

// One run for all three: every model's name, image and current story, read
// straight from coomeet's server (page/socket.js) instead of opening each
// model's dialog page — so no page renders to wait for, and several models
// are looked up at once.
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
// How long coomeet's connection gets to open and be authorized. Now and then
// it doesn't open at all (it has failed for the engine and cooscrap/archive
// in the same minute, so it's coomeet's side), so the page is reloaded and
// waited on again, READY_ATTEMPTS times in all, READY_RETRY_DELAY apart.
const READY_TIMEOUT = 20000;
const READY_ATTEMPTS = 3;
const READY_RETRY_DELAY = 10000;

// What the site shows instead of a name once a model's account is gone.
// Those models are renamed by hand in the dashboard, so it's never recorded.
const isDeletedName = (name) => name?.trim().toLowerCase() === "account deleted";

/* ===================== LOG ===================== */

// The run's own messages — start, end, problems with saving — stand apart
// from the model blocks, which are separated by printLine's thinner rule.
function printSection(...lines) {
  console.log("═".repeat(79));
  for (const line of lines) console.log(line);
}

// One model's block: what coomeet has for her now, and what became of it.
// Development only; otherwise the final report sums them up.
function printModel({ index, total, model, lookup, name, image, story }) {
  if (!isDev) return;
  printLine();
  console.log(`🦅 Model ${index} of ${total}`);
  console.log(`👤 Model id:  ${model.id}`);
  if (lookup.error) {
    console.log(`❌ Lookup failed — ${lookup.error}`);
    return;
  }
  // "value — what became of it", or just the outcome when there's no value.
  const line = (value, outcome) => (value ? `${value} — ${outcome}` : outcome);
  console.log(`🏷️  Name:      ${line(lookup.name, name)}`);
  console.log(`🖼️  Image:     ${line(lookup.image, image)}`);
  console.log(`🎞️  Story:     ${line(lookup.story?.src, story)}`);
}

/* ===================== PAGE ===================== */

// Loads page/socket.js into every page before coomeet's own code.
export async function injectSocket(page) {
  const source = await readFile(new URL("../page/socket.js", import.meta.url), "utf8");
  await page.evaluateOnNewDocument(source);
}

// Waits for coomeet's connection to open and be authorized, reloading the
// page while it doesn't (see READY_ATTEMPTS). Each attempt first gets past
// the intro screens, in case they're showing again. Each failure logs why.
async function waitForSocket(page) {
  for (let attempt = 1; ; attempt++) {
    await passIntro(page);
    try {
      await page.waitForFunction(() => window.__cooscrap.socketReady(), {
        timeout: READY_TIMEOUT,
      });
      return;
    } catch {
      const status = await page
        .evaluate(() => window.__cooscrap.socketStatus())
        .catch(() => "the page didn't answer");
      if (attempt >= READY_ATTEMPTS) {
        throw new Error(`❌ coomeet's connection didn't open — ${status}`);
      }
      console.warn(
        `⚠️ coomeet's connection didn't open (${status}) — reloading (${attempt}/${READY_ATTEMPTS - 1})`,
      );
      await new Promise((r) => setTimeout(r, READY_RETRY_DELAY));
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
}

/* ===================== SCRAPE ===================== */

// `only` (index.js --model=<id>[,<id>…]): just those, for testing a change.
// `dryRun`: look everything up and report what would change, writing
// nothing. `url`: a page of coomeet's app to work from, reloaded so its
// connection opens logged in.
export default async function scrapeModels({ only = null, dryRun = false, url }) {
  // Even for --model, her row comes from the database: the name and image
  // there are what a change is measured against.
  const all = await getModels();
  const wanted = only ? new Set(only.split(",").map((id) => id.trim())) : null;
  const models = wanted ? all.filter((m) => wanted.has(String(m.id))) : all;

  const page = getPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForSocket(page);
  // A dry run inserts nothing, so it compares against the stories already
  // saved to tell which would be new.
  const savedStories = dryRun ? new Set((await getStories()).map((s) => s.story)) : null;

  printSection(
    `🔄 Scraping ${models.length} models — names, images and stories`,
    ...(dryRun ? ["🧪 Dry run — nothing will be written"] : []),
    ...(wanted && models.length < wanted.size
      ? [`⚠️  Not in the models table, skipped: ${[...wanted].filter((id) => !models.some((m) => String(m.id) === id)).join(", ")}`]
      : []),
  );

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
  // run never waits on the database until the very end. A chunk's model
  // blocks are printed once it's saved, in order.
  let saving = Promise.resolve();

  for (let from = 0; from < models.length; from += CHUNK) {
    const chunk = models.slice(from, from + CHUNK);
    const lookups = await page.evaluate(
      (ids, options) => window.__cooscrap.lookupModels(ids, options),
      chunk.map((m) => String(m.id)),
      { concurrency: CONCURRENCY, ...REQUEST },
    );

    const entries = chunk.map((model, i) => ({
      index: from + i + 1,
      total: models.length,
      model,
      lookup: lookups[i],
    }));
    for (const { lookup } of entries) {
      if (lookup.error) counts.lookupFailed++;
      if (lookup.deleted) counts.deleted++;
      if (lookup.story) counts.withStory++;
    }

    if (dryRun) {
      for (const entry of entries) {
        preview(entry, savedStories, counts);
        printModel(entry);
      }
    } else {
      saving = saving.then(async () => {
        await saveChunk(entries, counts);
        entries.forEach(printModel);
      });
    }
  }
  await saving;

  printSection(
    `🦅 Models looked up:  ${models.length - counts.lookupFailed} of ${models.length}`,
    `🎞️  With a story now:  ${counts.withStory}`,
    `${dryRun ? "🧪 Would add" : "🆕 Added"}:          ${counts.stories} stories, ${counts.names} names, ${counts.images} images`,
    `🪦 Deleted accounts:  ${counts.deleted}`,
    `⚠️  Lookups failed:    ${counts.lookupFailed}`,
    ...(dryRun ? [] : [`⚠️  Stories unsaved:   ${counts.saveFailed}`]),
    `📡 Data consumed:     ${getDataUsageMB()} MB`,
  );
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

// Her name: a deleted account keeps the dashboard's name, an unchanged one
// is left alone, and a new one goes into the history (a duplicate isn't
// counted) and onto her row. Answers what happened, for her block.
async function saveName(model, lookup, counts) {
  if (lookup.deleted || isDeletedName(lookup.name)) {
    return `🪦 Account deleted — kept "${model.name ?? "—"}"`;
  }
  if (!lookup.name) return "❌ Not found";
  if (lookup.name === model.name) return "⚠️  Unchanged";
  try {
    const { inserted } = await insertName(model.id, lookup.name);
    await updateModelName(model.id, lookup.name);
    if (!inserted) return `⚠️  Already in her history — was "${model.name ?? "—"}"`;
    counts.names++;
    return `✅ New — was "${model.name ?? "—"}"`;
  } catch (error) {
    return error.message;
  }
}

// Her image, the same way (a deleted account's image is still kept).
async function saveImage(model, lookup, counts) {
  if (!lookup.image) return "⚠️  None";
  if (lookup.image === model.image) return "⚠️  Unchanged";
  try {
    const { inserted } = await insertImage(model.id, lookup.image);
    await updateModelImage(model.id, lookup.image);
    if (!inserted) return "⚠️  Already saved";
    counts.images++;
    return "✅ New";
  } catch (error) {
    return error.message;
  }
}

// Saves one chunk: names and images a few models at a time, then the
// chunk's stories in one request. Fills in each entry's name, image and
// story outcome for its block.
async function saveChunk(entries, counts) {
  const found = entries.filter((e) => !e.lookup.error);
  await eachLimit(found, WRITE_CONCURRENCY, async (entry) => {
    entry.name = await saveName(entry.model, entry.lookup, counts);
    entry.image = await saveImage(entry.model, entry.lookup, counts);
  });

  const withStory = found.filter((e) => e.lookup.story);
  for (const e of found) if (!e.lookup.story) e.story = "⚠️  None";
  if (!withStory.length) return;
  try {
    const inserted = await insertStories(
      withStory.map((e) => ({ model_id: e.model.id, story: e.lookup.story.src })),
    );
    const fresh = new Set(inserted.map((s) => s.story));
    counts.stories += fresh.size;
    for (const e of withStory) e.story = fresh.has(e.lookup.story.src) ? "✅ New" : "⚠️  Already saved";
  } catch (error) {
    counts.saveFailed += withStory.length;
    for (const e of withStory) e.story = "❌ Not saved";
    printSection(error.message);
  }
}

// A dry run's version of saveChunk: what each would become, written nowhere.
function preview(entry, savedStories, counts) {
  const { model, lookup } = entry;
  if (lookup.error) return;

  if (lookup.deleted || isDeletedName(lookup.name)) {
    entry.name = `🪦 Account deleted — would keep "${model.name ?? "—"}"`;
  } else if (!lookup.name) {
    entry.name = "❌ Not found";
  } else if (lookup.name === model.name) {
    entry.name = "⚠️  Unchanged";
  } else {
    counts.names++;
    entry.name = `🧪 Would change — was "${model.name ?? "—"}"`;
  }

  if (!lookup.image) entry.image = "⚠️  None";
  else if (lookup.image === model.image) entry.image = "⚠️  Unchanged";
  else {
    counts.images++;
    entry.image = "🧪 Would add";
  }

  if (!lookup.story) entry.story = "⚠️  None";
  else if (savedStories.has(lookup.story.src)) entry.story = "⚠️  Already saved";
  else {
    counts.stories++;
    entry.story = "🧪 Would add";
  }
}
