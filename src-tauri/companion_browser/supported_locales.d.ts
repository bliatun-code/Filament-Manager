export type TextDirection = "ltr" | "rtl";

export type SupportedLocaleDefinition = Readonly<{
  id: string;
  aliases: readonly string[];
  htmlLang: string;
  direction: TextDirection;
  intlLocale: string;
  nativeLabel: string;
  guidePath: string;
  selectionMessageKey: string;
  companionSelectionMessageKey: string;
  selectionMessageFallback: string;
}>;

export const DEFAULT_LOCALE: string;
export const SUPPORTED_LOCALES: readonly SupportedLocaleDefinition[];
export const SUPPORTED_LOCALE_IDS: readonly string[];
export function localeDefinition(value: unknown): SupportedLocaleDefinition | null;
export function normalizeSupportedLocale(
  value: unknown,
  fallback?: string | null,
): string | null;
export function intlLocaleFor(value: unknown): string;
export function guidePathForLocale(value: unknown): string;
export function applyLocaleToDocument(value: unknown, documentRef: Document): boolean;
