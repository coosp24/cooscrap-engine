import fs from "fs";
import os from "os";
import path from "path";

import { getImages } from "../api/image.js";
import { getStories } from "../api/story.js";
import supabase from "../util/supabase.js";
import { printLine } from "../util/helpers.js";

/**
 * Downloads every story and image in the database to one folder:
 *
 *   <root>/Images/<model id>/<hash>.<ext>
 *   <root>/Stories/<model id>/<hash>.webm
 *
 * <root> is Desktop/cooscrap-media unless --to=<folder> says otherwise. The
 * file name is the hash from the media's address — the same name coomeet's
 * CDN gives it.
 *
 * Only new media is fetched. <root>/.downloaded.json records every address
 * already handled — kept with the files, so moving the whole folder keeps
 * it working — and each run fetches only the addresses not in it. Every row is
 * listed each time (a few small requests even at 10k), so nothing saved with
 * an older date can slip through.
 *
 * A file is written as .part and renamed once complete, so a run stopped
 * halfway leaves no half-file counted as done, and the next run picks up where
 * it left off. A link that's gone for good (404/410 — coomeet deletes old
 * stories) is recorded as such and not retried; any other failure is retried
 * next run.
 */

const CONCURRENCY = 6;
// The record is saved this often while a run goes, as well as at the end.
const SAVE_EVERY = 25;

const KINDS = {
  images: { folder: "Images", column: "image", list: getImages },
  stories: { folder: "Stories", column: "story", list: getStories },
};

// The Desktop, where Windows keeps it: the usual place, or OneDrive's.
function desktop() {
  const home = os.homedir();
  const candidates = [path.join(home, "Desktop"), path.join(home, "OneDrive", "Desktop")];
  return candidates.find((dir) => fs.existsSync(dir)) ?? home;
}

export const defaultRoot = () => path.join(desktop(), "cooscrap-media");

/* ===================== THE RECORD ===================== */

const recordPath = (root) => path.join(root, ".downloaded.json");

// Address → "ok" (on disk) or "gone" (the link is dead for good).
function readRecord(root) {
  try {
    return JSON.parse(fs.readFileSync(recordPath(root), "utf8"));
  } catch {
    return {};
  }
}

function writeRecord(root, record) {
  const file = recordPath(root);
  fs.writeFileSync(`${file}.part`, JSON.stringify(record));
  fs.renameSync(`${file}.part`, file);
}

/* ===================== ADDRESSES ===================== */

// Our own uploads live in private Supabase Storage buckets, and their saved
// address stops working; a fresh signed link is asked for instead. coomeet's
// CDN links are fetched as they are.
const STORAGE = /\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/([^?]+)/;

async function fetchableUrl(url) {
  const match = STORAGE.exec(url);
  if (!match) return url;
  const [, bucket, objectPath] = match;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(decodeURIComponent(objectPath), 3600);
  if (error) throw new Error(`couldn't sign ${bucket}/${objectPath}: ${error.message}`);
  return data.signedUrl;
}

// coomeet image links carry no extension, so it comes from what the server
// says the file is.
const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "video/webm": ".webm",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

// The hash: the last part of the address, without query or extension.
function hashOf(url) {
  const name = path.basename(new URL(url).pathname);
  const ext = path.extname(name);
  return { hash: ext ? name.slice(0, -ext.length) : name, ext };
}

/* ===================== DOWNLOADING ===================== */

class Gone extends Error {}

async function downloadOne(row, kind, root) {
  const url = row[kind.column];
  const { hash, ext: urlExt } = hashOf(url);
  const response = await fetch(await fetchableUrl(url));
  if (response.status === 404 || response.status === 410) throw new Gone(`gone (${response.status})`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = urlExt || EXTENSIONS[type] || "";
  const dir = path.join(root, kind.folder, String(row.model_id));
  const dest = path.join(dir, `${hash}${ext}`);
  fs.mkdirSync(dir, { recursive: true });

  const part = `${dest}.part`;
  fs.writeFileSync(part, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(part, dest);
  return dest;
}

// Runs `work` over `items`, `limit` at a time.
async function pool(items, limit, work) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  });
  await Promise.all(runners);
}

async function downloadKind(name, root, record, limit) {
  const kind = KINDS[name];
  const rows = (await kind.list()).filter((row) => typeof row[kind.column] === "string");
  const allFresh = rows.filter((row) => !record[row[kind.column]]);
  // --limit=N: only the first N new ones, for trying it out.
  const fresh = limit ? allFresh.slice(0, limit) : allFresh;
  console.log(
    `🗂️  ${kind.folder}: ${rows.length} in the database, ${allFresh.length} new` +
      (fresh.length < allFresh.length ? ` — fetching ${fresh.length} (--limit)` : ""),
  );

  const tally = { downloaded: 0, gone: 0, failed: 0 };
  let sinceSave = 0;

  await pool(fresh, CONCURRENCY, async (row) => {
    const url = row[kind.column];
    try {
      await downloadOne(row, kind, root);
      record[url] = "ok";
      tally.downloaded++;
    } catch (error) {
      if (error instanceof Gone) {
        record[url] = "gone";
        tally.gone++;
      } else {
        tally.failed++;
      }
      console.warn(`⚠️ ${kind.folder} ${row.model_id}: ${hashOf(url).hash} — ${error.message}`);
    }
    if (++sinceSave >= SAVE_EVERY) {
      sinceSave = 0;
      writeRecord(root, record);
    }
  });

  writeRecord(root, record);
  console.log(
    `✅ ${kind.folder}: ${tally.downloaded} downloaded, ${tally.gone} no longer online, ${tally.failed} to retry next run`,
  );
  return tally;
}

/**
 * Downloads the new media of the given kinds ("images", "stories") into
 * `root` — at most `limit` new files of each kind, when given.
 */
export async function downloadMedia({
  kinds = ["images", "stories"],
  root = defaultRoot(),
  limit = null,
} = {}) {
  printLine();
  console.log(`📁 Saving to ${root}`);
  fs.mkdirSync(root, { recursive: true });
  const record = readRecord(root);

  // Stopped by hand: keep what's been recorded so far.
  const onStop = () => {
    writeRecord(root, record);
    process.exit(130);
  };
  process.once("SIGINT", onStop);

  try {
    for (const kind of kinds) {
      printLine();
      await downloadKind(kind, root, record, limit);
    }
  } finally {
    process.off("SIGINT", onStop);
  }
  printLine();
}

export const downloadImages = (options) => downloadMedia({ ...options, kinds: ["images"] });
export const downloadStories = (options) => downloadMedia({ ...options, kinds: ["stories"] });
