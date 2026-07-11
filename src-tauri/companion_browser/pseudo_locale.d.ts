import type { MessageParams } from "./message_format.js";

export function pseudoLocalizeLiteral(value: string): string;
export function pseudoLocalizeMessage(template: string, params?: MessageParams): string;
