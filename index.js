import puppeteer from "puppeteer-core";
import { click } from "./util/helpers.js";
import { setContext } from "./util/context.js";
import scrapeImages from "./scripts/image-name-scraper.js";
import scrapeStories from "./scripts/story-scraper.js";
import { downloadImages, downloadStories } from "./scripts/media-downloader.js";
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

// What each op runs. scrape-images also scrapes names (same popup visit).
const OPS = {
  "scrape-stories": () => scrapeStories(),
  "scrape-images": () => scrapeImages(),
  "download-images": () => downloadImages(),
  "download-stories": () => downloadStories(),
};

// Ops that drive the site through the browser; the download ops only talk to
// the DB/CDN and skip the whole browser setup.
const BROWSER_OPS = new Set(["scrape-images", "scrape-stories"]);

// Ops that require being logged in. Image/name scraping reads the guest
// invite form, which only renders logged OUT — logging in swaps every model
// to the friend UI and the scrape fails, so it must never log in.
const LOGIN_OPS = new Set(["scrape-stories"]);

/* ===================== MAIN ===================== */

async function launchBrowser() {
  return puppeteer.launch({
    headless: CONFIG.headless,
    executablePath: CONFIG.executablePath,
    args: [
      "--start-maximized",
      "--blink-settings=imagesEnabled=false",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
    defaultViewport: null,
  });
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
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setContext(page, CONFIG);
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await click(page, ".gender-item.male");
    await click(page, ".terms-actions button, .terms-actions div");

    if (LOGIN_OPS.has(op)) await login();
    await run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main();
