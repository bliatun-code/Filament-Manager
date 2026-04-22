import { normalizeDisplayToken } from "./display_format";
import type { Locale } from "./i18n";
import type { ResolvedTheme } from "./theme_mode";
import type { SpoolLoanDetailsRow } from "./tauri_client";

export type LoanFilter = "ALL" | "ACTIVE" | "RETURNED";
export type LoanDirectionFilter = "ALL" | "OUTBOUND" | "INBOUND";
type LoanSwatchSurfaceTone = "card" | "inset";

export const loanFactLabelClassName =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400";
export const loanFactValueClassName =
  "mt-1 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-50";

export function normalizeLoanDirection(value?: string | null): "OUTBOUND" | "INBOUND" {
  return (value ?? "").trim().toUpperCase() === "INBOUND" ? "INBOUND" : "OUTBOUND";
}

export function formatGrams(value?: number | null): string {
  if (value == null) {
    return "0 g";
  }
  return `${Math.max(0, value)} g`;
}

function defaultSpoolTareWeightForVendor(vendor?: string | null): number {
  const normalized = (vendor ?? "").trim().toLowerCase();
  if (normalized.includes("bambu")) {
    return 250;
  }
  if (normalized.includes("esun")) {
    return 224;
  }
  return 0;
}

function resolveLoanTareWeight(loan: SpoolLoanDetailsRow): number {
  const explicit = loan.spool_tare_weight_g;
  if (explicit != null && Number.isFinite(explicit)) {
    return Math.max(0, Math.round(explicit));
  }
  return defaultSpoolTareWeightForVendor(loan.vendor);
}

export function toMeasuredTotalWeight(
  loan: SpoolLoanDetailsRow,
  filamentGrams?: number | null,
): number {
  return Math.max(0, filamentGrams ?? 0) + resolveLoanTareWeight(loan);
}

export function toReturnedFilamentWeight(
  loan: SpoolLoanDetailsRow,
  measuredTotalGrams: number,
): number {
  return Math.max(0, measuredTotalGrams - resolveLoanTareWeight(loan));
}

function toSwatchColor(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return "#CBD5E1";
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  if (/^[0-9a-fA-F]{3}$/.test(value) || /^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value}`;
  }
  return "#CBD5E1";
}

function hexToRgb(raw?: string | null): [number, number, number] | null {
  const normalized = toSwatchColor(raw).replace("#", "");
  if (normalized.length === 3) {
    const expanded = normalized
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    return [red, green, blue];
  }
  if (normalized.length === 6) {
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    return [red, green, blue];
  }
  return null;
}

function swatchRgba(raw: string | null | undefined, alpha: number): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return `rgba(203, 213, 225, ${alpha})`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function loanSwatchSurfaceStyle(
  raw: string | null | undefined,
  tone: LoanSwatchSurfaceTone = "card",
  resolvedTheme: ResolvedTheme = "light",
) {
  const darkTheme = resolvedTheme === "dark";
  const strength =
    darkTheme
      ? tone === "inset"
        ? {
            top: 0.28,
            mid: 0.14,
            bottom: 0.06,
            base: "rgb(13, 21, 39)",
            shadow: 0.34,
            border: 0.4,
            ambientShadow: "rgba(2, 6, 23, 0.44)",
            inset: "rgba(255, 255, 255, 0.028)",
          }
        : {
            top: 0.32,
            mid: 0.16,
            bottom: 0.08,
            base: "rgb(10, 17, 31)",
            shadow: 0.38,
            border: 0.44,
            ambientShadow: "rgba(2, 6, 23, 0.5)",
            inset: "rgba(255, 255, 255, 0.03)",
          }
      : tone === "inset"
        ? {
            top: 0.1,
            mid: 0.05,
            bottom: 0.02,
            base: "rgba(253, 254, 255, 0.97)",
            shadow: 0.2,
            border: 0.16,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.8)",
          }
        : {
            top: 0.12,
            mid: 0.06,
            bottom: 0.022,
            base: "rgba(252, 254, 255, 0.95)",
            shadow: 0.24,
            border: 0.18,
            ambientShadow: "rgba(148, 163, 184, 0.08)",
            inset: "rgba(255, 255, 255, 0.8)",
          };

  return {
    backgroundColor: strength.base,
    backgroundImage: `linear-gradient(180deg, ${swatchRgba(raw, strength.top)} 0%, ${swatchRgba(
      raw,
      strength.mid,
    )} ${darkTheme ? "24%" : "38%"}, ${swatchRgba(
      raw,
      strength.bottom,
    )} ${darkTheme ? "66%" : "74%"}, ${strength.base} 100%)`,
    borderColor: swatchRgba(raw, strength.border),
    boxShadow: `inset 0 1px 0 ${strength.inset}, 0 18px 38px -34px ${swatchRgba(
      raw,
      strength.shadow,
    )}, 0 3px 10px ${strength.ambientShadow}`,
  } as const;
}

export function loanSwatchPreviewStyle(raw: string | null | undefined) {
  const swatch = toSwatchColor(raw);
  return {
    background: `linear-gradient(145deg, ${swatch} 0%, ${swatch}CC 58%, #0f172a33 100%)`,
  } as const;
}

function normalizeLoanToken(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function compactLoanTitle(loan: SpoolLoanDetailsRow, unknownLabel: string): string {
  const material = normalizeLoanToken(loan.material);
  const filament = normalizeLoanToken(loan.filament_name);
  const color = normalizeLoanToken(loan.color_name);

  if (color) {
    if (filament) {
      const filamentLower = filament.toLowerCase();
      const colorLower = color.toLowerCase();
      const materialLower = material?.toLowerCase() ?? null;
      if (
        colorLower === filamentLower ||
        colorLower.startsWith(`${filamentLower} `) ||
        colorLower.startsWith(`${filamentLower}·`) ||
        (materialLower != null &&
          (colorLower === materialLower ||
            colorLower.startsWith(`${materialLower} `) ||
            colorLower.startsWith(`${materialLower}·`)))
      ) {
        return color;
      }
      if (filamentLower === materialLower) {
        return color;
      }
      return `${filament} · ${color}`;
    }
    return color;
  }

  if (filament) {
    return filament;
  }

  if (material) {
    return material;
  }

  return unknownLabel;
}

export function compactLoanTimestamp(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return "—";
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) {
    return value;
  }
  const [, , month, day, hour, minute] = match;
  return `${day}.${month} ${hour}:${minute}`;
}

export function formatDateTime(raw: string, locale: Locale): string {
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

export function formatLoanReference(spoolIdRaw?: string | null): string {
  const spoolId = normalizeDisplayToken(spoolIdRaw);
  if (!spoolId) {
    return "—";
  }
  const normalizedId = spoolId.replace(/^spool_/, "");
  return `#${normalizedId.slice(-6)}`;
}

export function filterLoans(
  loans: SpoolLoanDetailsRow[],
  directionFilter: LoanDirectionFilter,
  filter: LoanFilter,
  search: string,
): SpoolLoanDetailsRow[] {
  const directionScopedLoans = loans.filter((loan) =>
    directionFilter === "ALL"
      ? true
      : normalizeLoanDirection(loan.loan.loan_direction) === directionFilter,
  );

  const term = search.trim().toLowerCase();
  return directionScopedLoans.filter((loan) => {
    const statusMatch =
      filter === "ALL"
        ? true
        : filter === "ACTIVE"
          ? !loan.loan.returned_at
          : Boolean(loan.loan.returned_at);
    const searchMatch =
      term.length === 0
        ? true
        : `${loan.loan.borrower_name} ${loan.loan.counterparty_name ?? ""} ${loan.material ?? ""} ${
            loan.filament_name ?? ""
          } ${loan.color_name ?? ""} ${loan.loan.spool_id}`
            .toLowerCase()
            .includes(term);
    return statusMatch && searchMatch;
  });
}
