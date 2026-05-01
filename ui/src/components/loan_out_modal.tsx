import { useCallback, useEffect, useMemo, useState } from "react";
import { AppModal } from "./app_modal";
import { FeedbackBanner } from "./feedback_banner";
import { ModalHeader, modalPanelClassName } from "./modal_chrome";
import { VendorBadge } from "./vendor_badge";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { hexToRgb, toSwatchColor } from "../lib/color_utils";
import { useI18n } from "../lib/i18n";
import { sortSpoolsAlphabetically } from "../lib/spool_sort";
import { resolveSpoolTareWeight } from "../lib/spool_weight";
import { useResolvedTheme, type ResolvedTheme } from "../lib/theme_mode";
import {
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSpools,
  isTauri,
  lendLibrarySyncHostSpool,
  lendSpool,
  listPrinterOverview,
  listSpools,
} from "../lib/tauri_client";

type LoanOutModalProps = {
  open: boolean;
  onClose: () => void;
  preferredSpoolId?: string | null;
  clientReadOnly?: boolean;
  clientHostWritePaired?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  onLoanCreated?: (details: {
    spoolId: string;
    borrowerName: string;
    gramsOut: number;
  }) => Promise<void> | void;
};

type LoanableSpool = {
  id: string;
  vendor: string;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor?: string | null;
  status: string;
  remainingGrams?: number | null;
  spoolTareWeightGrams?: number | null;
  location?: string | null;
};

function swatchRgba(raw: string | null | undefined, alpha: number): string {
  const rgb = hexToRgb(raw);
  if (!rgb) {
    return `rgba(203, 213, 225, ${alpha})`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function swatchPanelStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme = "light",
) {
  const darkTheme = resolvedTheme === "dark";
  const strength =
    darkTheme
      ? {
          top: 0.32,
          mid: 0.16,
          bottom: 0.08,
          base: "rgb(10, 17, 31)",
          shadow: 0.38,
          border: 0.44,
          ambientShadow: "rgba(2, 6, 23, 0.5)",
          inset: "rgba(255, 255, 255, 0.03)",
        }
      : {
          top: 0.08,
          mid: 0.035,
          bottom: 0.012,
          base: "rgba(255, 255, 255, 0.985)",
          shadow: 0.14,
          border: 0.15,
          ambientShadow: "rgba(148, 163, 184, 0.06)",
          inset: "rgba(255, 255, 255, 0.92)",
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

function swatchInsetStyle(
  raw: string | null | undefined,
  resolvedTheme: ResolvedTheme = "light",
) {
  const darkTheme = resolvedTheme === "dark";
  const strength =
    darkTheme
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
          top: 0.06,
          mid: 0.026,
          bottom: 0.01,
          base: "rgba(255, 255, 255, 0.992)",
          shadow: 0.1,
          border: 0.12,
          ambientShadow: "rgba(148, 163, 184, 0.05)",
          inset: "rgba(255, 255, 255, 0.94)",
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

function formatGrams(value?: number | null): string {
  if (value == null) {
    return "0 g";
  }
  return `${Math.max(0, value)} g`;
}

function resolveLoanableSpoolTareWeight(spool: LoanableSpool): number {
  return resolveSpoolTareWeight(spool.spoolTareWeightGrams, spool.vendor);
}

function toMeasuredTotalWeight(spool: LoanableSpool, filamentGrams?: number | null): number {
  return Math.max(0, filamentGrams ?? 0) + resolveLoanableSpoolTareWeight(spool);
}

function toLoanedFilamentWeight(spool: LoanableSpool, measuredTotalGrams: number): number {
  return Math.max(0, measuredTotalGrams - resolveLoanableSpoolTareWeight(spool));
}

const formInputClassName =
  "mt-1.5 w-full rounded-2xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-sm text-slate-800 shadow-sm shadow-slate-200/20 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200/70 dark:border-slate-700/80 dark:bg-slate-950/45 dark:text-slate-100 dark:shadow-none dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700/70";
const panelCardClassName =
  "rounded-[1.75rem] border border-slate-200/85 bg-white/94 p-5 shadow-[0_18px_38px_-30px_rgba(71,85,105,0.16),0_4px_10px_rgba(148,163,184,0.08)] dark:border-slate-700/70 dark:bg-slate-950/45 dark:shadow-none";
const panelTitleClassName = "text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50";
const panelSubtitleClassName = "mt-1 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300";
const countPillClassName =
  "inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-full border border-slate-200/85 bg-white/85 px-3 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/20 dark:border-slate-700/75 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-none";
const detailLabelClassName =
  "text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";
const detailValueClassName = "mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50";

export function LoanOutModal({
  open,
  onClose,
  preferredSpoolId = null,
  clientReadOnly = false,
  clientHostWritePaired = false,
  clientHostBaseUrl = null,
  clientLibraryId = null,
  onLoanCreated,
}: LoanOutModalProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spools, setSpools] = useState<LoanableSpool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [borrowerName, setBorrowerName] = useState("");
  const [gramsOut, setGramsOut] = useState("");
  const [note, setNote] = useState("");

  const reload = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [spoolRows, printerOverview] = await Promise.all([
        clientReadOnly && clientHostBaseUrl && clientLibraryId
          ? fetchLibrarySyncSpools(clientHostBaseUrl, clientLibraryId, 1200, 0)
          : listSpools(1200, 0),
        clientReadOnly && clientHostBaseUrl && clientLibraryId
          ? fetchLibrarySyncPrinterOverview(clientHostBaseUrl, clientLibraryId)
          : listPrinterOverview(),
      ]);
      const assignedSpoolIds = new Set(
        printerOverview.flatMap((printer) =>
          printer.slots
            .map((slot) => slot.spool_id)
            .filter((spoolId): spoolId is string => typeof spoolId === "string" && spoolId.length > 0),
        ),
      );
      const candidates = sortSpoolsAlphabetically(spoolRows)
        .filter((row) => {
          const status = (row.spool.status ?? "").trim().toUpperCase();
          const ownershipType = (row.spool.ownership_type ?? "").trim().toUpperCase();
          if (assignedSpoolIds.has(row.spool.id)) {
            return false;
          }
          if (ownershipType === "BORROWED_IN") {
            return false;
          }
          if (status !== "IN_STOCK") {
            return false;
          }
          return true;
        })
        .map((row) => ({
          id: row.spool.id,
          vendor: row.master.vendor,
          material: row.master.material,
          filamentName: row.master.filament_name,
          colorName: row.master.color_name,
          hexColor: row.master.hex_color ?? null,
          status: row.spool.status,
          remainingGrams: row.spool.remaining_g ?? row.spool.current_weight_g ?? null,
          spoolTareWeightGrams: row.spool.spool_tare_weight_g ?? null,
          location: row.spool.location_id ?? null,
        }));
      setSpools(candidates);
      const preferred =
        (preferredSpoolId
          ? candidates.find((spool) => spool.id === preferredSpoolId) ?? null
          : null) ??
        candidates[0] ??
        null;
      setSelectedSpoolId(preferred?.id ?? null);
      setGramsOut(
        preferred?.remainingGrams != null
          ? String(toMeasuredTotalWeight(preferred, preferred.remainingGrams))
          : "",
      );
    } catch (loadError) {
      console.error(loadError);
      setError(t("inventory.error.loadInventory", "Failed to load inventory."));
    } finally {
      setLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, preferredSpoolId, t, tauri]);

  useEffect(() => {
    if (!open || !tauri) {
      return;
    }
    setBorrowerName("");
    setNote("");
    setError(null);
    void reload();
  }, [open, reload, tauri]);

  const selectedSpool = useMemo(
    () => (selectedSpoolId ? spools.find((spool) => spool.id === selectedSpoolId) ?? null : null),
    [selectedSpoolId, spools],
  );
  const selectedPlacementLabel = selectedSpool
    ? formatPlacementLabel(t, selectedSpool.location)
    : null;
  const selectedReferenceLabel = selectedSpool
    ? formatSpoolReference(selectedSpool.id)
    : null;

  async function handleSubmit() {
    if (!tauri || !selectedSpool || busy) {
      return;
    }
    if (clientReadOnly && (!clientHostBaseUrl || !clientLibraryId)) {
      setError(
        t(
          "inventory.clientHostUnavailable",
          "Host connection details are missing for this client device.",
        ),
      );
      return;
    }
    if (clientReadOnly && !clientHostWritePaired) {
      setError(
        t(
          "inventory.clientWriteRequiresPairing",
          "Pair this desktop client with the host before running protected sync actions.",
        ),
      );
      return;
    }
    const borrower = borrowerName.trim();
    if (!borrower) {
      setError(t("inventory.error.borrowerRequired", "Borrower name is required."));
      return;
    }
    const measuredTotalGrams = Number.parseInt(gramsOut, 10);
    if (!Number.isFinite(measuredTotalGrams) || measuredTotalGrams < 0) {
      setError(t("inventory.error.loanGrams", "Loan grams must be zero or greater."));
      return;
    }
    const grams = toLoanedFilamentWeight(selectedSpool, measuredTotalGrams);

    setBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        await lendLibrarySyncHostSpool(clientHostBaseUrl!, clientLibraryId, {
          spool_id: selectedSpool.id,
          borrower_name: borrower,
          grams_out: grams,
          note: note.trim() || null,
        });
      } else {
        await lendSpool({
          spool_id: selectedSpool.id,
          borrower_name: borrower,
          grams_out: grams,
          note: note.trim() || null,
        });
      }
      await onLoanCreated?.({
        spoolId: selectedSpool.id,
        borrowerName: borrower,
        gramsOut: grams,
      });
      onClose();
    } catch (loanError) {
      console.error(loanError);
      setError(t("inventory.error.loanOut", "Failed to loan out roll."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={busy ? undefined : onClose}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-md dark:bg-black/55"
      panelClassName={modalPanelClassName("wide", "flex max-h-[92vh] min-h-0 flex-col p-0")}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ModalHeader
          eyebrow={t("inventory.loanTracking", "Loan tracking")}
          title={t("inventory.loanOutRoll", "Loan out roll")}
          onClose={onClose}
          closeLabel={t("common.close", "Close")}
          disabled={busy}
          className="px-6 py-5"
          titleClassName="text-2xl"
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-4">
          {error ? (
            <FeedbackBanner tone="danger">
              {error}
            </FeedbackBanner>
          ) : null}

          {loading ? (
            <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
              {t("inventory.loading", "Loading...")}
            </div>
          ) : spools.length === 0 ? (
            <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "inventory.noLoanableRolls",
                "No rolls are currently available to loan out.",
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(22rem,0.9fr)]">
              <div className={`${panelCardClassName} flex min-h-0 flex-col`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className={panelTitleClassName}>
                    {t("inventory.availableToLoan", "Available to loan")}
                  </div>
                  <span className={countPillClassName}>{spools.length}</span>
                </div>

                <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto pr-1 max-h-[min(58vh,40rem)]">
                  {spools.map((spool) => {
                    const isActive = selectedSpool?.id === spool.id;
                    const placementLabel = formatPlacementLabel(t, spool.location);
                    const referenceLabel = formatSpoolReference(spool.id);
                    return (
                      <button
                        key={spool.id}
                        type="button"
                        onClick={() => {
                          setSelectedSpoolId(spool.id);
                          setGramsOut(
                            spool.remainingGrams != null
                              ? String(toMeasuredTotalWeight(spool, spool.remainingGrams))
                              : "",
                          );
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] transition ${
                          isActive
                            ? "border-slate-300 shadow-sm dark:border-slate-500"
                            : "border-slate-200/90 bg-white hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-950/40 dark:hover:border-slate-500"
                        }`}
                        style={
                          isActive
                            ? swatchInsetStyle(spool.hexColor, resolvedTheme)
                            : undefined
                        }
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="h-8 w-8 shrink-0 rounded-md border border-slate-200 dark:border-slate-600"
                            style={{
                              background: `linear-gradient(145deg, ${toSwatchColor(
                                spool.hexColor,
                              )} 0%, ${toSwatchColor(spool.hexColor)}CC 60%, #0f172a26 100%)`,
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className="block overflow-hidden break-words font-semibold leading-tight text-slate-900 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                              title={formatFilamentDisplayTitle(
                                spool.material,
                                spool.filamentName,
                                spool.colorName,
                              )}
                            >
                              {formatFilamentDisplayTitle(
                                spool.material,
                                spool.filamentName,
                                spool.colorName,
                              )}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <VendorBadge vendor={spool.vendor} compact />
                              <span className="font-mono" title={`#${spool.id}`}>
                                {referenceLabel}
                              </span>
                              <span>{formatGrams(spool.remainingGrams)}</span>
                              <span className="truncate max-w-[11rem]" title={placementLabel}>
                                {placementLabel}
                              </span>
                            </span>
                          </span>
                        </span>
                        {isActive ? (
                          <span className="shrink-0 rounded-full border border-slate-300 bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm dark:border-slate-500 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-none">
                            ✓ {t("common.selected", "Selected")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={panelCardClassName}>
                {selectedSpool ? (
                  <div className="space-y-4">
                    <div
                      className="rounded-[1.4rem] border px-4 py-4 shadow-sm shadow-slate-200/15 dark:shadow-none"
                      style={swatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/75 bg-white/65 p-2 shadow-sm shadow-slate-200/25 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                          <span
                            className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                            style={{
                              background: `linear-gradient(145deg, ${toSwatchColor(
                                selectedSpool.hexColor,
                              )} 0%, ${toSwatchColor(
                                selectedSpool.hexColor,
                              )}CC 58%, #0f172a33 100%)`,
                            }}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            {t("inventory.selectionPreview", "Selection preview")}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                              {formatFilamentDisplayTitle(
                                selectedSpool.material,
                                selectedSpool.filamentName,
                                selectedSpool.colorName,
                              )}
                            </div>
                            <VendorBadge vendor={selectedSpool.vendor} compact />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(132px,0.8fr)]">
                        <div
                          className="rounded-xl border px-3 py-2.5"
                          style={swatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                        >
                          <div className={detailLabelClassName}>
                            {t("inventory.reference", "Reference")}
                          </div>
                          <div
                            className={`${detailValueClassName} font-mono`}
                            title={`#${selectedSpool.id}`}
                          >
                            {selectedReferenceLabel}
                          </div>
                        </div>
                        <div
                          className="rounded-xl border px-3 py-2.5"
                          style={swatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                        >
                          <div className={detailLabelClassName}>
                            {t("inventory.remaining", "Remaining")}
                          </div>
                          <div className={detailValueClassName}>
                            {formatGrams(selectedSpool.remainingGrams)}
                          </div>
                        </div>
                        <div
                          className="rounded-xl border px-3 py-2.5 sm:col-span-2"
                          style={swatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                        >
                          <div className={detailLabelClassName}>
                            {t("inventory.location", "Location")}
                          </div>
                          <div className={detailValueClassName} title={selectedPlacementLabel ?? ""}>
                            {selectedPlacementLabel}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/94 p-4 shadow-sm shadow-slate-200/18 dark:border-slate-700/70 dark:bg-slate-950/35 dark:shadow-none">
                      <div className={panelTitleClassName}>
                        {t("inventory.loanDetails", "Loan details")}
                      </div>
                      <div className={panelSubtitleClassName}>
                        {t(
                          "inventory.loanDetailsHelp",
                          "Confirm the borrower and measured outgoing total weight including spool before saving the loan.",
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {t("inventory.borrowerName", "Borrower name")}
                          </label>
                          <input
                            type="text"
                            value={borrowerName}
                            onChange={(event) => setBorrowerName(event.target.value)}
                            className={formInputClassName}
                            placeholder={t("inventory.borrowerName", "Borrower name")}
                            disabled={!tauri || busy}
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {t("inventory.maxAvailable", "Max available")}:{" "}
                            {formatGrams(
                              toMeasuredTotalWeight(selectedSpool, selectedSpool.remainingGrams),
                            )}
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={gramsOut}
                            onChange={(event) => setGramsOut(event.target.value)}
                            className={formInputClassName}
                            placeholder={t("inventory.outG", "Out g")}
                            disabled={!tauri || busy}
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {t("inventory.loanNoteOptional", "Loan note (optional)")}
                        </label>
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          className={`${formInputClassName} min-h-[104px] resize-y`}
                          placeholder={t("inventory.loanNoteOptional", "Loan note (optional)")}
                          disabled={!tauri || busy}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={!tauri || busy}
                        className="mt-4 w-full rounded-2xl border border-slate-800 bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-slate-300/40 transition hover:bg-slate-800 disabled:opacity-50 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none dark:hover:bg-white"
                      >
                        {t("inventory.loanOutRoll", "Loan out roll")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                    {t("inventory.chooseRollToLoan", "Choose a roll to loan out.")}
                    {clientReadOnly ? (
                      <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {clientHostWritePaired
                          ? t(
                              "inventory.clientLoanOutPairedHint",
                              "Available rolls are loaded from the host and the loan is created there.",
                            )
                          : t(
                              "inventory.clientLoanOutUnpairedHint",
                              "Pair this desktop client with the host before creating a loan from this device.",
                            )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </AppModal>
  );
}
