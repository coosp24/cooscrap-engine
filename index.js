import puppeteer from "puppeteer-core";
import { click } from "./util/helpers.js";
import scrapeImages from "./scripts/image-scraper.js";

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

    await scrapeImages(page, CONFIG);
  } catch (error) {
    console.error("❌ Scrape Failed:", error.message);
  } finally {
    // await browser?.close();
  }
}

main();
