import puppeteer from "puppeteer-core";
import { click, type, wait } from "./util/helpers.js";
import scrapeImages from "./scripts/image-scraper.js";
import scrapeStories from "./scripts/story-scraper.js";

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

    const op = 1;

    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await click(page, ".gender-item.male");
    await click(page, ".terms-actions button, .terms-actions div");

    if (op == 1) {
      await click(
        page,
        "#application-wrapper > div.coomeet-chat > div.chat-header > div.signed-in-user > div > div.ui-user-avatar > div",
      );
      await click(
        page,
        "#application-wrapper > div.coomeet-chat > div.popup-overlay-wrapper > div.popup-overlay.visible > div > div.popup-overlay-content > div > div.ui-scroll-area > div > div.popup-component > div > div > div > form > div.form-content > div.form-content__footer > div > span",
      );

      await type(page, 'input[type="email"]', "dbpgzgqn@alilot.com");
      await click(
        page,
        "#application-wrapper > div.coomeet-chat > div.popup-overlay-wrapper > div.popup-overlay.visible > div > div.popup-overlay-content > div > div.ui-scroll-area > div > div.popup-component > div > div > div > form > div.form-content > div.form-content__footer > div > span",
      );

      await type(page, 'input[type="password"]', "demonio");

      await click(
        page,
        "#application-wrapper > div.coomeet-chat > div.popup-overlay-wrapper > div.popup-overlay.visible > div > div.popup-overlay-content > div > div.ui-scroll-area > div > div.popup-component > div > div > form > div.form-actions > button",
      );
      await wait(1000);
      await scrapeStories(page, CONFIG);
    } else {
      await scrapeImages(page, CONFIG);
    }
  } catch (error) {
    console.error("❌ Scrape Failed:", error.message);
  } finally {
    // await browser?.close();
  }
}

main();
