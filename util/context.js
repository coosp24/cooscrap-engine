const BLOCKED_TYPES = new Set(["image", "media", "font"]);

let _page = null;
let _config = null;
let _dataBytes = 0;

export async function setContext(page, config) {
  _page = page;
  _config = config;

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

export async function surf(modelId) {
  await _page.goto(`${_config.url}/${modelId}`, {
    waitUntil: "domcontentloaded",
  });
}
