import {
  CATALOG_LOCALES,
} from "../src-tauri/companion_browser/supported_locales.js";
import {
  loadCompanionLocale,
} from "../src-tauri/companion_browser/companion_i18n.js";

// Production loads only the selected locale. The isolated Node test processes
// preload every published locale so existing synchronous renderer tests keep
// exercising their requested language without coupling each test to I/O.
await Promise.all(
  CATALOG_LOCALES.map(({ id }) => loadCompanionLocale(id)),
);
