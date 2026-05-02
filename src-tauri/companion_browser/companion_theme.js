export const COMPANION_THEME_STORAGE_KEY = "bfm-companion-theme-mode";

const SWATCH_FALLBACK = "#CBD5E1";
const VALID_THEME_MODES = new Set(["light", "dark", "auto"]);
const PRINTER_BRAND_HEX = {
  bambu: "#00B140",
  prusa: "#F97316",
  generic: "#CBD5E1",
};

function hslToHex(h, s, l) {
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hh = ((h % 360) + 360) % 360 / 60;
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
  const toHex = (channel) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hashString(seed) {
  let hash = 2166136261 >>> 0;
  const normalized = String(seed || "");
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeThemeMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  return VALID_THEME_MODES.has(normalized) ? normalized : "auto";
}

export function resolveCompanionTheme(mode, windowRef = window) {
  const normalized = normalizeThemeMode(mode);
  if (normalized === "light" || normalized === "dark") {
    return normalized;
  }
  return windowRef?.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function applyCompanionThemeMode(mode, documentRef = document, windowRef = window) {
  const normalized = normalizeThemeMode(mode);
  const resolved = resolveCompanionTheme(normalized, windowRef);
  const root = documentRef?.documentElement;
  if (root) {
    root.dataset.themeMode = normalized;
    root.style.colorScheme = resolved;
    root.classList.toggle("dark", resolved === "dark");
  }
  return resolved;
}

export function subscribeToMediaQueryChange(mediaQueryList, handler) {
  if (!mediaQueryList || typeof handler !== "function") {
    return false;
  }
  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", handler);
    return true;
  }
  if (typeof mediaQueryList.addListener === "function") {
    mediaQueryList.addListener(handler);
    return true;
  }
  return false;
}

export function readStoredCompanionThemeMode(storageKey, storageRef) {
  try {
    return normalizeThemeMode(storageRef?.getItem?.(storageKey));
  } catch {
    return "auto";
  }
}

export function normalizeHex(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return null;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toUpperCase();
  }
  if (/^[0-9a-fA-F]{3}$/.test(value) || /^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value.toUpperCase()}`;
  }
  return null;
}

export function toSwatchColor(raw) {
  return normalizeHex(raw) ?? SWATCH_FALLBACK;
}

export function hexToRgb(raw) {
  const normalized = toSwatchColor(raw).replace("#", "");
  if (normalized.length === 3) {
    const expanded = normalized
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
    return hexToRgb(`#${expanded}`);
  }
  if (normalized.length !== 6) {
    return null;
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return null;
  }
  return [red, green, blue];
}

export function suggestSwatchHex(colorName, filamentName = "", vendor = "", material = "") {
  const source = `${colorName || ""} ${filamentName || ""}`.toLowerCase();
  const named = [
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

  const hash = hashString(`${vendor}|${material}|${filamentName}|${colorName}`);
  const hue = hash % 360;
  const saturation = 50 + ((hash >>> 8) % 20);
  const lightness = 45 + ((hash >>> 16) % 18);
  return hslToHex(hue, saturation, lightness);
}

export function swatchCssVars(raw) {
  const color = toSwatchColor(raw);
  const rgb = hexToRgb(color) ?? [203, 213, 225];
  return {
    "--swatch-rgb": `${rgb[0]} ${rgb[1]} ${rgb[2]}`,
    "--swatch-solid": color,
  };
}

export function resolvePrinterBrandTone(model) {
  const normalized = String(model || "").trim().toLowerCase();
  if (normalized.includes("bambu")) {
    return "bambu";
  }
  if (normalized.includes("prusa")) {
    return "prusa";
  }
  return "generic";
}

export function printerBrandCssVars(model) {
  const tone = resolvePrinterBrandTone(model);
  const rgb = hexToRgb(PRINTER_BRAND_HEX[tone]) ?? [203, 213, 225];
  return {
    "--brand-rgb": `${rgb[0]} ${rgb[1]} ${rgb[2]}`,
  };
}

export function styleObjectToString(styleObject) {
  return Object.entries(styleObject || {})
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(";");
}
