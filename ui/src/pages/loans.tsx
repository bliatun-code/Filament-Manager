import { useCallback, useEffect, useMemo, useState } from "react";
import {
  exportLoansCsv,
  fetchCachedLibrarySyncLoans,
  fetchLibrarySyncLoans,
  getLibrarySyncSettings,
  isTauri,
  listSpoolLoans,
  returnLibrarySyncHostLoan,
  returnInboundSpoolLoan,
  returnSpoolLoan,
  type SpoolLoanDetailsRow,
} from "../lib/tauri_client";
import { AppModal } from "../components/app_modal";
import { FeedbackBanner } from "../components/feedback_banner";
import { LoanOutModal } from "../components/loan_out_modal";
import { ModalHeader, modalPanelClassName } from "../components/modal_chrome";
import { VendorBadge } from "../components/vendor_badge";
import { neutralChipClass, semanticChipClass } from "../lib/chip_styles";
import { normalizeDisplayToken } from "../lib/display_format";
import { useI18n, type Locale } from "../lib/i18n";
import { useResolvedTheme, type ResolvedTheme } from "../lib/theme_mode";

type LoanFilter = "ALL" | "ACTIVE" | "RETURNED";
type LoanDirectionFilter = "ALL" | "OUTBOUND" | "INBOUND";

function normalizeLoanDirection(value?: string | null): "OUTBOUND" | "INBOUND" {
  return (value ?? "").trim().toUpperCase() === "INBOUND" ? "INBOUND" : "OUTBOUND";
}

function formatGrams(value?: number | null): string {
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

function toMeasuredTotalWeight(loan: SpoolLoanDetailsRow, filamentGrams?: number | null): number {
  return Math.max(0, filamentGrams ?? 0) + resolveLoanTareWeight(loan);
}

function toReturnedFilamentWeight(loan: SpoolLoanDetailsRow, measuredTotalGrams: number): number {
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

type LoanSwatchSurfaceTone = "card" | "inset";

function loanSwatchSurfaceStyle(
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

function loanSwatchPreviewStyle(raw: string | null | undefined) {
  const swatch = toSwatchColor(raw);
  return {
    background: `linear-gradient(145deg, ${swatch} 0%, ${swatch}CC 58%, #0f172a33 100%)`,
  } as const;
}

function normalizeLoanToken(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compactLoanTitle(
  loan: SpoolLoanDetailsRow,
  unknownLabel: string,
): string {
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

function compactLoanTimestamp(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return "—";
  }
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/,
  );
  if (!match) {
    return value;
  }
  const [, , month, day, hour, minute] = match;
  return `${day}.${month} ${hour}:${minute}`;
}

function formatDateTime(raw: string, locale: Locale): string {
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

const loanFactLabelClassName =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400";
const loanFactValueClassName =
  "mt-1 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-50";

function formatLoanReference(spoolIdRaw?: string | null): string {
  const spoolId = normalizeDisplayToken(spoolIdRaw);
  if (!spoolId) {
    return "—";
  }
  const normalizedId = spoolId.replace(/^spool_/, "");
  return `#${normalizedId.slice(-6)}`;
}

export default function LoansPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [loading, setLoading] = useState(tauri);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostWritePaired, setClientHostWritePaired] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [librarySyncReady, setLibrarySyncReady] = useState(!tauri);
  const [clientLoanSource, setClientLoanSource] = useState<"LIVE" | "CACHED" | "OFFLINE">(
    "LIVE",
  );
  const [clientLoanUpdatedAt, setClientLoanUpdatedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<LoanFilter>("ACTIVE");
  const [directionFilter, setDirectionFilter] = useState<LoanDirectionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [loans, setLoans] = useState<SpoolLoanDetailsRow[]>([]);
  const [showLoanOutModal, setShowLoanOutModal] = useState(false);
  const [returnModalLoan, setReturnModalLoan] = useState<SpoolLoanDetailsRow | null>(null);
  const [returnModalGrams, setReturnModalGrams] = useState("");
  const [returnModalNote, setReturnModalNote] = useState("");

  useEffect(() => {
    if (!tauri) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const syncSettings = await getLibrarySyncSettings();
        if (cancelled) {
          return;
        }
        setClientReadOnly(syncSettings.mode === "CLIENT");
        setClientHostWritePaired(syncSettings.client_auth_paired ?? false);
        setClientHostDeviceName(syncSettings.host_device_name ?? null);
        setClientHostBaseUrl(syncSettings.host_base_url ?? null);
        setClientLibraryId(syncSettings.library_id ?? null);
      } catch (syncError) {
        console.error(syncError);
      } finally {
        if (!cancelled) {
          setLibrarySyncReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauri]);

  const reload = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setLoading(true);
    try {
      const loanRows =
        clientReadOnly && clientHostBaseUrl && clientLibraryId
          ? await fetchLibrarySyncLoans(clientHostBaseUrl, clientLibraryId, 2000)
          : await listSpoolLoans(2000, true, "ALL");
      if (clientReadOnly) {
        setClientLoanSource("LIVE");
        const cached = await fetchCachedLibrarySyncLoans().catch(() => null);
        setClientLoanUpdatedAt(cached?.captured_at ?? null);
      }
      setLoans(loanRows);
    } catch (loadError) {
      console.error(loadError);
      if (clientReadOnly) {
        try {
          const cached = await fetchCachedLibrarySyncLoans();
          if (cached) {
            setClientLoanSource("CACHED");
            setClientLoanUpdatedAt(cached.captured_at ?? null);
            setLoans(cached.rows);
            return;
          }
        } catch (cacheError) {
          console.error(cacheError);
        }
        setClientLoanSource("OFFLINE");
        setClientLoanUpdatedAt(null);
        setLoans([]);
      }
      setError(t("loans.error.load", "Failed to load loan data."));
    } finally {
      setLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, t, tauri]);

  useEffect(() => {
    if (!tauri || !librarySyncReady) {
      return;
    }
    void reload();
  }, [librarySyncReady, reload, tauri]);

  const ensureLocalWriteAllowed = useCallback(() => {
    if (!clientReadOnly) {
      return true;
    }
    setInfo(
      t(
        "loans.clientReadOnlyAction",
        "This device is connected as a client. Use the host for loan changes.",
      ),
    );
    return false;
  }, [clientReadOnly, t]);

  const canUseClientHostWrite = useCallback(() => {
    if (!clientReadOnly) {
      return false;
    }
    if (!clientHostBaseUrl || !clientLibraryId) {
      setError(
        t(
          "loans.clientHostUnavailable",
          "Host connection details are missing for this client device.",
        ),
      );
      return false;
    }
    if (!clientHostWritePaired) {
      setError(
        t(
          "loans.clientWriteRequiresPairing",
          "Pair this desktop client with the host before running protected loan actions.",
        ),
      );
      return false;
    }
    return true;
  }, [clientHostBaseUrl, clientHostWritePaired, clientLibraryId, clientReadOnly, t]);

  const directionScopedLoans = useMemo(
    () =>
      loans.filter((loan) =>
        directionFilter === "ALL"
          ? true
          : normalizeLoanDirection(loan.loan.loan_direction) === directionFilter,
      ),
    [directionFilter, loans],
  );

  const filteredLoans = useMemo(() => {
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
  }, [directionScopedLoans, filter, search]);

  async function handleExportCsv() {
    if (!tauri || busy || clientReadOnly) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload = await exportLoansCsv(
        true,
        directionFilter === "ALL" ? "ALL" : directionFilter,
      );
      const blob = new Blob([payload.content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bambu-loans-${Date.now()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setInfo(t("loans.csvExported", "Loan CSV exported."));
    } catch (exportError) {
      console.error(exportError);
      setError(t("loans.error.export", "Failed to export loans CSV."));
    } finally {
      setBusy(false);
    }
  }

  function openReturnModal(loan: SpoolLoanDetailsRow) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy || loan.loan.returned_at) {
      return;
    }
    const loanDirection = normalizeLoanDirection(loan.loan.loan_direction);
    setReturnModalLoan(loan);
    setReturnModalGrams(
      String(
        toMeasuredTotalWeight(
          loan,
          loanDirection === "INBOUND" ? loan.spool_remaining_g ?? loan.loan.grams_out : loan.loan.grams_out,
        ),
      ),
    );
    setReturnModalNote("");
    setError(null);
    setInfo(null);
  }

  function closeReturnModal() {
    if (busy) {
      return;
    }
    setReturnModalLoan(null);
    setReturnModalGrams("");
    setReturnModalNote("");
  }

  async function handleConfirmReturnLoan() {
    if (!tauri || busy || !returnModalLoan || returnModalLoan.loan.returned_at) {
      return;
    }
    const measuredTotalGrams = Number.parseInt(returnModalGrams, 10);
    if (!Number.isFinite(measuredTotalGrams) || measuredTotalGrams < 0) {
      setError(
        t("loans.error.invalidReturned", "Returned grams must be zero or greater."),
      );
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const loanDirection = normalizeLoanDirection(returnModalLoan.loan.loan_direction);
      const returnedFilamentGrams = toReturnedFilamentWeight(returnModalLoan, measuredTotalGrams);
      if (clientReadOnly) {
        if (!canUseClientHostWrite()) {
          return;
        }
        await returnLibrarySyncHostLoan(
          clientHostBaseUrl!,
          clientLibraryId,
          {
            loan_id: returnModalLoan.loan.id,
            returned_grams: returnedFilamentGrams,
            note: returnModalNote.trim() || null,
            inbound: loanDirection === "INBOUND",
          },
        );
      } else {
        const action = loanDirection === "INBOUND" ? returnInboundSpoolLoan : returnSpoolLoan;
        await action({
          loan_id: returnModalLoan.loan.id,
          returned_grams: returnedFilamentGrams,
          note: returnModalNote.trim() || null,
        });
      }
      await reload();
      setInfo(
        loanDirection === "INBOUND"
          ? `${t("loans.markedHandedBackTo", "Marked borrowed-in spool as handed back to")} ${returnModalLoan.loan.counterparty_name ?? returnModalLoan.loan.borrower_name}.`
          : `${t("loans.markedReturnedFor", "Marked loan as returned for")} ${returnModalLoan.loan.borrower_name}.`,
      );
      closeReturnModal();
    } catch (returnError) {
      console.error(returnError);
      setError(
        normalizeLoanDirection(returnModalLoan.loan.loan_direction) === "INBOUND"
          ? t("loans.error.handBack", "Failed to hand back borrowed-in spool.")
          : t("loans.error.return", "Failed to return loan."),
      );
    } finally {
      setBusy(false);
    }
  }

  const returnModalDirection = returnModalLoan
    ? normalizeLoanDirection(returnModalLoan.loan.loan_direction)
    : "OUTBOUND";
  const returnModalInbound = returnModalDirection === "INBOUND";

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.loans", "Loans")}</h1>
          <div className="page-subtitle">
            {t(
              "loans.subtitle",
              "Track loaned-out and borrowed-in rolls, returns, hand-backs and per-person material consumption.",
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <div className="page-header-tools">
            <button
              type="button"
              onClick={() => {
                if (!clientReadOnly && !ensureLocalWriteAllowed()) {
                  return;
                }
                if (clientReadOnly && !canUseClientHostWrite()) {
                  return;
                }
                setShowLoanOutModal(true);
              }}
              disabled={!tauri || busy || (clientReadOnly && !clientHostWritePaired)}
              className="header-button-primary w-full min-[920px]:w-auto"
            >
              {t("inventory.loanOutRoll", "Loan out roll")}
            </button>
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={!tauri || busy || clientReadOnly}
              className="header-button-secondary w-full min-[920px]:w-auto"
            >
              {t("loans.exportCsv", "Export loans CSV")}
            </button>
          </div>
          <div className="flex w-full flex-col gap-2 min-[920px]:items-end">
            <input
              type="search"
              placeholder={t(
                "loans.searchPlaceholder",
                "Search person/material/spool id",
              )}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="page-header-search"
            />
            <div className="page-header-filter-surface">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-20">
                    {t("loans.direction", "Direction")}
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-[920px]:justify-end">
                    {(["ALL", "OUTBOUND", "INBOUND"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDirectionFilter(mode)}
                        className={neutralChipClass(
                          directionFilter === mode,
                          "px-3.5 py-2 text-xs",
                        )}
                      >
                        {mode === "ALL"
                          ? t("common.all", "All")
                          : mode === "OUTBOUND"
                            ? t("loans.directionOutbound", "Loaned out")
                            : t("loans.directionInbound", "Borrowed in")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2 min-[920px]:flex-row min-[920px]:items-center">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-20">
                    {t("inventory.status", "Status")}
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-[920px]:justify-end">
                    {(["ALL", "ACTIVE", "RETURNED"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setFilter(mode)}
                        className={neutralChipClass(filter === mode, "px-3.5 py-2 text-xs")}
                      >
                        {mode === "ALL"
                          ? t("common.all", "All")
                          : mode === "ACTIVE"
                            ? t("common.active", "Active")
                            : t("loans.returned", "Returned")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t(
            "loans.desktopOnly",
            "Loan tracking is available in the desktop app build.",
          )}
        </FeedbackBanner>
      ) : null}
      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {clientReadOnly && clientLoanSource !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {clientHostDeviceName
            ? `${clientHostDeviceName}. `
            : null}
          {clientLoanSource === "CACHED"
            ? t(
                "loans.clientReadOnlyCached",
                "Host unavailable. Showing the last cached loan snapshot.",
              )
            : t(
                "loans.clientReadOnlyOffline",
                "Host unavailable and no cached loan snapshot is available yet.",
              )}
          {clientLoanUpdatedAt
            ? ` ${t("loans.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientLoanUpdatedAt, locale)}.`
            : null}
        </FeedbackBanner>
      ) : null}
      {info ? (
        <FeedbackBanner tone="success" className="mt-4">
          {info}
        </FeedbackBanner>
      ) : null}

      <div className="mt-6">
        <section className="surface-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {t("loans.history", "Loan history")}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t(
                  "loans.historyHint",
                  "Open rows can be returned or handed back here, while completed rows stay searchable for reference.",
                )}
              </div>
            </div>
            <span className="rounded-full border border-slate-300 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/75 dark:text-slate-200 dark:shadow-none">
              {filteredLoans.length}
            </span>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {t("loans.loading", "Loading loans...")}
            </div>
          ) : null}
          {!loading && filteredLoans.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300/80 px-4 py-4 text-sm text-slate-600 dark:border-slate-700/80 dark:text-slate-400">
              {t("loans.noMatch", "No loans match current filter.")}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 min-[720px]:grid-cols-2 xl:grid-cols-4">
            {filteredLoans.map((loan) => {
              const isActive = !loan.loan.returned_at;
              const loanDirection = normalizeLoanDirection(loan.loan.loan_direction);
              const isInbound = loanDirection === "INBOUND";
              const loanTitle = compactLoanTitle(
                loan,
                t("common.unknown", "Unknown"),
              );
              const referenceLabel = formatLoanReference(loan.loan.spool_id);
              return (
                <div
                  key={loan.loan.id}
                  className="rounded-2xl border border-slate-300/80 p-3 shadow-sm shadow-slate-300/25 dark:border-slate-700/80 dark:shadow-none"
                  style={loanSwatchSurfaceStyle(loan.hex_color, "card", resolvedTheme)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/60 p-1.5 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                      <span
                        className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                        style={loanSwatchPreviewStyle(loan.hex_color)}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className="overflow-hidden break-words text-[15px] font-semibold leading-tight text-slate-950 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                            title={loanTitle}
                          >
                            {loanTitle}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                            <VendorBadge
                              vendor={loan.vendor?.trim() || t("common.unknown", "Unknown")}
                              compact
                            />
                            <span
                              className={semanticChipClass(
                                isInbound ? "warning" : "info",
                                "px-2.5 py-0.5 text-[10px] whitespace-nowrap",
                              )}
                            >
                              {isInbound
                                ? t("loans.directionInbound", "Borrowed in")
                                : t("loans.directionOutbound", "Loaned out")}
                            </span>
                            <span className="break-words">
                              {isInbound
                                ? t("inventory.borrowedFrom", "Borrowed from")
                                : t("loans.borrower", "Borrower")}
                              : {loan.loan.counterparty_name ?? loan.loan.borrower_name}
                            </span>
                          </div>
                        </div>
                        <span
                          className={semanticChipClass(
                            isActive ? "warning" : "success",
                            "px-2.5 py-0.5 text-[10px] whitespace-nowrap",
                          )}
                        >
                          {isActive
                            ? t("common.active", "Active")
                            : isInbound
                              ? t("loans.handedBack", "Handed back")
                              : t("loans.returned", "Returned")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="mt-2 rounded-[1.05rem] border px-2.5 py-2"
                    style={loanSwatchSurfaceStyle(
                      loan.hex_color,
                      "inset",
                      resolvedTheme,
                    )}
                  >
                    <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(108px,0.9fr)] gap-x-4 gap-y-3">
                      <div className="min-w-0">
                        <div className={loanFactLabelClassName}>
                          {t("inventory.reference", "Reference")}
                        </div>
                        <div
                          className={`${loanFactValueClassName} break-all font-mono`}
                          title={`#${loan.loan.spool_id}`}
                        >
                          {referenceLabel}
                        </div>
                      </div>
                      <div>
                        <div className={loanFactLabelClassName}>
                          {isInbound
                            ? t("loans.startWeight", "Start")
                            : t("loans.out", "Out")}
                        </div>
                        <div className={loanFactValueClassName}>
                          {formatGrams(loan.loan.grams_out)}
                        </div>
                      </div>
                      <div className={isActive ? "col-span-2" : ""}>
                        <div className={loanFactLabelClassName}>
                          {isInbound
                            ? t("loans.borrowedInAt", "Borrowed in")
                            : t("loans.lent", "Lent")}
                        </div>
                        <div className={loanFactValueClassName}>
                          {compactLoanTimestamp(loan.loan.lent_at)}
                        </div>
                      </div>
                      {!isActive ? (
                        <>
                          <div>
                            <div className={loanFactLabelClassName}>
                              {isInbound
                                ? t("loans.handedBackAt", "Handed back")
                                : t("loans.returned", "Returned")}
                            </div>
                            <div className={loanFactValueClassName}>
                              {compactLoanTimestamp(loan.loan.returned_at)}
                            </div>
                          </div>
                          <div>
                            <div className={loanFactLabelClassName}>
                              {isInbound
                                ? t("loans.back", "Back")
                                : t("loans.in", "In")}
                            </div>
                            <div className={loanFactValueClassName}>
                              {formatGrams(loan.loan.returned_grams)}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className={loanFactLabelClassName}>
                              {t("loans.consumed", "Consumed")}
                            </div>
                            <div className={loanFactValueClassName}>
                              {formatGrams(loan.loan.consumed_grams)}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {isActive ? (
                    <div className="mt-2 flex justify-start">
                      <button
                        type="button"
                        onClick={() => openReturnModal(loan)}
                        disabled={busy}
                        className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm shadow-emerald-200/25 disabled:opacity-50 min-[420px]:w-auto dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-none"
                      >
                        {isInbound
                          ? t("loans.handBackAction", "Hand back")
                          : t("loans.returnAction", "Return")}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <LoanOutModal
        open={showLoanOutModal}
        onClose={() => setShowLoanOutModal(false)}
        clientReadOnly={clientReadOnly}
        clientHostWritePaired={clientHostWritePaired}
        clientHostBaseUrl={clientHostBaseUrl}
        clientLibraryId={clientLibraryId}
        onLoanCreated={async () => {
          await reload();
          setInfo(t("inventory.loanCreated", "Loan created."));
        }}
      />

      {returnModalLoan ? (
        <AppModal
          closeOnBackdrop
          onBackdropClose={closeReturnModal}
          panelClassName={modalPanelClassName("lg")}
        >
          <div className="space-y-4">
            <ModalHeader
              eyebrow={t("nav.loans", "Loans")}
              title={
                returnModalInbound
                  ? t("loans.handBackDialogTitle", "Hand back borrowed-in spool")
                  : t("loans.returnDialogTitle", "Return loaned roll")
              }
              subtitle={
                returnModalInbound
                  ? t(
                      "loans.handBackDialogSubtitle",
                      "Weigh it back in, add a note if needed, then remove it from active inventory.",
                    )
                  : t(
                      "loans.returnDialogSubtitle",
                      "Weigh it back in and add a note if needed.",
                    )
              }
              onClose={closeReturnModal}
              closeLabel={t("common.close", "Close")}
              className="-mx-5 -mt-5"
            />

            <div
              className="rounded-2xl border border-slate-300/80 px-3.5 py-3 text-xs text-slate-700 shadow-sm shadow-slate-300/20 dark:border-slate-700/80 dark:text-slate-300 dark:shadow-none"
              style={loanSwatchSurfaceStyle(returnModalLoan.hex_color, "inset", resolvedTheme)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/60 p-2 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                  <span
                    className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                    style={loanSwatchPreviewStyle(returnModalLoan.hex_color)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-50">
                    {compactLoanTitle(returnModalLoan, t("common.unknown", "Unknown"))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    <VendorBadge
                      vendor={returnModalLoan.vendor?.trim() || t("common.unknown", "Unknown")}
                      compact
                    />
                    <span>
                      {returnModalInbound
                        ? t("inventory.borrowedFrom", "Borrowed from")
                      : t("loans.borrower", "Borrower")}
                      : {returnModalLoan.loan.counterparty_name ?? returnModalLoan.loan.borrower_name}
                    </span>
                  </div>
                  <div
                    className="mt-3 rounded-[1.05rem] border px-3.5 py-3"
                    style={loanSwatchSurfaceStyle(
                      returnModalLoan.hex_color,
                      "inset",
                      resolvedTheme,
                    )}
                  >
                    <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(108px,0.9fr)] gap-x-4 gap-y-3">
                      <div className="min-w-0">
                        <div className={loanFactLabelClassName}>
                          {t("inventory.reference", "Reference")}
                        </div>
                        <div
                          className={`${loanFactValueClassName} break-all font-mono`}
                          title={`#${returnModalLoan.loan.spool_id}`}
                        >
                          {formatLoanReference(returnModalLoan.loan.spool_id)}
                        </div>
                      </div>
                      <div>
                        <div className={loanFactLabelClassName}>
                          {returnModalInbound
                            ? t("loans.startWeight", "Start")
                            : t("loans.out", "Out")}
                        </div>
                        <div className={loanFactValueClassName}>
                          {formatGrams(
                            toMeasuredTotalWeight(returnModalLoan, returnModalLoan.loan.grams_out),
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {returnModalInbound ? (
              <FeedbackBanner tone="warning" compact>
                {t(
                  "loans.handBackDialogHint",
                  "Handing this back will remove the borrowed-in spool from active inventory but keep its loan history.",
                )}
              </FeedbackBanner>
            ) : null}

            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {returnModalInbound
                  ? t(
                      "loans.handBackDialogWeightLabel",
                      "Weigh-in handed-back total weight incl. spool (g)",
                    )
                  : t(
                      "loans.returnDialogWeightLabel",
                      "Weigh-in returned total weight incl. spool (g)",
                    )}
              </label>
              <input
                type="number"
                min={0}
                value={returnModalGrams}
                onChange={(event) => setReturnModalGrams(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t("loans.returnNoteOptional", "Return note (optional)")}
              </label>
              <input
                type="text"
                value={returnModalNote}
                onChange={(event) => setReturnModalNote(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                placeholder={t("loans.returnNoteOptional", "Return note (optional)")}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeReturnModal}
                disabled={busy}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-300/25 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none"
              >
                {t("common.close", "Close")}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmReturnLoan()}
                disabled={busy}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 shadow-sm shadow-emerald-200/25 disabled:opacity-50 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:shadow-none"
              >
                {returnModalInbound
                  ? t("loans.confirmHandBackAction", "Confirm hand-back")
                  : t("loans.confirmReturnAction", "Confirm return")}
              </button>
            </div>
          </div>
        </AppModal>
      ) : null}
    </div>
  );
}
