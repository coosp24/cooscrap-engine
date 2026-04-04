let _page = null;
let _config = null;

export function setContext(page, config) {
  _page = page;
  _config = config;
}

export function getPage() {
  return _page;
}

export async function surf(modelId) {
  await _page.goto(`${_config.url}/${modelId}`, {
    waitUntil: "domcontentloaded",
  });
}
