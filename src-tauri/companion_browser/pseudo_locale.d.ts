import type { MessageParams } from "./message_format.js";

export function pseudoLocalizeLiteral(value: string): string;
export function pseudoLocalizeMessage(
  template: string,
  params?: MessageParams,
  locale?: unknown,
): string;
export function pseudoLocalizeRtlMessage(
  template: string,
  params?: MessageParams,
  locale?: unknown,
): string;
export function pseudoLocalizeCjkLiteral(value: string): string;
export function pseudoLocalizeCjkMessage(
  template: string,
  params?: MessageParams,
  locale?: unknown,
): string;
export function pseudoLocalizeMessageForLocale(
  template: string,
  params?: MessageParams,
  locale?: unknown,
): string;
