export type MessageParam = string | number | boolean | Date | null | undefined;
export type MessageParams = Readonly<Record<string, MessageParam>>;
export function formatMessage(
  template: string,
  params?: MessageParams,
  locale?: unknown,
): string;
