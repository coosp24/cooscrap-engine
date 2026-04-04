import puppeteer from "puppeteer-core";
import { click } from "./util/helpers.js";
import { setContext } from "./util/context.js";
import scrapeImages from "./scripts/image-scraper.js";
import scrapeStories from "./scripts/story-scraper.js";
import { downloadImages, downloadStories } from "./scripts/media-downloader.js";
import { login } from "./util/form-logger.js";

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
    setContext(page, CONFIG);
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await click(page, ".gender-item.male");
    await click(page, ".terms-actions button, .terms-actions div");

    const op = 1;

    if (op == 1) {
      // await login();
      await scrapeImages();
    } else if (op == 2) {
      await login();
      await scrapeStories();
    } else if (op == 3) {
      await downloadImages();
    } else if (op == 4) {
      await downloadStories();
    }
  } catch (error) {
    console.error(error.message);
  } finally {
    // await browser?.close();
  }
}

main();
