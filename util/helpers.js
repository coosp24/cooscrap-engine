/* ===================== BROWSER HELPERS ===================== */

export async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function click(page, selector, timeout = 3000) {
  try {
    await page.waitForSelector(selector, { timeout });
    await page.click(selector);
  } catch {
    // intentionally silent
  }
}

export async function type(page, selector, text, timeout = 3000) {
  try {
    await page.waitForSelector(selector, { timeout });
    await page.focus(selector);
    await page.type(selector, text, { delay: 50 });
  } catch (e) {
    console.warn(`⚠️ Failed to type in: ${selector}`);
  }
}

export function printLine() {
  console.log(
    "____________________________________________________________________________________",
  );
}
