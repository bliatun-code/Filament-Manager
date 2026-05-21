export function firstDefinedTimestamp(
  ...values: Array<string | null | undefined>
): string | null {
  return values.find((value): value is string => !!value) ?? null;
}
