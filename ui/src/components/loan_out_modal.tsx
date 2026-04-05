import { useCallback, useEffect, useMemo, useState } from "react";
import { AppModal } from "./app_modal";
import { FeedbackBanner } from "./feedback_banner";
import { ModalHeader, modalPanelClassName } from "./modal_chrome";
import { VendorBadge } from "./vendor_badge";
import { compactReferenceLabel, formatPlacementLabel } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { useResolvedTheme, type ResolvedTheme } from "../lib/theme_mode";
import {
  isTauri,
  lendSpool,
  listActiveSpoolLoans,
  listSpools,
} from "../lib/tauri_client";

type LoanOutModalProps = {
  open: boolean;
  onClose: () => void;
  preferredSpoolId?: string | null;
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
  location?: string | null;
};

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

const formInputClassName =
  "mt-1.5 w-full rounded-2xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-sm text-slate-800 shadow-sm shadow-slate-200/20 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200/70 dark:border-slate-700/80 dark:bg-slate-950/45 dark:text-slate-100 dark:shadow-none dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700/70";
const panelCardClassName =
  "rounded-[1.75rem] border border-slate-200/85 bg-white/94 p-5 shadow-[0_18px_38px_-30px_rgba(71,85,105,0.16),0_4px_10px_rgba(148,163,184,0.08)] dark:border-slate-700/70 dark:bg-slate-950/45 dark:shadow-none";
const panelTitleClassName = "text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50";
const panelSubtitleClassName = "mt-1 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300";
const countPillClassName =
  "inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-full border border-slate-200/85 bg-white/85 px-3 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/20 dark:border-slate-700/75 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-none";
const listMetaChipClassName =
  "rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] text-slate-600 dark:border-slate-700/70 dark:bg-slate-950/35 dark:text-slate-300";
const detailLabelClassName =
  "text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";
const detailValueClassName = "mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50";

export function LoanOutModal({
  open,
  onClose,
  preferredSpoolId = null,
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
      const [spoolRows, activeLoans] = await Promise.all([
        listSpools(1200, 0),
        listActiveSpoolLoans(),
      ]);
      const activeLoanSpoolIds = new Set(activeLoans.map((row) => row.loan.spool_id));
      const candidates = spoolRows
        .map((row) => ({
          id: row.spool.id,
          vendor: row.master.vendor,
          material: row.master.material,
          filamentName: row.master.filament_name,
          colorName: row.master.color_name,
          hexColor: row.master.hex_color ?? null,
          status: row.spool.status,
          remainingGrams: row.spool.remaining_g ?? row.spool.current_weight_g ?? null,
          location: row.spool.location_id ?? null,
        }))
        .filter(
          (spool) =>
            spool.status !== "EMPTY" &&
            spool.status !== "LOST" &&
            !activeLoanSpoolIds.has(spool.id),
        );
      setSpools(candidates);
      const preferred =
        (preferredSpoolId
          ? candidates.find((spool) => spool.id === preferredSpoolId) ?? null
          : null) ??
        candidates[0] ??
        null;
      setSelectedSpoolId(preferred?.id ?? null);
      setGramsOut(preferred?.remainingGrams != null ? String(preferred.remainingGrams) : "");
    } catch (loadError) {
      console.error(loadError);
      setError(t("inventory.error.loadInventory", "Failed to load inventory."));
    } finally {
      setLoading(false);
    }
  }, [preferredSpoolId, t, tauri]);

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
    ? compactReferenceLabel(selectedSpool.id)
    : null;

  async function handleSubmit() {
    if (!tauri || !selectedSpool || busy) {
      return;
    }
    const borrower = borrowerName.trim();
    if (!borrower) {
      setError(t("inventory.error.borrowerRequired", "Borrower name is required."));
      return;
    }
    const grams = Number.parseInt(gramsOut, 10);
    if (!Number.isFinite(grams) || grams < 0) {
      setError(t("inventory.error.loanGrams", "Loan grams must be zero or greater."));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await lendSpool({
        spool_id: selectedSpool.id,
        borrower_name: borrower,
        grams_out: grams,
        note: note.trim() || null,
      });
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
      panelClassName={modalPanelClassName("wide", "p-0")}
    >
      <div>
        <ModalHeader
          eyebrow={t("inventory.loanTracking", "Loan tracking")}
          title={t("inventory.loanOutRoll", "Loan out roll")}
          subtitle={t(
            "inventory.loanTrackingSubtitle",
            "Loan out a roll from inventory. Returns are handled from the Loans page.",
          )}
          onClose={onClose}
          closeLabel={t("common.close", "Close")}
          disabled={busy}
          className="px-6 py-5"
          titleClassName="text-2xl"
        />

        <div className="space-y-4 px-6 py-6">
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
              <div className={panelCardClassName}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={panelTitleClassName}>
                      {t("inventory.availableToLoan", "Available to loan")}
                    </div>
                    <div className={panelSubtitleClassName}>
                      {t(
                        "inventory.loanSelectionHelp",
                        "Choose an in-stock roll, then confirm who is taking it and how much is going out.",
                      )}
                    </div>
                  </div>
                  <span className={countPillClassName}>{spools.length}</span>
                </div>

                <div className="mt-4 grid max-h-[58vh] grid-cols-1 gap-2 overflow-y-auto pr-1">
                  {spools.map((spool) => {
                    const isActive = selectedSpool?.id === spool.id;
                    const placementLabel = formatPlacementLabel(t, spool.location);
                    return (
                      <button
                        key={spool.id}
                        type="button"
                        onClick={() => {
                          setSelectedSpoolId(spool.id);
                          setGramsOut(
                            spool.remainingGrams != null ? String(spool.remainingGrams) : "",
                          );
                        }}
                        className={`rounded-[1.4rem] border px-4 py-3.5 text-left transition ${
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
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/75 bg-white/65 p-2 shadow-sm shadow-slate-200/25 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-none">
                            <span
                              className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
                              style={{
                                background: `linear-gradient(145deg, ${toSwatchColor(
                                  spool.hexColor,
                                )} 0%, ${toSwatchColor(
                                  spool.hexColor,
                                )}CC 58%, #0f172a33 100%)`,
                              }}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                                {spool.filamentName} · {spool.colorName}
                              </div>
                              <VendorBadge vendor={spool.vendor} compact />
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className={listMetaChipClassName}>
                                {spool.material}
                              </span>
                              <span className={`${listMetaChipClassName} font-medium text-slate-700 dark:text-slate-200`}>
                                {formatGrams(spool.remainingGrams)}
                              </span>
                              <span
                                className={`${listMetaChipClassName} max-w-full truncate`}
                                title={placementLabel}
                              >
                                {placementLabel}
                              </span>
                            </div>
                          </div>
                        </div>
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
                              {selectedSpool.filamentName} · {selectedSpool.colorName}
                            </div>
                            <VendorBadge vendor={selectedSpool.vendor} compact />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className={listMetaChipClassName}>
                              {selectedSpool.material}
                            </span>
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
                          "Confirm the borrower and outgoing weight before saving the loan.",
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
                          <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                            <span>{t("inventory.outG", "Out g")}</span>
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              {t("inventory.maxAvailable", "Max available")}:{" "}
                              {formatGrams(selectedSpool.remainingGrams)}
                            </span>
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

                      <div
                        className="mt-3 rounded-2xl border px-4 py-3 text-sm text-slate-600 dark:text-slate-300"
                        style={swatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                      >
                        {t(
                          "inventory.loanTrackingHint",
                          "Returns and weigh-in on return are handled from the Loans page.",
                        )}
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
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppModal>
  );
}
