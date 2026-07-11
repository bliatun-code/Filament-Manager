export type TextDirection = "ltr" | "rtl";

export type SupportedLocaleDefinition = Readonly<{
  id: string;
  aliases: readonly string[];
  htmlLang: string;
  direction: TextDirection;
  intlLocale: string;
  nativeLabel: string;
  selectable: boolean;
  catalogKind: "source" | "draft" | "generated";
  generatedFrom: string | null;
  fallbackLocale: string | null;
  pseudoMode: "accented" | "rtl" | "cjk" | null;
  guidePath: string;
  selectionMessageKey: string;
  companionSelectionMessageKey: string;
  selectionMessageFallback: string;
}>;

export const DEFAULT_LOCALE: string;
export const SUPPORTED_LOCALES: readonly SupportedLocaleDefinition[];
export const SELECTABLE_LOCALES: readonly SupportedLocaleDefinition[];
export const SOURCE_LOCALES: readonly SupportedLocaleDefinition[];
export const CATALOG_LOCALES: readonly SupportedLocaleDefinition[];
export const SUPPORTED_LOCALE_IDS: readonly string[];
export function localeDefinition(value: unknown): SupportedLocaleDefinition | null;
export function normalizeSupportedLocale(
  value: unknown,
  fallback?: string | null,
): string | null;
export function sourceLocaleFor(value: unknown): string;
export function fallbackLocaleFor(value: unknown): string | null;
export function normalizeSelectableLocale(
  value: unknown,
  fallback?: string | null,
): string | null;
export function isPseudoLocale(value: unknown): boolean;
export function pseudoModeFor(value: unknown): "accented" | "rtl" | "cjk" | null;
export function intlLocaleFor(value: unknown): string;
export function guidePathForLocale(value: unknown): string;
export function applyLocaleToDocument(value: unknown, documentRef: Document): boolean;
