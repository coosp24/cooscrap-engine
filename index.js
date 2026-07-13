import puppeteer from "puppeteer-core";
import { click } from "./util/helpers.js";
import { setContext } from "./util/context.js";
import scrapeImages from "./scripts/image-name-scraper.js";
import scrapeStories from "./scripts/story-scraper.js";
import { downloadImages, downloadStories } from "./scripts/media-downloader.js";
import addModels from "./scripts/friend-requester.js";
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

const op = args.op;

const BROWSER_OPS = new Set([
  "scrape-images",
  "scrape-stories",
  "scrape-all",
  "friend-request",
]);

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
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await setContext(page, CONFIG);
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await click(page, ".gender-item.male");
    await click(page, ".terms-actions button, .terms-actions div");

    await login();
    await scrapeStories();
    // await scrapeImages();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main();
