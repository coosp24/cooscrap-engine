import puppeteer from "puppeteer-core";
import { click } from "./util/helpers.js";
import scrapeImages from "./scripts/image-scraper.js";
import scrapeStories from "./scripts/story-scraper.js";
import downloadImages from "./scripts/image-downloader.js";
import downloadStories from "./scripts/story-downloader.js";
import { login } from "./scripts/form-logger.js";
import addModels from "./scripts/friend-requester.js";
import bulkScrape from "./scripts/bulk-script.js";

/* ===================== CONSTANTS ===================== */

const CONFIG = {
  executablePath:
    "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  url: "https://p.coomeet.com/dialog",
  timeout: 3000,
  headless: false,
};

/* ===================== GLOBAL STATE ===================== */

let browser;
let page;

/* ===================== MAIN ===================== */

async function launchBrowser() {
  return puppeteer.launch({
    headless: CONFIG.headless,
    executablePath: CONFIG.executablePath,
    args: ["--start-maximized"],
    defaultViewport: null,
  });
}

async function main() {
  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await click(page, ".gender-item.male");
    await click(page, ".terms-actions button, .terms-actions div");

    const op = 1;

    if (op == 1) {
      // await login(page);
      await scrapeImages(page, CONFIG);
    } else if (op == 2) {
      await login(page);
      await scrapeStories(page, CONFIG);
    } else if (op == 3) {
      await downloadImages();
    } else if (op == 4) {
      await downloadStories();
    } else if (op == 5) {
      await bulkScrape(page, CONFIG);
    }
  } catch (error) {
    console.error(error.message);
  } finally {
    // await browser?.close();
  }
}

main();
