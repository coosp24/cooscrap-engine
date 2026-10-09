const BLOCKED_TYPES = new Set(["image", "media", "font"]);

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
export async function navigateInApp(path) {
  await _page.evaluate((path) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  }, path);
}

export async function surf(modelId) {
  await _page.goto(`${_config.url}/${modelId}`, {
    waitUntil: "domcontentloaded",
  });
}
