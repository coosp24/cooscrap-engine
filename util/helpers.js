/* ===================== LOGGING ===================== */

// ENV=development logs every model's block as the run goes; otherwise (as on
// CI) a run logs only its start, its problems and the final report.
export const isDev = process.env.ENV === "development";

/* ===================== BROWSER HELPERS ===================== */

export async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function click(page, selector, timeout = 3000) {
  try {
    await page.waitForSelector(selector, { timeout });
    await page.click(selector);
  } catch {
    // console.warn(`⚠️ Failed to click: ${selector}`);
  }
}

// coomeet's first screens: pick a gender, then accept the terms. Until
// they're done the app never opens its connection, which fails the run as
// "the app never opened its socket". On a slow machine (as on CI) they can
// take a while to show, so each gets up to `timeout` — waiting on whichever
// comes first, a screen to click or the app opening its socket, so a page
// that's past them already (a reload once the choice is saved) isn't held up.
// The new app (from Nov 2026) first, then the old one's, in case either is
// served.
export const GENDER = "button.gender-option--male, .gender-item.male";
export const TERMS = "button.terms-of-service__button, .terms-actions button, .terms-actions div";

export async function passIntro(page, timeout = 20000) {
  await page
    .waitForFunction(
      (gender, terms) =>
        document.querySelector(gender) ||
        document.querySelector(terms) ||
        window.__cooscrap?.socketOpened?.(),
      { timeout },
      GENDER,
      TERMS,
    )
    .catch(() => {});
  if (await clickIfThere(page, GENDER)) {
    // The terms follow the gender choice.
    await page.waitForSelector(TERMS, { timeout }).catch(() => {});
  }
  await clickIfThere(page, TERMS);
}

// Clicks `selector` if it's on the page, answering whether it did. A screen
// can go away between being found and being clicked (the app closing it
// itself), which isn't a failure: there's just nothing left to click.
export async function clickIfThere(page, selector) {
  const element = await page.$(selector);
  if (!element) return false;
  return element.click().then(
    () => true,
    () => false,
  );
}

export async function type(page, selector, text) {
  try {
    await page.waitForSelector(selector);
    await page.focus(selector);
    await page.type(selector, text);
  } catch (e) {
    // console.warn(`⚠️ Failed to type in: ${selector}`);
  }
}

export function printLine() {
  console.log(
    "-------------------------------------------------------------------------------",
  );
}
