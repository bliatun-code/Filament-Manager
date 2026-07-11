import { intlLocaleFor } from "./supported_locales.js";

export function formatLocaleNumber(value, locale, options = {}) {
  return new Intl.NumberFormat(intlLocaleFor(locale), options).format(Number(value));
}

export function formatLocaleDateTime(value, locale, options = {}) {
  return new Intl.DateTimeFormat(intlLocaleFor(locale), options).format(value);
}

export function formatLocaleRelativeTime(value, unit, locale, options = {}) {
  return new Intl.RelativeTimeFormat(intlLocaleFor(locale), {
    numeric: "always",
    ...options,
  }).format(Number(value), unit);
}

export function createLocaleCollator(locale, options = {}) {
  return new Intl.Collator(intlLocaleFor(locale), options);
}

export function localePluralCategory(value, locale, type = "cardinal") {
  return new Intl.PluralRules(intlLocaleFor(locale), { type }).select(Number(value));
}
