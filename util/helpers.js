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

export function printLine() {
  console.log(
    "____________________________________________________________________________________",
  );
}
