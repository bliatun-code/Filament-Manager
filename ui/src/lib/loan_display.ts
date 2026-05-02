import { swatchRgba, toSwatchColor } from "./color_utils";
import { normalizeDisplayToken } from "./display_format";
import { isLoanCurrentlyActive } from "./loan_state";
import { resolveSpoolTareWeight } from "./spool_weight";
import type { ResolvedTheme } from "./theme_mode";
import type { SpoolLoanDetailsRow } from "./tauri_client";
import { formatGrams as formatWeightGrams } from "./weight_display";
export { formatDateTime } from "./date_time";

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
  return formatWeightGrams(value, "zero");
}

function resolveLoanTareWeight(loan: SpoolLoanDetailsRow): number {
  return resolveSpoolTareWeight(loan.spool_tare_weight_g, loan.vendor);
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
          ? isLoanCurrentlyActive(loan)
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
