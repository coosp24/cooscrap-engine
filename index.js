import puppeteer from "puppeteer-core";
import { click } from "./util/helpers.js";
import { setContext } from "./util/context.js";
import scrapeModels, { injectSocket } from "./scripts/model-scraper.js";
import { insertScrapeLog } from "./api/scrape-log.js";
import { getPrimaryAccount } from "./api/account.js";
import { login } from "./util/form-logger.js";

/* ===================== CONSTANTS ===================== */

const CONFIG = {
  executablePath:
    process.env.BROWSER_PATH ||
    "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  url: "https://p.coomeet.com/dialog",
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

// There's one op now. --op is still read so the workflow (and whatever
// dispatches it) names what it runs, and an old op name fails loudly.
const op = args.op || "scrape-models";

// --model=<id>[,<id>…] scrapes just those models instead of all — for trying
// a change against a single model without a full run. Such a test isn't a
// real run, so it isn't written to scrape_logs.
const onlyModel = typeof args.model === "string" ? args.model : null;

// --dry-run looks everything up and reports what would change, writing
// nothing. Not a real run either, so it isn't written to scrape_logs.
const dryRun = args["dry-run"] === true;

// --guest runs logged out, as in cooscrap/archive: no primary account needed
// (so no service role key either). It's still a real run, saved and logged
// like any other.
const guest = args.guest === true;

// What each op runs. scrape-models reads every model's story, name and image
// together, from coomeet's server.
const OPS = {
  "scrape-models": () => scrapeModels({ only: onlyModel, dryRun, url: CONFIG.url }),
};

// A run records two scrape_logs rows when it finishes — its stories and its
// images — since scrape_logs only knows those two types.
const SCRAPE_LOG_TYPES = { story: "stories", image: "images" };

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

  let browser;
  const startedAt = new Date();
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setContext(page, CONFIG);
    await injectSocket(page);
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await click(page, ".gender-item.male");
    await click(page, ".terms-actions button, .terms-actions div");

    // The same login as cooscrap/archive, which has never failed there: the
    // form is filled in here, then the scraper reloads the page and waits for
    // coomeet's connection to be authorized before asking it anything — so
    // nothing is read off a page that hasn't caught up with the login yet.
    if (guest) {
      console.log("👤 Running as a guest — not logged in");
    } else {
      const account = await getPrimaryAccount();
      console.log(`🔑 Logging in as ${account.email}`);
      await login(account.email, account.password);
    }
    const scraped = await run();

    if (!onlyModel && !dryRun) {
      const finishedAt = new Date();
      for (const [type, key] of Object.entries(SCRAPE_LOG_TYPES)) {
        await insertScrapeLog({
          type,
          startedAt,
          finishedAt,
          scraped: scraped?.[key] ?? 0,
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
