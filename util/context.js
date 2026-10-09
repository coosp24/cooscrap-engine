const BLOCKED_TYPES = new Set(["image", "media", "font"]);

// How long the previous model gets to leave the screen before in-app
// navigation is given up on in favour of a reload.
const CLEAR_TIMEOUT = 3000;

let _page = null;
let _config = null;
let _dataBytes = 0;

export async function setContext(page, config) {
  _page = page;
  _config = config;

  // In headless Chrome the site sees a different browser than when you watch
  // it run, which is why the story UI never renders and every model reports
  // "story not found". Make headless look like the headed run:
  if (config.headless) {
    // 1. Drop the tell-tale "HeadlessChrome" token from the User-Agent.
    const ua = await _page.browser().userAgent();
    await _page.setUserAgent(ua.replace("Headless", ""));

    // 2. --start-maximized is a no-op in headless, so give it a real desktop
    //    viewport; otherwise the responsive layout hides the story elements.
    await _page.setViewport({ width: 1920, height: 1080 });

    // 3. Hide the automation flag anti-bot code checks.
    await _page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
  }

  await _page.setRequestInterception(true);
  _page.on("request", (req) => {
    if (BLOCKED_TYPES.has(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  _page.on("response", (response) => {
    const contentLength = response.headers()["content-length"];
    if (contentLength) {
      _dataBytes += parseInt(contentLength, 10);
    }
  });
}

export function getDataUsageMB() {
  return (_dataBytes / (1024 * 1024)).toFixed(2);
}

export function getPage() {
  return _page;
}

// Moves the already-loaded app to another of its pages through its own router,
// the way clicking a dialog in the sidebar does — no reload, so it takes
// ~150ms instead of the ~1.2s a full `surf` spends restarting the app.
async function navigateInApp(path) {
  await _page.evaluate((path) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  }, path);
}

// Opens a model's dialog in-app: first back to the empty /dialog screen
// (Escape closes any viewer the last model left open), and only once nothing
// matching `leftoverSelector` is on screen any more, on to the model — so
// nothing read afterwards can be a leftover from the model before. Returns
// false if the screen didn't clear in time, so the caller can `surf` instead.
export async function openDialogInApp(modelId, leftoverSelector) {
  await _page.keyboard.press("Escape");
  await navigateInApp("/dialog");
  try {
    await _page.waitForFunction(
      (sel) =>
        ![...document.querySelectorAll(sel)].some(
          (el) => el.getBoundingClientRect().width > 0,
        ),
      { timeout: CLEAR_TIMEOUT },
      leftoverSelector,
    );
  } catch {
    return false;
  }
  await navigateInApp(`/dialog/${modelId}`);
  return true;
}

export async function surf(modelId) {
  await _page.goto(`${_config.url}/${modelId}`, {
    waitUntil: "domcontentloaded",
  });
}
