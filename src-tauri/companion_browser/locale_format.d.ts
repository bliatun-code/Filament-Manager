export function formatLocaleNumber(
  value: number,
  locale: unknown,
  options?: Intl.NumberFormatOptions,
): string;
export function formatLocaleDateTime(
  value: number | Date,
  locale: unknown,
  options?: Intl.DateTimeFormatOptions,
): string;
export function formatLocaleRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: unknown,
  options?: Intl.RelativeTimeFormatOptions,
): string;
export function createLocaleCollator(
  locale: unknown,
  options?: Intl.CollatorOptions,
): Intl.Collator;
export function localePluralCategory(
  value: number,
  locale: unknown,
  type?: Intl.PluralRuleType,
): Intl.LDMLPluralRule;
