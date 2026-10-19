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
