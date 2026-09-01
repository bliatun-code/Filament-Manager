import {
  normalizeSwatchValue,
  suggestHexFromColor,
  toSwatchColor,
} from "../lib/color_utils";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import type { MasterCatalogRow } from "../lib/tauri_client";
import {
  SettingsNotice,
  SettingsSectionBody,
  SettingsSectionControls,
  SettingsSectionEmptyState,
  SettingsSectionHeader,
  SettingsSectionPanel,
} from "./settings_ui";
import {
  chipButtonClass,
  settingsActionButtonClass,
  settingsCompactFormControlClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";
import { InventorySwatchChip } from "./inventory_swatch_chip";
import type { I18nContextValue } from "../lib/i18n";

type SettingsMissingSwatchesPanelProps = {
  busy: boolean;
  catalogRowsAvailable: boolean;
  catalogRowsUnavailable: boolean;
  catalogRefreshBusy: boolean;
  confirmBulkSwatch: boolean;
  missingSwatchCount: number;
  swatchBusy: boolean;
  swatchDraftById: Record<string, string>;
  swatchVendorFilter: string;
  swatchVendorOptions: string[];
  tauri: boolean;
  t: I18nContextValue["t"];
  visibleMissingSwatchMasters: MasterCatalogRow[];
  visibleMissingSwatchVendorCount: number;
  onBulkAutoFill: () => void;
  onCancelBulkAutoFill: () => void;
  onRefresh: () => void;
  onSaveMissingSwatch: (master: MasterCatalogRow) => void;
  onSwatchDraftChange: (masterId: string, value: string) => void;
  onVendorFilterChange: (vendor: string) => void;
};

export function SettingsMissingSwatchesPanel({
  busy,
  catalogRowsAvailable,
  catalogRowsUnavailable,
  catalogRefreshBusy,
  confirmBulkSwatch,
  missingSwatchCount,
  swatchBusy,
  swatchDraftById,
  swatchVendorFilter,
  swatchVendorOptions,
  tauri,
  t,
  visibleMissingSwatchMasters,
  visibleMissingSwatchVendorCount,
  onBulkAutoFill,
  onCancelBulkAutoFill,
  onRefresh,
  onSaveMissingSwatch,
  onSwatchDraftChange,
  onVendorFilterChange,
}: SettingsMissingSwatchesPanelProps) {
  const disabled = !tauri || busy || swatchBusy || catalogRefreshBusy;
  const mutationDisabled = disabled || !catalogRowsAvailable;

  return (
    <SettingsSectionPanel className="mt-6">
      <SettingsSectionHeader
        eyebrow={t("settings.swatchQuality", "Swatch quality")}
        description={t(
          "settings.swatchQualityHelp",
          "Review missing swatches here, then save manual fixes or fill the visible list in bulk.",
        )}
        status={
          <div className={inlineStatusSignalClass("warning", "text-sm")}>
            {t("settings.missingSwatches", "Missing swatches")}: {catalogRowsAvailable ? missingSwatchCount : "—"}
          </div>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
          <span>
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              {catalogRowsAvailable ? visibleMissingSwatchMasters.length : "—"}
            </strong>{" "}
            {t("settings.visibleMissing", "Visible missing")}
          </span>
          <span>
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              {catalogRowsAvailable ? visibleMissingSwatchVendorCount : "—"}
            </strong>{" "}
            {visibleMissingSwatchVendorCount === 1
              ? t("inventory.vendorGroup", "Vendor")
              : t("settings.vendors", "Vendors")}
          </span>
        </div>
      </SettingsSectionHeader>

      <SettingsSectionBody>
        <SettingsSectionControls>
          <div
            role="group"
            aria-label={t("settings.swatchVendorFilter", "Filter by vendor")}
          >
            <div className={settingsSectionLabelClass}>
              {t("settings.swatchVendorFilter", "Filter by vendor")}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
            {swatchVendorOptions.map((vendor) => (
              <button
                key={vendor}
                type="button"
                aria-pressed={swatchVendorFilter === vendor}
                onClick={() => onVendorFilterChange(vendor)}
                className={chipButtonClass(swatchVendorFilter === vendor)}
              >
                {vendor === "ALL" ? t("common.all", "All") : vendor}
              </button>
            ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={settingsActionButtonClass()}
              onClick={onRefresh}
              disabled={disabled}
            >
              {t("common.refresh", "Refresh")}
            </button>
            {confirmBulkSwatch ? (
              <>
                <button
                  type="button"
                  className={settingsActionButtonClass("accent")}
                  onClick={onBulkAutoFill}
                  disabled={mutationDisabled}
                >
                  {swatchBusy
                    ? t("settings.updatingSwatches", "Updating swatches...")
                    : t("settings.confirmBulkSwatchAction", "Confirm auto-fill")}
                </button>
                <button
                  type="button"
                  className={settingsActionButtonClass("neutral")}
                  onClick={onCancelBulkAutoFill}
                  disabled={disabled}
                >
                  {t("common.cancel", "Cancel")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={settingsActionButtonClass("accent")}
                onClick={onBulkAutoFill}
                disabled={mutationDisabled || visibleMissingSwatchMasters.length === 0}
              >
                {swatchBusy
                  ? t("settings.updatingSwatches", "Updating swatches...")
                  : t("settings.autofillVisibleSwatches", "Auto-fill visible missing swatches")}
              </button>
            )}
          </div>
          {confirmBulkSwatch ? (
            <SettingsNotice className="mt-3" tone="warning">
              {t(
                "settings.confirmBulkSwatchVisible",
                "Apply suggested colors to {count} visible entries?",
                { count: visibleMissingSwatchMasters.length },
              )}
            </SettingsNotice>
          ) : null}
        </SettingsSectionControls>

        {!catalogRowsAvailable ? (
          <SettingsSectionEmptyState>
            {catalogRowsUnavailable
              ? t("errors.unavailable", "The service is temporarily unavailable.")
              : t("common.loading", "Loading...")}
          </SettingsSectionEmptyState>
        ) : visibleMissingSwatchMasters.length === 0 ? (
          <SettingsSectionEmptyState>
            {t("settings.noMissingSwatches", "No missing swatches to fill.")}
          </SettingsSectionEmptyState>
        ) : (
          <div
            role="region"
            aria-label={t("settings.missingSwatches", "Missing swatches")}
            tabIndex={0}
            className="mt-4 max-h-[460px] space-y-3 overflow-auto pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            {visibleMissingSwatchMasters.map((master, index) => {
              const draftHex = swatchDraftById[master.id] ?? suggestHexFromColor(master);
              const suggestedHex = suggestHexFromColor(master);
              const normalizedDraft = normalizeSwatchValue(draftHex, { uppercase: true });
              const previewValue = normalizedDraft ?? suggestedHex;
              const draftInvalid = normalizedDraft == null;
              const displayTitle = formatFilamentDisplayTitle(
                master.material,
                master.filament_name,
                master.color_name,
              );
              const valueInputId = `missing-swatch-value-${index}`;
              const pickerInputId = `missing-swatch-picker-${index}`;
              const valueHintId = `missing-swatch-value-hint-${index}`;
              const suggested = normalizedDraft === suggestedHex;

              return (
                <div
                  key={master.id}
                  className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <InventorySwatchChip
                        className="mt-0.5 h-11 w-11 rounded-lg"
                        swatchColor={previewValue}
                        title={previewValue}
                        tone="soft"
                      />
                      <div className="min-w-0">
                        <div
                          className="break-words text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100"
                          title={displayTitle}
                        >
                          {displayTitle}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                          {master.vendor} / ID: {master.id}
                        </div>
                        <div
                          className={`mt-2 ${inlineStatusSignalClass(
                            draftInvalid ? "danger" : "warning",
                            "text-[11px]",
                          )}`}
                        >
                          {draftInvalid
                            ? t("settings.swatchInvalid", "Invalid value")
                            : suggested
                              ? t("settings.swatchSuggestedUnsaved", "Suggested · not saved")
                              : t("settings.swatchEditedUnsaved", "Edited · not saved")}
                        </div>
                      </div>
                    </div>

                    <div className="grid w-full gap-2 sm:grid-cols-[minmax(180px,240px)_56px_max-content] sm:items-start md:w-auto">
                      <label htmlFor={valueInputId} className="block">
                        <span className={settingsSectionLabelClass}>
                          {t("settings.swatchValue", "Swatch value")}
                        </span>
                        <input
                          id={valueInputId}
                          type="text"
                          value={draftHex}
                          aria-invalid={draftInvalid}
                          aria-describedby={draftInvalid ? valueHintId : undefined}
                          onChange={(event) => onSwatchDraftChange(master.id, event.target.value)}
                          className={`mt-2 ${settingsCompactFormControlClass}`}
                          placeholder="#RRGGBB / gradient(...) / multi(...)"
                          disabled={mutationDisabled}
                        />
                        {draftInvalid ? (
                          <span
                            id={valueHintId}
                            className="mt-1 block max-w-60 text-[11px] leading-4 text-rose-600 dark:text-rose-300"
                          >
                            {t(
                              "settings.swatchInvalidHint",
                              "Use #RGB, #RRGGBB, gradient(...), or multi(...).",
                            )}
                          </span>
                        ) : null}
                      </label>
                      <label htmlFor={pickerInputId} className="block">
                        <span className={settingsSectionLabelClass}>
                          {t("settings.swatchColorPicker", "Picker")}
                        </span>
                        <input
                          id={pickerInputId}
                          type="color"
                          value={toSwatchColor(previewValue)}
                          onChange={(event) => onSwatchDraftChange(master.id, event.target.value)}
                          className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-600 dark:bg-slate-900/70"
                          disabled={mutationDisabled}
                        />
                      </label>
                      <div className="sm:pt-[26px]">
                        <button
                          type="button"
                          aria-label={`${t("common.save", "Save")}: ${displayTitle}`}
                          className={settingsActionButtonClass()}
                          onClick={() => onSaveMissingSwatch(master)}
                          disabled={mutationDisabled || draftInvalid}
                        >
                          {t("common.save", "Save")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingsSectionBody>
    </SettingsSectionPanel>
  );
}
