import { formatLocaleNumber } from "../../../src-tauri/companion_browser/locale_format.js";

export type NumberDisplayLocale = string | null | undefined;

const DEFAULT_NUMBER_DISPLAY_LOCALE = "en";

function displayLocale(locale: NumberDisplayLocale): string {
  return locale?.trim() || DEFAULT_NUMBER_DISPLAY_LOCALE;
}

export function formatDisplayNumber(
  value: number,
  locale: NumberDisplayLocale = DEFAULT_NUMBER_DISPLAY_LOCALE,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatLocaleNumber(value, displayLocale(locale), options);
}

export function formatDisplayInteger(
  value: number,
  locale: NumberDisplayLocale = DEFAULT_NUMBER_DISPLAY_LOCALE,
): string {
  return formatDisplayNumber(value, locale, {
    maximumFractionDigits: 0,
  });
}

export function formatDisplayPercent(
  percent: number,
  locale: NumberDisplayLocale = DEFAULT_NUMBER_DISPLAY_LOCALE,
  maximumFractionDigits = 0,
): string {
  return formatDisplayNumber(percent / 100, locale, {
    maximumFractionDigits,
    style: "percent",
  });
}

export function formatDisplayGrams(
  grams: number,
  locale: NumberDisplayLocale = DEFAULT_NUMBER_DISPLAY_LOCALE,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatDisplayNumber(grams, locale, {
    maximumFractionDigits: 1,
    ...options,
    style: "unit",
    unit: "gram",
    unitDisplay: "short",
  });
}

export function formatDisplayKilograms(
  kilograms: number,
  locale: NumberDisplayLocale = DEFAULT_NUMBER_DISPLAY_LOCALE,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatDisplayNumber(kilograms, locale, {
    maximumFractionDigits: 2,
    ...options,
    style: "unit",
    unit: "kilogram",
    unitDisplay: "short",
  });
}

export function formatDisplayCelsius(
  celsius: number,
  locale: NumberDisplayLocale = DEFAULT_NUMBER_DISPLAY_LOCALE,
  maximumFractionDigits = 0,
): string {
  return formatDisplayNumber(celsius, locale, {
    maximumFractionDigits,
    style: "unit",
    unit: "celsius",
    unitDisplay: "short",
  });
}
