export const DEFAULT_SWATCH_COLOR = "#CBD5E1";
const COMPOSITE_SWATCH_PATTERN = /^(multi|gradient)\((.*)\)$/i;

export type SwatchKind = "solid" | "multi" | "gradient";

export type SwatchSpec = {
  kind: SwatchKind;
  colors: string[];
};

export type BambuStudioSwatchInput = {
  filamentColour?: unknown;
  filamentColourType?: unknown;
  filamentMultiColour?: unknown;
};

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

function normalizeSwatchColorList(
  raw: string,
  options: { uppercase?: boolean } = {},
): string[] | null {
  const parts = raw
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const colors = parts.map((part) => normalizeHexColor(part, options));
  if (colors.some((color) => color == null)) {
    return null;
  }
  return colors as string[];
}

export function normalizeSwatchValue(
  raw?: string | null,
  options: { uppercase?: boolean } = {},
): string | null {
  const normalizedHex = normalizeHexColor(raw, options);
  if (normalizedHex) {
    return normalizedHex;
  }

  const value = (raw ?? "").trim();
  if (!value) {
    return null;
  }

  const compositeMatch = value.match(COMPOSITE_SWATCH_PATTERN);
  if (compositeMatch) {
    const kind = compositeMatch[1].toLowerCase() as Exclude<SwatchKind, "solid">;
    const colors = normalizeSwatchColorList(compositeMatch[2], options);
    return colors ? `${kind}(${colors.join(",")})` : null;
  }

  const colors = normalizeSwatchColorList(value, options);
  return colors ? `gradient(${colors.join(",")})` : null;
}

export function isValidSwatchColor(raw?: string | null): boolean {
  return normalizeSwatchValue(raw) != null;
}

function normalizeBambuStudioHexColor(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) {
    return null;
  }
  const withoutHash = value.startsWith("#") ? value.slice(1) : value;
  const alphaTrimmed = /^[0-9a-fA-F]{8}$/.test(withoutHash)
    ? withoutHash.slice(0, 6)
    : withoutHash;
  return normalizeHexColor(alphaTrimmed, { uppercase: true });
}

function normalizeBambuStudioColorList(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw.flatMap((value) => String(value ?? "").split(/[;,]/))
    : String(raw ?? "").split(/[;,]/);
  return values
    .map((value) => normalizeBambuStudioHexColor(value))
    .filter((value): value is string => value != null);
}

function normalizeBambuStudioColourType(raw: unknown): "gradient" | "multi" | "single" {
  const value = String(raw ?? "").trim();
  if (value === "0") {
    return "gradient";
  }
  if (value === "1") {
    return "multi";
  }
  return "single";
}

export function normalizeBambuStudioSwatchValue({
  filamentColour,
  filamentColourType,
  filamentMultiColour,
}: BambuStudioSwatchInput): string | null {
  const primary = normalizeBambuStudioHexColor(filamentColour);
  const compositeColors = normalizeBambuStudioColorList(filamentMultiColour);
  const colors =
    compositeColors.length > 1 ? compositeColors : primary ? [primary] : compositeColors;
  const colourType = normalizeBambuStudioColourType(filamentColourType);
  if (colourType === "gradient" && colors.length > 1) {
    return `gradient(${colors.join(",")})`;
  }
  if (colourType === "multi" && colors.length > 1) {
    return `multi(${colors.join(",")})`;
  }
  return primary ?? colors[0] ?? null;
}

export function parseSwatchSpec(raw?: string | null): SwatchSpec {
  const normalized = normalizeSwatchValue(raw, { uppercase: true });
  if (!normalized) {
    return { kind: "solid", colors: [DEFAULT_SWATCH_COLOR] };
  }
  const compositeMatch = normalized.match(COMPOSITE_SWATCH_PATTERN);
  if (compositeMatch) {
    return {
      kind: compositeMatch[1].toLowerCase() as Exclude<SwatchKind, "solid">,
      colors: compositeMatch[2].split(","),
    };
  }
  return { kind: "solid", colors: [normalized] };
}

export function primarySwatchColor(raw?: string | null): string {
  return parseSwatchSpec(raw).colors[0] ?? DEFAULT_SWATCH_COLOR;
}

export function swatchCssBackground(raw?: string | null, angle = 145): string {
  const spec = parseSwatchSpec(raw);
  if (spec.kind === "solid" || spec.colors.length === 1) {
    return spec.colors[0] ?? DEFAULT_SWATCH_COLOR;
  }

  if (spec.kind === "gradient") {
    const maxIndex = spec.colors.length - 1;
    const stops = spec.colors.map((color, index) => {
      const position = maxIndex === 0 ? 0 : Math.round((index / maxIndex) * 100);
      return `${color} ${position}%`;
    });
    return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
  }

  const segmentSize = 100 / spec.colors.length;
  const stops = spec.colors.flatMap((color, index) => {
    const start = Math.round(segmentSize * index * 100) / 100;
    const end = Math.round(segmentSize * (index + 1) * 100) / 100;
    return [`${color} ${start}%`, `${color} ${end}%`];
  });
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}

export function toSwatchColor(raw?: string | null): string {
  return primarySwatchColor(raw);
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

export function swatchRgba(raw: string | null | undefined, alpha: number): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return `rgba(203, 213, 225, ${alpha})`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function swatchTextColor(raw: string | null | undefined): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return "#FFFFFF";
  }
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return brightness >= 170 ? "#0F172A" : "#FFFFFF";
}

export function blendSwatchColor(
  raw: string | null | undefined,
  target: [number, number, number],
  amount: number,
): string {
  const rgb = hexToRgb(raw) ?? [51, 65, 85];
  const mixed = rgb.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * amount),
  ) as [number, number, number];
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

export type ColorSuggestionSource = {
  vendor: string;
  material: string;
  filament_name: string;
  color_name: string;
};

function hslToHex(h: number, s: number, l: number): string {
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh >= 0 && hh < 1) {
    r = c;
    g = x;
  } else if (hh < 2) {
    r = x;
    g = c;
  } else if (hh < 3) {
    g = c;
    b = x;
  } else if (hh < 4) {
    g = x;
    b = c;
  } else if (hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = lightness - c / 2;
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function suggestHexFromColor(master: ColorSuggestionSource): string {
  const source = `${master.color_name} ${master.filament_name}`.toLowerCase();
  const named: Array<[RegExp, string]> = [
    [/(^|\s)black(\s|$)|charcoal|onyx/, "#1F2937"],
    [/(^|\s)white(\s|$)|ivory/, "#F8FAFC"],
    [/gray|grey|silver/, "#9CA3AF"],
    [/red|crimson|scarlet/, "#DC2626"],
    [/orange|amber/, "#F97316"],
    [/yellow|gold/, "#EAB308"],
    [/green|jade|olive|lime/, "#16A34A"],
    [/blue|azure|cobalt|navy|indigo/, "#2563EB"],
    [/purple|violet|lavender/, "#7C3AED"],
    [/pink|rose|magenta/, "#EC4899"],
    [/brown|chocolate|coffee/, "#8B5E3C"],
    [/beige|tan|sand|khaki/, "#C8A97E"],
    [/cyan|teal|turquoise/, "#06B6D4"],
    [/clear|natural|transparent/, "#D1D5DB"],
  ];
  for (const [pattern, hex] of named) {
    if (pattern.test(source)) {
      return hex;
    }
  }
  let hash = 2166136261 >>> 0;
  const seed = `${master.vendor}|${master.material}|${master.filament_name}|${master.color_name}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hue = hash % 360;
  const saturation = 50 + ((hash >>> 8) % 20);
  const lightness = 45 + ((hash >>> 16) % 18);
  return hslToHex(hue, saturation, lightness);
}
