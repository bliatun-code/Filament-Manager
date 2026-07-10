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

export type SwatchSurfaceStrength = {
  top: number;
  mid: number;
  bottom: number;
  base: string;
  shadow: number;
  ambientShadow: string;
  inset: string;
  border?: number;
};

export type SwatchSurfaceStyleOptions = {
  midStop?: string;
  bottomStop?: string;
  borderColor?: string;
  shadowGeometry?: string;
};

export function buildSwatchSurfaceStyle(
  raw: string | null | undefined,
  strength: SwatchSurfaceStrength,
  {
    midStop = "38%",
    bottomStop = "74%",
    borderColor = swatchRgba(raw, strength.border ?? 0.18),
    shadowGeometry = "0 18px 38px -34px",
  }: SwatchSurfaceStyleOptions = {},
) {
  return {
    backgroundColor: strength.base,
    backgroundImage: `linear-gradient(180deg, ${swatchRgba(raw, strength.top)} 0%, ${swatchRgba(
      raw,
      strength.mid,
    )} ${midStop}, ${swatchRgba(raw, strength.bottom)} ${bottomStop}, ${strength.base} 100%)`,
    borderColor,
    boxShadow: `inset 0 1px 0 ${strength.inset}, ${shadowGeometry} ${swatchRgba(
      raw,
      strength.shadow,
    )}, 0 3px 10px ${strength.ambientShadow}`,
  } as const;
}

export function swatchTextColor(raw: string | null | undefined): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return "#FFFFFF";
  }
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return brightness >= 170 ? "#0F172A" : "#FFFFFF";
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

const SWATCH_ACTION_CONTRAST_TARGET = 4.5;

function contrastRatio(
  first: [number, number, number],
  second: [number, number, number],
): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function mixRgb(
  source: [number, number, number],
  target: [number, number, number],
  amount: number,
): [number, number, number] {
  const ratio = Math.max(0, Math.min(1, amount));
  return source.map((channel, index) =>
    Math.round(channel * (1 - ratio) + target[index] * ratio),
  ) as [number, number, number];
}

function fitSwatchActionEndpoint(
  endpoint: [number, number, number],
  text: [number, number, number],
  safeTarget: [number, number, number],
) {
  for (let step = 0; step <= 100; step += 1) {
    const adjustment = step / 100;
    const candidate = mixRgb(endpoint, safeTarget, adjustment);
    if (contrastRatio(text, candidate) >= SWATCH_ACTION_CONTRAST_TARGET) {
      return { adjustment, rgb: candidate };
    }
  }
  return { adjustment: 1, rgb: safeTarget };
}

function fitSwatchActionGradient(
  start: [number, number, number],
  end: [number, number, number],
  text: [number, number, number],
  safeTarget: [number, number, number],
  contrastColor: "#FFFFFF" | "#0F172A",
) {
  const fittedStart = fitSwatchActionEndpoint(start, text, safeTarget);
  const fittedEnd = fitSwatchActionEndpoint(end, text, safeTarget);
  return {
    contrastColor,
    end: fittedEnd.rgb,
    maxAdjustment: Math.max(fittedStart.adjustment, fittedEnd.adjustment),
    start: fittedStart.rgb,
    totalAdjustment: fittedStart.adjustment + fittedEnd.adjustment,
  };
}

function rgbColor(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function rgbaColor(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function buildSwatchActionButtonStyle(
  raw: string | null | undefined,
  resolvedTheme: "light" | "dark",
) {
  const rgb = hexToRgb(raw) ?? hexToRgb(DEFAULT_SWATCH_COLOR) ?? [203, 213, 225];
  const luminance = relativeLuminance(rgb);
  const white: [number, number, number] = [255, 255, 255];
  const slate50: [number, number, number] = [248, 250, 252];
  const slate300: [number, number, number] = [203, 213, 225];
  const slate500: [number, number, number] = [100, 116, 139];
  const slate900: [number, number, number] = [15, 23, 42];
  let start: [number, number, number];
  let end: [number, number, number];
  let border: [number, number, number];
  let boxShadow: string;

  if (luminance > 0.62) {
    start = mixRgb(rgb, white, 0.12);
    end = mixRgb(rgb, slate300, 0.38);
    border = mixRgb(rgb, slate900, 0.18);
    boxShadow =
      resolvedTheme === "dark"
        ? `0 18px 36px -24px ${rgbaColor(rgb, 0.56)}, inset 0 1px 0 rgba(255, 255, 255, 0.42)`
        : `0 18px 36px -24px ${rgbaColor(rgb, 0.46)}, inset 0 1px 0 rgba(255, 255, 255, 0.54)`;
  } else if (luminance < 0.1) {
    start = mixRgb(rgb, slate500, 0.62);
    end = mixRgb(rgb, slate900, 0.46);
    border = mixRgb(rgb, slate50, 0.36);
    boxShadow =
      resolvedTheme === "dark"
        ? `0 18px 36px -24px ${rgbaColor(rgb, 0.72)}, inset 0 1px 0 rgba(255, 255, 255, 0.16)`
        : `0 18px 36px -24px ${rgbaColor(rgb, 0.52)}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`;
  } else {
    start = mixRgb(rgb, white, 0.08);
    end = mixRgb(rgb, slate900, resolvedTheme === "dark" ? 0.34 : 0.28);
    border = mixRgb(rgb, white, 0.24);
    boxShadow =
      resolvedTheme === "dark"
        ? `0 18px 36px -24px ${rgbaColor(rgb, 0.72)}, inset 0 1px 0 rgba(255, 255, 255, 0.14)`
        : `0 18px 36px -24px ${rgbaColor(rgb, 0.58)}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`;
  }

  const fittedGradient = [
    fitSwatchActionGradient(start, end, white, slate900, "#FFFFFF"),
    fitSwatchActionGradient(start, end, slate900, white, "#0F172A"),
  ].sort(
    (first, second) =>
      first.maxAdjustment - second.maxAdjustment ||
      first.totalAdjustment - second.totalAdjustment,
  )[0];

  return {
    background: `linear-gradient(135deg, ${rgbColor(fittedGradient.start)} 0%, ${rgbColor(
      fittedGradient.end,
    )} 100%)`,
    borderColor: rgbColor(border),
    color: fittedGradient.contrastColor,
    boxShadow,
  } as const;
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
