export const DEFAULT_SWATCH_COLOR = "#CBD5E1";

export function normalizeHexColor(
  raw?: string | null,
  options: { uppercase?: boolean } = {},
): string | null {
  const value = (raw ?? "").trim();
  if (!value) {
    return null;
  }
  let normalized: string | null = null;
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    normalized = value;
  } else if (/^[0-9a-fA-F]{3}$/.test(value) || /^[0-9a-fA-F]{6}$/.test(value)) {
    normalized = `#${value}`;
  }
  if (!normalized) {
    return null;
  }
  return options.uppercase ? normalized.toUpperCase() : normalized;
}

export function isValidHexColor(raw?: string | null): boolean {
  return normalizeHexColor(raw) != null;
}

export function toSwatchColor(raw?: string | null): string {
  return normalizeHexColor(raw) ?? DEFAULT_SWATCH_COLOR;
}

export function hexToRgb(raw?: string | null): [number, number, number] | null {
  const normalized = toSwatchColor(raw).replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;
  if (expanded.length !== 6) {
    return null;
  }
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return null;
  }
  return [red, green, blue];
}
