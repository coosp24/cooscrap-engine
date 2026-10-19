import puppeteer from "puppeteer-core";
import { click } from "./util/helpers.js";
import { setContext } from "./util/context.js";
import scrapeImages from "./scripts/image-name-scraper.js";
import scrapeStories from "./scripts/story-scraper.js";
import sync, { injectSocket } from "./scripts/sync.js";
import {
  downloadMedia,
  downloadImages,
  downloadStories,
} from "./scripts/media-downloader.js";
import { insertScrapeLog } from "./api/scrape-log.js";
import { getPrimaryAccount } from "./api/account.js";
import { login } from "./util/form-logger.js";

/* ===================== CONSTANTS ===================== */

const CONFIG = {
  executablePath:
    process.env.BROWSER_PATH ||
    "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  url: "https://p.coomeet.com/dialog",
  timeout: 3000,
  headless: process.env.HEADLESS === "true",
};

/* ===================== CLI ARGS ===================== */

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [key, ...rest] = a.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : true];
    }),
);

const op = args.op || "scrape-stories";

// --model=<id>[,<id>…] scrapes just those models' stories instead of all — for
// trying a change against a single model without a full run. Such a test
// isn't a real run, so it isn't written to scrape_logs.
const onlyModel = typeof args.model === "string" ? args.model : null;

// --dry-run (sync only) looks everything up and reports what would change,
// writing nothing — for comparing sync with the old ops. Not a real run
// either, so it isn't written to scrape_logs.
const dryRun = args["dry-run"] === true;

// The download ops: --to=<folder> saves somewhere other than
// Desktop/cooscrap-media, and --limit=N fetches at most N new files of each
// kind, for trying it out.
const downloadOptions = {
  root: typeof args.to === "string" ? args.to : undefined,
  limit: Number(args.limit) || null,
};

// What each op runs. scrape-images also scrapes names (same popup visit);
// sync does stories, images and names together, from coomeet's server.
const OPS = {
  "scrape-stories": () => scrapeStories({ only: onlyModel }),
  "scrape-images": () => scrapeImages(),
  sync: () => sync({ only: onlyModel, dryRun, url: CONFIG.url }),
  download: () => downloadMedia(downloadOptions),
  "download-images": () => downloadImages(downloadOptions),
  "download-stories": () => downloadStories(downloadOptions),
};

// Ops that drive the site through the browser; the download ops only talk to
// the DB/CDN and skip the whole browser setup.
const BROWSER_OPS = new Set(["scrape-images", "scrape-stories", "sync"]);

// Ops that require being logged in. Image/name scraping reads the guest
// invite form, which only renders logged OUT — logging in swaps every model
// to the friend UI and the scrape fails, so it must never log in. sync reads
// names and images from the server, not the page, so logging in is fine.
const LOGIN_OPS = new Set(["scrape-stories", "sync"]);

// Scrape ops record a scrape_logs row when they finish (download ops don't).
// sync records two — its stories and its images — since scrape_logs only
// knows those two types.
const SCRAPE_LOG_TYPES = {
  "scrape-stories": "story",
  "scrape-images": "image",
  sync: { story: "stories", image: "images" },
};

/* ===================== MAIN ===================== */

async function launchBrowser(attempts = 2) {
  try {
    return await puppeteer.launch({
      headless: CONFIG.headless,
      executablePath: CONFIG.executablePath,
      // CI runners can be slow to bring Chrome up; the 30s default has
      // timed out on GitHub Actions.
      timeout: 120_000,
      // On CI, stream Chrome's own stdout/stderr into the job log so a
      // crashing launch says why instead of just timing out.
      dumpio: process.env.CI === "true",
      args: [
        "--start-maximized",
        "--blink-settings=imagesEnabled=false",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // /dev/shm can be too small on CI, crashing Chrome at startup.
        "--disable-dev-shm-usage",
      ],
      defaultViewport: null,
    });
  } catch (error) {
    if (attempts > 1) {
      console.warn(`⚠️ Browser launch failed (${error.message}) — retrying…`);
      return launchBrowser(attempts - 1);
    }
    throw error;
  }
}

async function main() {
  const run = OPS[op];
  if (!run) {
    console.error(
      `❌ Unknown op "${op}". Valid ops: ${Object.keys(OPS).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  if (!BROWSER_OPS.has(op)) {
    try {
      await run();
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    return;
  }

  let browser;
  const startedAt = new Date();
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setContext(page, CONFIG);
    if (op === "sync") await injectSocket(page);
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await click(page, ".gender-item.male");
    await click(page, ".terms-actions button, .terms-actions div");

    if (LOGIN_OPS.has(op)) {
      const account = await getPrimaryAccount();
      console.log(`🔑 Logging in as ${account.email}`);
      await login(account.email, account.password);
    }
    const scraped = await run();

    const type = SCRAPE_LOG_TYPES[op];
    if (type && !onlyModel && !dryRun) {
      const finishedAt = new Date();
      // An op logging several types answers its counts by name ({ stories,
      // images }); the others answer one number.
      const logs = typeof type === "string" ? { [type]: null } : type;
      for (const [logType, key] of Object.entries(logs)) {
        await insertScrapeLog({
          type: logType,
          startedAt,
          finishedAt,
          scraped: (key ? scraped?.[key] : scraped) ?? 0,
        });
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main();
