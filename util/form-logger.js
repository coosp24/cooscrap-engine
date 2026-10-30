import { click, type, wait } from "./helpers.js";
import { getPage } from "./context.js";

// Credentials come from the primary account in the dashboard (see
// api/account.js) — never from the environment.
export const login = async (email, password) => {
  const page = getPage();
  await click(
    page,
    "#screen-slot > div > div.gender-select__options > button.gender-option.gender-option--male > span.gender-option__icon > span.gender-option__ring",
  );
  await click(
    page,
    "#application-wrapper > div.coomeet-chat > div.popup-overlay-wrapper > div.popup-overlay.visible > div > div.popup-overlay-content > div > div.ui-scroll-area > div > div.popup-component > div > div > div > form > div.form-content > div.form-content__footer > div > span",
  );

  await type(page, 'input[type="email"]', email);

  await type(page, 'input[type="password"]', password);

  await click(
    page,
    "#application-wrapper > div.coomeet-chat > div.popup-overlay-wrapper > div.popup-overlay.visible > div > div.popup-overlay-content > div > div.ui-scroll-area > div > div.popup-component > div > div > form > div.form-actions > button",
  );
  await wait(1000);
};
