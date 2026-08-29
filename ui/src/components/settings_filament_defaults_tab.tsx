import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";
import { formatSpoolReference } from "../lib/display_format";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import type { Locale } from "../lib/i18n";
import { formatInventoryStatusLabel } from "../lib/inventory_list_model";
import {
  allFilamentPriceGroups,
  buildFilamentPriceBatchPreview,
  buildFilamentPriceGroups,
  canExplicitlyPriceHistoricalMissingSpool,
  createDefaultFilamentPriceSelection,
  filamentDefaultsSpoolLabel,
  filamentPriceSelectionState,
  filamentPriceSkipPresentation,
  hasFilamentPurchasePrice,
  isFilamentPriceBatchSelectable,
  isFilamentPriceHistorical,
  normalizeFilamentDefaultCurrency,
  parseFilamentGroupPrice,
  reconcileFilamentPriceSelection,
  updateFilamentPriceGroupSelection,
  type FilamentDefaultsSpoolRow,
  type FilamentGroupPriceDefault,
  type FilamentPriceBatchMode,
  type FilamentPriceBatchReceipt,
  type FilamentPriceBatchRequest,
  type FilamentPriceGroup,
  type SaveFilamentGroupPriceDefaultRequest,
} from "../lib/settings_filament_defaults_model";
import {
  settingsActionButtonClass,
  settingsFormControlClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";
import { AppModal } from "./app_modal";
import { toErrorMessage } from "../lib/error_text";
import { SettingsLowStockPanel, type SettingsLowStockPanelProps } from "./settings_low_stock_panel";
import { SettingsNotice, SettingsSurfaceCard } from "./settings_ui";

type TranslateFn = (key: string, fallback?: string, params?: MessageParams) => string;

export type SettingsFilamentDefaultsFocusTarget =
  | "DEFAULT_CURRENCY"
  | "GROUP_PRICING"
  | null;

export type SettingsFilamentDefaultsTabProps = {
  busy: boolean;
  hostUnsupported: boolean;
  locale: Locale;
  readOnly: boolean;
  t: TranslateFn;
  lowStock: Omit<SettingsLowStockPanelProps, "t">;
  defaultCurrency: string;
  persistedGroupPrices: readonly FilamentGroupPriceDefault[];
  settingsValid?: boolean;
  spoolRows: readonly FilamentDefaultsSpoolRow[];
  focusTarget?: SettingsFilamentDefaultsFocusTarget;
  batchReceipt?: FilamentPriceBatchReceipt | null;
  onBatchReceiptChange?: (receipt: FilamentPriceBatchReceipt | null) => void;
  onSaveDefaultCurrency: (currency: string) => Promise<void> | void;
  onSaveGroupPrice: (
    request: SaveFilamentGroupPriceDefaultRequest,
  ) => Promise<void> | void;
  onApplyBatch: (
    request: FilamentPriceBatchRequest,
  ) => Promise<FilamentPriceBatchReceipt> | FilamentPriceBatchReceipt;
  onOpenSpoolDetail: (spoolId: string) => void;
};

type GroupPriceDraft = {
  priceRaw: string;
  currencyRaw: string;
};

type PendingOverwrite = {
  group: FilamentPriceGroup;
  request: FilamentPriceBatchRequest;
};

function setCheckboxIndeterminate(
  input: HTMLInputElement | null,
  indeterminate: boolean,
) {
  if (input) {
    input.indeterminate = indeterminate;
  }
}

function GroupSelectionCheckbox({
  checked,
  disabled,
  indeterminate,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  indeterminate: boolean;
  label: string;
  onChange: (selected: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCheckboxIndeterminate(inputRef.current, indeterminate);
  }, [indeterminate]);

  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
      <input
        ref={inputRef}
        aria-checked={indeterminate ? "mixed" : checked}
        checked={checked}
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function groupWeightLabel(
  group: FilamentPriceGroup,
  locale: Locale,
  t: TranslateFn,
): string {
  return group.nominalWeightG == null
    ? t("settings.filamentDefaultsUnknownWeight", "Unknown nominal weight")
    : `${group.nominalWeightG.toLocaleString(locale)} g`;
}

function localizedGroupLabel(value: string, t: TranslateFn): string {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (["unknown", "unspecified"].includes(normalized)) {
    return t("common.unknown", "Unknown");
  }
  if (["filament", "generic", "manual", "other"].includes(normalized)) {
    return t("vendor.generic", "Generic");
  }
  return value;
}

function receiptReasonLabel(
  reason: string | undefined,
  t: TranslateFn,
): string {
  switch (reason) {
    case "BATCH_LOCKED":
    case "BATCH_PRICE_LOCKED":
      return t("settings.filamentDefaultsReceiptBatchLocked", "Protected from batch pricing");
    case "MANUAL_UPDATE_REQUIRED":
      return t("settings.filamentDefaultsReceiptManual", "Must be updated manually");
    case "BORROWED_IN":
      return t("settings.filamentDefaultsReceiptBorrowed", "Borrowed spool was not changed");
    case "INACTIVE":
      return t("settings.filamentDefaultsReceiptInactive", "Historical spool was not changed");
    case "ALREADY_COMPLETE":
    case "ALREADY_PRICED":
      return t("settings.filamentDefaultsReceiptAlreadyPriced", "Already had a price");
    default:
      return reason || t("settings.filamentDefaultsReceiptSkipped", "Not updated");
  }
}

function GroupSpoolRow({
  disabled,
  row,
  selected,
  t,
  onOpenSpoolDetail,
  onSelectionChange,
}: {
  disabled: boolean;
  row: FilamentDefaultsSpoolRow;
  selected: boolean;
  t: TranslateFn;
  onOpenSpoolDetail: (spoolId: string) => void;
  onSelectionChange: (selected: boolean) => void;
}) {
  const historicalHintId = useId();
  const borrowed = row.ownershipType?.trim().toLocaleUpperCase("en-US").replace(/[\s-]+/g, "_") === "BORROWED_IN";
  const inactive = !borrowed && !isFilamentPriceBatchSelectable(row);
  const priced = hasFilamentPurchasePrice(row.purchasePrice);
  const label = filamentDefaultsSpoolLabel(row);
  const spoolReference = formatSpoolReference(row.spoolId);
  const historicalMissing = inactive && !priced;

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/30 sm:grid-cols-[auto_minmax(10rem,1fr)_auto] sm:items-center">
      <input
        aria-describedby={historicalMissing ? historicalHintId : undefined}
        aria-label={
          historicalMissing
            ? `${t("settings.filamentDefaultsSelectHistoricalSpool", "Set price on historical spool and protect it from later group updates")} · ${label} · ${spoolReference}`
            : `${t("settings.filamentDefaultsSelectSpool", "Select spool")} · ${label} · ${spoolReference}`
        }
        checked={selected}
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onSelectionChange(event.target.checked)}
      />
      <div className="min-w-0">
        <button
          className="block max-w-full truncate text-left text-sm font-semibold text-slate-800 underline-offset-2 hover:underline focus-visible:underline dark:text-slate-100"
          type="button"
          onClick={() => onOpenSpoolDetail(row.spoolId)}
        >
          {label}
        </button>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span>{spoolReference}</span>
          {row.batchPriceLocked ? (
            <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {t("settings.filamentDefaultsBatchLocked", "Batch locked")}
            </span>
          ) : null}
          {borrowed ? (
            <span className="rounded-full border border-slate-300 px-2 py-0.5 font-semibold dark:border-slate-600">
              {t("settings.filamentDefaultsBorrowed", "Borrowed")}
            </span>
          ) : null}
          {inactive ? (
            <span className="rounded-full border border-slate-300 px-2 py-0.5 font-semibold dark:border-slate-600">
              {t("settings.filamentDefaultsHistorical", "Historical")} · {formatInventoryStatusLabel(t, row.status ?? "")}
            </span>
          ) : null}
        </div>
        {historicalMissing ? (
          <span className="sr-only" id={historicalHintId}>
            {t(
              "settings.filamentDefaultsHistoricalSelectionHint",
              "Never selected automatically. It can receive its missing price once and will then remain protected from group updates.",
            )}
          </span>
        ) : null}
      </div>
      <div className="text-left text-xs sm:text-right">
        {priced ? (
          <>
            <div className="font-semibold text-slate-700 dark:text-slate-200">
              {row.purchasePrice} {row.purchaseCurrency || ""}
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              {t("settings.filamentDefaultsCurrentPrice", "Current price")}
            </div>
          </>
        ) : (
          <span className="font-medium text-amber-700 dark:text-amber-200">
            {t("settings.filamentDefaultsMissingPrice", "Missing price")}
          </span>
        )}
      </div>
    </div>
  );
}

function BatchReceiptCard({
  receipt,
  t,
  onClear,
  onOpenSpoolDetail,
}: {
  receipt: FilamentPriceBatchReceipt;
  t: TranslateFn;
  onClear: () => void;
  onOpenSpoolDetail: (spoolId: string) => void;
}) {
  const protectedCount = receipt.updated.filter(
    (entry) => entry.protectedFromBatchPricing,
  ).length;

  return (
    <SettingsSurfaceCard
      className="min-w-0 space-y-4 lg:col-span-2"
      eyebrow={t("settings.filamentDefaultsReceipt", "Latest pricing receipt")}
      description={t(
        "settings.filamentDefaultsReceiptHint",
        "This receipt stays here until you dismiss it or run another price update.",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div aria-atomic="true" aria-live="polite" role="status">
          <SettingsNotice tone={receipt.committed ? "success" : "danger"}>
            {receipt.committed
              ? protectedCount > 0
                ? t(
                    "settings.filamentDefaultsReceiptCommittedProtected",
                    "{updated} updated · {protected} protected from later group updates · {skipped} not updated",
                    {
                      updated: receipt.updated.length,
                      protected: protectedCount,
                      skipped: receipt.skipped.length,
                    },
                  )
                : t(
                  "settings.filamentDefaultsReceiptCommitted",
                  "{updated} updated · {skipped} not updated",
                  {
                    updated: receipt.updated.length,
                    skipped: receipt.skipped.length,
                  },
                )
              : t(
                  "settings.filamentDefaultsReceiptNotCommitted",
                  "The pricing operation was not committed.",
                )}
          </SettingsNotice>
        </div>
        <button
          className={settingsActionButtonClass("neutral", "compact")}
          type="button"
          onClick={onClear}
        >
          {t("settings.filamentDefaultsDismissReceipt", "Dismiss receipt")}
        </button>
      </div>

      {receipt.skipped.length > 0 ? (
        <div className="space-y-2">
          <p className={settingsSectionLabelClass}>
            {t("settings.filamentDefaultsNotUpdated", "Not updated")}
          </p>
          {receipt.skipped.map((entry) => {
            const presentation = filamentPriceSkipPresentation(entry.reason);
            const content = (
              <>
                <span className="font-semibold">{entry.spoolLabel}</span>
                <span className="text-xs font-normal text-slate-600 dark:text-slate-300">
                  {receiptReasonLabel(entry.reason, t)}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </span>
              </>
            );
            return presentation.requiresManualUpdate ? (
              <button
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 outline-none transition hover:bg-amber-100 focus-visible:border-sky-400 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/15"
                key={`${entry.spoolId}:${entry.reason ?? "unknown"}`}
                type="button"
                onClick={() => onOpenSpoolDetail(entry.spoolId)}
              >
                <span className="grid gap-0.5">{content}</span>
                <span aria-hidden="true">→</span>
              </button>
            ) : (
              <div
                className="grid gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-200"
                key={`${entry.spoolId}:${entry.reason ?? "unknown"}`}
              >
                {content}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-200">
          {t(
            "settings.filamentDefaultsReceiptNoSkips",
            "Every selected eligible spool was updated.",
          )}
        </p>
      )}

      {receipt.updated.length > 0 ? (
        <details className="surface-subtle px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t(
              "settings.filamentDefaultsReceiptUpdatedList",
              "{count, plural, one {Show # updated spool} other {Show # updated spools}}",
              { count: receipt.updated.length },
            )}
          </summary>
          <ul className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            {receipt.updated.map((entry) => (
              <li key={entry.spoolId}>
                <button
                  className="grid w-full gap-0.5 rounded-md px-2 py-1 text-left outline-none hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
                  type="button"
                  onClick={() => onOpenSpoolDetail(entry.spoolId)}
                >
                  <span className="font-semibold">{entry.spoolLabel}</span>
                  {entry.protectedFromBatchPricing ? (
                    <span>
                      {t(
                        "settings.filamentDefaultsReceiptPriceSetProtected",
                        "Price set · Protected from later group updates",
                      )}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SettingsSurfaceCard>
  );
}

export function SettingsFilamentDefaultsTab({
  busy,
  hostUnsupported,
  locale,
  readOnly,
  t,
  lowStock,
  defaultCurrency,
  persistedGroupPrices,
  settingsValid = true,
  spoolRows,
  focusTarget = null,
  batchReceipt,
  onBatchReceiptChange,
  onSaveDefaultCurrency,
  onSaveGroupPrice,
  onApplyBatch,
  onOpenSpoolDetail,
}: SettingsFilamentDefaultsTabProps) {
  const categories = useMemo(() => buildFilamentPriceGroups(spoolRows), [spoolRows]);
  const groups = useMemo(() => allFilamentPriceGroups(categories), [categories]);
  const defaultSelectionSignature = useMemo(
    () => JSON.stringify(Array.from(createDefaultFilamentPriceSelection(groups))),
    [groups],
  );
  const persistedByGroup = useMemo(
    () => new Map(persistedGroupPrices.map((item) => [item.groupKey, item])),
    [persistedGroupPrices],
  );
  const currencyInputRef = useRef<HTMLInputElement | null>(null);
  const pricingSectionRef = useRef<HTMLElement | null>(null);
  const visualQaPricingOpen = useMemo(
    () => resolveDesktopVisualQaScenario() === "settings-filament-defaults",
    [],
  );
  const [defaultCurrencyRaw, setDefaultCurrencyRaw] = useState(defaultCurrency);
  const [groupDrafts, setGroupDrafts] = useState<Record<string, GroupPriceDraft>>({});
  const [groupModes, setGroupModes] = useState<Record<string, FilamentPriceBatchMode>>({});
  const [selectedSpoolIds, setSelectedSpoolIds] = useState<Set<string>>(() =>
    new Set(JSON.parse(defaultSelectionSignature) as string[]),
  );
  const [activeMutation, setActiveMutation] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null);
  const [localBatchReceipt, setLocalBatchReceipt] =
    useState<FilamentPriceBatchReceipt | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectionAnnouncement, setSelectionAnnouncement] = useState<string | null>(null);
  const receipt = batchReceipt === undefined ? localBatchReceipt : batchReceipt;

  function setReceipt(next: FilamentPriceBatchReceipt | null) {
    if (batchReceipt === undefined) {
      setLocalBatchReceipt(next);
    }
    onBatchReceiptChange?.(next);
  }

  useEffect(() => {
    setDefaultCurrencyRaw(defaultCurrency);
  }, [defaultCurrency]);

  useEffect(() => {
    setSelectedSpoolIds(new Set(JSON.parse(defaultSelectionSignature) as string[]));
  }, [defaultSelectionSignature]);

  useEffect(() => {
    setSelectedSpoolIds((current) =>
      reconcileFilamentPriceSelection({
        groups,
        groupModes,
        selectedSpoolIds: current,
      }),
    );
  }, [groups, groupModes]);

  useEffect(() => {
    if (focusTarget === "DEFAULT_CURRENCY") {
      currencyInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      currencyInputRef.current?.focus({ preventScroll: true });
    } else if (focusTarget === "GROUP_PRICING") {
      pricingSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      pricingSectionRef.current?.focus({ preventScroll: true });
    }
  }, [focusTarget]);

  useEffect(() => {
    if (!visualQaPricingOpen || categories.length === 0) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      pricingSectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      pricingSectionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [categories.length, visualQaPricingOpen]);

  const normalizedDefaultCurrency = normalizeFilamentDefaultCurrency(defaultCurrencyRaw);
  const disabled = busy || readOnly || activeMutation != null;
  const translateError = (key: string, fallback = "") => t(key, fallback);

  function draftForGroup(group: FilamentPriceGroup): GroupPriceDraft {
    const local = groupDrafts[group.key];
    if (local) {
      return local;
    }
    const persisted = persistedByGroup.get(group.key);
    return {
      priceRaw: persisted == null ? "" : String(persisted.price),
      currencyRaw: persisted?.currency ?? normalizedDefaultCurrency ?? "",
    };
  }

  function updateGroupDraft(group: FilamentPriceGroup, patch: Partial<GroupPriceDraft>) {
    setGroupDrafts((current) => ({
      ...current,
      [group.key]: { ...draftForGroup(group), ...patch },
    }));
  }

  function setSpoolSelected(spoolId: string, selected: boolean) {
    setSelectionAnnouncement(null);
    setSelectedSpoolIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(spoolId);
      } else {
        next.delete(spoolId);
      }
      return next;
    });
  }

  function setGroupMode(group: FilamentPriceGroup, mode: FilamentPriceBatchMode) {
    const nextModes = { ...groupModes, [group.key]: mode };
    const removedHistoricalCount = mode === "OVERWRITE"
      ? group.spoolRows.filter(
          (row) =>
            isFilamentPriceHistorical(row) &&
            selectedSpoolIds.has(row.spoolId),
        ).length
      : 0;
    setGroupModes(nextModes);
    setSelectedSpoolIds((current) =>
      reconcileFilamentPriceSelection({
        groups,
        groupModes: nextModes,
        selectedSpoolIds: current,
      }),
    );
    setSelectionAnnouncement(
      removedHistoricalCount > 0
        ? t(
            "settings.filamentDefaultsHistoricalSelectionRemoved",
            "{count, plural, one {# historical spool was removed from the selection because overwrite cannot change it.} other {# historical spools were removed from the selection because overwrite cannot change them.}}",
            { count: removedHistoricalCount },
          )
        : null,
    );
  }

  async function saveDefaultCurrency() {
    if (!normalizedDefaultCurrency) {
      return;
    }
    setLocalError(null);
    setActiveMutation("default-currency");
    try {
      await onSaveDefaultCurrency(normalizedDefaultCurrency);
    } catch (error) {
      setLocalError(
        toErrorMessage(
          error,
          t(
            "settings.filamentDefaultsSaveCurrencyError",
            "Could not save the default currency.",
          ),
          translateError,
        ),
      );
    } finally {
      setActiveMutation(null);
    }
  }

  async function saveGroupPrice(group: FilamentPriceGroup) {
    const draft = draftForGroup(group);
    const price = parseFilamentGroupPrice(draft.priceRaw);
    const currency = normalizeFilamentDefaultCurrency(draft.currencyRaw);
    if (price == null || !currency) {
      return;
    }
    setLocalError(null);
    setActiveMutation(`save:${group.key}`);
    try {
      await onSaveGroupPrice({ groupKey: group.key, price, currency });
    } catch (error) {
      setLocalError(
        toErrorMessage(
          error,
          t(
            "settings.filamentDefaultsSaveGroupError",
            "Could not save the filament group price.",
          ),
          translateError,
        ),
      );
    } finally {
      setActiveMutation(null);
    }
  }

  function buildRequest(group: FilamentPriceGroup): FilamentPriceBatchRequest | null {
    const draft = draftForGroup(group);
    const price = parseFilamentGroupPrice(draft.priceRaw);
    const currency = normalizeFilamentDefaultCurrency(draft.currencyRaw);
    if (price == null || !currency) {
      return null;
    }
    const mode = groupModes[group.key] ?? "MISSING_ONLY";
    const preview = buildFilamentPriceBatchPreview({
      group,
      mode,
      currency,
      selectedSpoolIds,
    });
    if (
      preview.selectedCount === 0 ||
      (preview.eligibleCount === 0 &&
        preview.lockedCount === 0 &&
        preview.manualUpdateCount === 0)
    ) {
      return null;
    }
    return {
      groupKey: group.key,
      mode,
      price,
      currency,
      spoolIds: preview.selectedSpoolIds,
      historicalMissingPriceSpoolIds:
        preview.historicalMissingPriceSpoolIds,
    };
  }

  async function applyRequest(request: FilamentPriceBatchRequest) {
    setLocalError(null);
    setActiveMutation(`apply:${request.groupKey}`);
    try {
      const result = await onApplyBatch(request);
      setReceipt(result);
      const requestedHistoricalIds = new Set(
        request.historicalMissingPriceSpoolIds,
      );
      const completedHistoricalIds = new Set(
        result.updated
          .filter((entry) => requestedHistoricalIds.has(entry.spoolId))
          .map((entry) => entry.spoolId),
      );
      if (completedHistoricalIds.size > 0) {
        setSelectedSpoolIds((current) => {
          const next = new Set(current);
          for (const spoolId of completedHistoricalIds) {
            next.delete(spoolId);
          }
          return next;
        });
      }
      setPendingOverwrite(null);
    } catch (error) {
      setLocalError(
        toErrorMessage(
          error,
          t(
            "settings.filamentDefaultsApplyError",
            "Could not apply the filament prices.",
          ),
          translateError,
        ),
      );
    } finally {
      setActiveMutation(null);
    }
  }

  function requestBatch(group: FilamentPriceGroup) {
    const request = buildRequest(group);
    if (!request) {
      return;
    }
    if (request.mode === "OVERWRITE") {
      setPendingOverwrite({ group, request });
    } else {
      void applyRequest(request);
    }
  }

  return (
    <>
      {hostUnsupported ? (
        <SettingsNotice className="lg:col-span-2" tone="warning">
          {t(
            "errors.filamentStandardsHostUnsupported",
            "Update the Host before using filament pricing standards.",
          )}
        </SettingsNotice>
      ) : null}
      {!settingsValid ? (
        <SettingsNotice className="lg:col-span-2" tone="warning">
          {readOnly
            ? t(
                "settings.filamentDefaultsSettingsRepairReadOnly",
                "Some saved filament standards were invalid or no longer matched the Host library and have been excluded. Repair them on the Host desktop app.",
              )
            : t(
                "settings.filamentDefaultsSettingsRepair",
                "Some saved filament standards were invalid or no longer matched this library and have been excluded. Saving a valid default repairs the stored settings.",
              )}
        </SettingsNotice>
      ) : null}
      <SettingsSurfaceCard
        className="min-w-0 space-y-4"
        eyebrow={t("settings.filamentDefaultsCurrency", "Default purchase currency")}
        description={t(
          "settings.filamentDefaultsCurrencyHint",
          "Used as the starting currency for new individual prices and filament group defaults. Existing purchase data is not changed automatically.",
        )}
      >
        {readOnly ? (
          <SettingsNotice tone="neutral">
            {t(
              "settings.filamentDefaultsHostOwned",
              "Manage library-wide filament defaults on the Host desktop app.",
            )}
          </SettingsNotice>
        ) : null}
        <div id="settings-filament-default-currency" className="surface-subtle p-3">
          <label className="block max-w-sm text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("settings.filamentDefaultsCurrencyCode", "Three-letter currency code")}
            <input
              ref={currencyInputRef}
              aria-describedby="settings-filament-default-currency-hint"
              autoCapitalize="characters"
              className={`${settingsFormControlClass} mt-1 uppercase`}
              disabled={disabled}
              inputMode="text"
              maxLength={3}
              placeholder={t("settings.filamentDefaultsCurrencyPlaceholder", "NOK")}
              value={defaultCurrencyRaw}
              onChange={(event) => setDefaultCurrencyRaw(event.target.value.toLocaleUpperCase("en-US"))}
            />
          </label>
          <p
            id="settings-filament-default-currency-hint"
            className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400"
          >
            {t(
              "settings.filamentDefaultsCurrencyCodeHint",
              "For example NOK, EUR or USD. Saving this default never rewrites existing spool prices.",
            )}
          </p>
          {defaultCurrencyRaw && !normalizedDefaultCurrency ? (
            <p className="mt-2 text-xs text-rose-700 dark:text-rose-300" role="alert">
              {t(
                "settings.filamentDefaultsCurrencyInvalid",
                "Enter exactly three letters.",
              )}
            </p>
          ) : null}
          <button
            className={`${settingsActionButtonClass("primary")} mt-3`}
            disabled={disabled || !normalizedDefaultCurrency}
            type="button"
            onClick={() => void saveDefaultCurrency()}
          >
            {t("settings.filamentDefaultsSaveCurrency", "Save default currency")}
          </button>
        </div>
      </SettingsSurfaceCard>

      <SettingsLowStockPanel {...lowStock} t={t} />

      {localError ? (
        <SettingsNotice className="lg:col-span-2" tone="danger">
          {localError}
        </SettingsNotice>
      ) : null}

      <SettingsSurfaceCard
        className="min-w-0 space-y-4 lg:col-span-2"
        eyebrow={t("settings.filamentDefaultsGroupPrices", "Filament group prices")}
        description={t(
          "settings.filamentDefaultsGroupPricesHint",
          "Groups are built from vendor, material, filament series and nominal spool weight. Color does not split a price group. No supplier prices are hard-coded.",
        )}
      >
        <section
          ref={pricingSectionRef}
          id="settings-filament-price-groups"
          tabIndex={-1}
          className="space-y-3 outline-none"
        >
          {selectionAnnouncement ? (
            <p
              aria-atomic="true"
              aria-live="polite"
              className="sr-only"
              id="settings-filament-selection-status"
              role="status"
            >
              {selectionAnnouncement}
            </p>
          ) : null}
          {categories.length === 0 ? (
            <div className="surface-subtle border-dashed px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-300">
              {t(
                "settings.filamentDefaultsNoSpools",
                "There are no spools available for group pricing.",
              )}
            </div>
          ) : (
            categories.map((category, categoryIndex) => (
              <details
                className="overflow-hidden rounded-xl border border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-950/25"
                key={category.key}
                open={visualQaPricingOpen ? categoryIndex === 0 : undefined}
              >
                <summary className="cursor-pointer px-4 py-3 outline-none transition hover:bg-slate-50 focus-visible:bg-slate-50 dark:hover:bg-slate-900/55 dark:focus-visible:bg-slate-900/55">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {category.key === "generic"
                        ? t("vendor.generic", "Generic")
                        : category.label}
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t(
                        "settings.filamentDefaultsSpools",
                        "{count, plural, one {# spool} other {# spools}}",
                        { count: category.spoolCount },
                      )} · {t(
                        "settings.filamentDefaultsGroups",
                        "{count, plural, one {# price group} other {# price groups}}",
                        { count: category.groupCount },
                      )}
                    </span>
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-slate-200/80 p-3 dark:border-slate-700/80">
                  {category.groups.map((group, groupIndex) => {
                    const draft = draftForGroup(group);
                    const price = parseFilamentGroupPrice(draft.priceRaw);
                    const currency = normalizeFilamentDefaultCurrency(draft.currencyRaw);
                    const mode = groupModes[group.key] ?? "MISSING_ONLY";
                    const preview = buildFilamentPriceBatchPreview({
                      group,
                      mode,
                      currency,
                      selectedSpoolIds,
                    });
                    const selectableRows = group.spoolRows.filter(
                      isFilamentPriceBatchSelectable,
                    );
                    const selectionState = filamentPriceSelectionState(
                      selectableRows,
                      selectedSpoolIds,
                    );
                    const requestValid =
                      price != null &&
                      currency != null &&
                      preview.selectedCount > 0 &&
                      (preview.eligibleCount > 0 ||
                        preview.lockedCount > 0 ||
                        preview.manualUpdateCount > 0);
                    return (
                      <details
                        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/35"
                        key={group.key}
                        open={visualQaPricingOpen
                          ? categoryIndex === 0 && groupIndex === 0
                          : undefined}
                      >
                        <summary className="cursor-pointer px-4 py-3 outline-none transition hover:bg-white focus-visible:bg-white dark:hover:bg-slate-900/75 dark:focus-visible:bg-slate-900/75">
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {localizedGroupLabel(group.materialLabel, t)} · {localizedGroupLabel(group.filamentLabel, t)}
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                                {groupWeightLabel(group, locale, t)}
                              </span>
                            </span>
                            <span className="flex flex-wrap justify-end gap-1.5 text-[11px] font-semibold">
                              <span className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 dark:border-slate-600 dark:text-slate-300">
                                {t(
                                  "settings.filamentDefaultsSpools",
                                  "{count, plural, one {# spool} other {# spools}}",
                                  { count: group.counts.total },
                                )}
                              </span>
                              {group.counts.missingPrice > 0 ? (
                                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                                  {group.counts.missingPrice} {t("settings.filamentDefaultsWithoutPrice", "without price")}
                                </span>
                              ) : null}
                              {group.counts.missingCurrency > 0 ? (
                                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                                  {group.counts.missingCurrency} {t("settings.filamentDefaultsWithoutCurrency", "without currency")}
                                </span>
                              ) : null}
                              {group.counts.batchLocked > 0 ? (
                                <span className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 dark:border-slate-600 dark:text-slate-300">
                                  {group.counts.batchLocked} {t("settings.filamentDefaultsLocked", "locked")}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </summary>
                        <div className="space-y-4 border-t border-slate-200/80 p-4 dark:border-slate-700/80">
                          <div className="grid gap-3 md:grid-cols-[minmax(8rem,1fr)_minmax(7rem,10rem)_auto] md:items-end">
                            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                              {t("settings.filamentDefaultsGroupPrice", "Price per spool")}
                              <input
                                className={`${settingsFormControlClass} mt-1`}
                                disabled={disabled}
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                type="number"
                                value={draft.priceRaw}
                                onChange={(event) => updateGroupDraft(group, { priceRaw: event.target.value })}
                              />
                            </label>
                            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                              {t("settings.filamentDefaultsCurrencyCodeShort", "Currency")}
                              <input
                                className={`${settingsFormControlClass} mt-1 uppercase`}
                                disabled={disabled}
                                maxLength={3}
                                placeholder={normalizedDefaultCurrency ?? "NOK"}
                                value={draft.currencyRaw}
                                onChange={(event) => updateGroupDraft(group, { currencyRaw: event.target.value.toLocaleUpperCase("en-US") })}
                              />
                            </label>
                            <button
                              className={settingsActionButtonClass("neutral")}
                              disabled={disabled || price == null || currency == null}
                              type="button"
                              onClick={() => void saveGroupPrice(group)}
                            >
                              {t("settings.filamentDefaultsSaveGroupDefault", "Save group default")}
                            </button>
                          </div>

                          <div className="surface-subtle grid gap-3 p-3 sm:grid-cols-2" role="radiogroup" aria-label={t("settings.filamentDefaultsBatchMode", "Pricing mode")}>
                            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                              <input
                                checked={mode === "MISSING_ONLY"}
                                disabled={disabled}
                                name={`price-mode-${group.key}`}
                                type="radio"
                                value="MISSING_ONLY"
                                onChange={() => setGroupMode(group, "MISSING_ONLY")}
                              />
                              <span>
                                <span className="block font-semibold">
                                  {t("settings.filamentDefaultsMissingOnly", "Only missing prices")}
                                </span>
                                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                  {t("settings.filamentDefaultsMissingOnlyHint", "Keeps every existing individual price.")}
                                </span>
                              </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                              <input
                                checked={mode === "OVERWRITE"}
                                disabled={disabled}
                                name={`price-mode-${group.key}`}
                                type="radio"
                                value="OVERWRITE"
                                onChange={() => setGroupMode(group, "OVERWRITE")}
                              />
                              <span>
                                <span className="block font-semibold">
                                  {t("settings.filamentDefaultsOverwrite", "Update selected prices")}
                                </span>
                                <span className="mt-1 block text-xs text-amber-700 dark:text-amber-200">
                                  {t("settings.filamentDefaultsOverwriteHint", "Replaces existing individual prices after a separate confirmation.")}
                                </span>
                              </span>
                            </label>
                          </div>

                          {group.counts.inactive > 0 ? (
                            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {t(
                                "settings.filamentDefaultsHistoricalProtectionHint",
                                "Historical and used-up spools are protected and excluded by default. In Only missing prices, an unpriced historical spool can be selected individually; its protection remains enabled afterward.",
                              )}
                            </p>
                          ) : null}

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <GroupSelectionCheckbox
                              checked={selectionState === "ALL"}
                              disabled={disabled || selectableRows.length === 0}
                              indeterminate={selectionState === "SOME"}
                              label={t(
                                "settings.filamentDefaultsSelectGroup",
                                "{count, plural, one {Select the # eligible spool} other {Select all # eligible spools}}",
                                { count: selectableRows.length },
                              )}
                              onChange={(selected) =>
                                setSelectedSpoolIds((current) =>
                                  updateFilamentPriceGroupSelection({
                                    rows: selectableRows,
                                    selectedSpoolIds: current,
                                    selected,
                                  }),
                                )
                              }
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {t(
                                "settings.filamentDefaultsSelected",
                                "{count, plural, one {# selected} other {# selected}}",
                                { count: preview.selectedCount },
                              )} · {t(
                                "settings.filamentDefaultsWillUpdateCount",
                                "{count, plural, one {# will update} other {# will update}}",
                                { count: preview.eligibleCount },
                              )}
                            </span>
                          </div>

                          <div className="grid gap-2">
                            {group.spoolRows.map((row) => (
                              <GroupSpoolRow
                                disabled={
                                  disabled ||
                                  (!isFilamentPriceBatchSelectable(row) &&
                                    !canExplicitlyPriceHistoricalMissingSpool(row, mode))
                                }
                                key={row.spoolId}
                                row={row}
                                selected={selectedSpoolIds.has(row.spoolId)}
                                t={t}
                                onOpenSpoolDetail={onOpenSpoolDetail}
                                onSelectionChange={(selected) => setSpoolSelected(row.spoolId, selected)}
                              />
                            ))}
                          </div>

                          {mode === "OVERWRITE" && preview.overwriteCount > 0 ? (
                            <SettingsNotice tone="warning">
                              {t(
                                "settings.filamentDefaultsOverwritePreview",
                                "{count, plural, one {# existing price will be replaced} other {# existing prices will be replaced}}, including {manual, plural, one {# individually set price} other {# individually set prices}}.",
                                {
                                  count: preview.overwriteCount,
                                  manual: preview.manualOverwriteCount,
                                },
                              )}
                            </SettingsNotice>
                          ) : null}
                          {preview.lockedCount > 0 ? (
                            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {t(
                                "settings.filamentDefaultsLockedPreview",
                                "{count, plural, one {# selected locked spool will be skipped and listed in the receipt for manual follow-up.} other {# selected locked spools will be skipped and listed in the receipt for manual follow-up.}}",
                                { count: preview.lockedCount },
                              )}
                            </p>
                          ) : null}
                          {preview.historicalMissingPriceCount > 0 ? (
                            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {t(
                                "settings.filamentDefaultsHistoricalMissingPreview",
                                "{count, plural, one {# deliberately selected historical spool will receive its missing price and remain protected from later group updates.} other {# deliberately selected historical spools will receive their missing price and remain protected from later group updates.}}",
                                { count: preview.historicalMissingPriceCount },
                              )}
                            </p>
                          ) : null}
                          {preview.currencyOnlyCount > 0 ? (
                            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {t(
                                "settings.filamentDefaultsCurrencyOnlyPreview",
                                "{count, plural, one {# existing price is kept while its missing currency is filled in.} other {# existing prices are kept while their missing currency is filled in.}}",
                                { count: preview.currencyOnlyCount },
                              )}
                            </p>
                          ) : null}
                          {preview.manualUpdateCount > 0 ? (
                            <SettingsNotice tone="warning">
                              {t(
                                "settings.filamentDefaultsManualPreview",
                                "{count, plural, one {# spool has no price but already uses another currency. It requires manual follow-up and will be listed in the receipt.} other {# spools have no price but already use another currency. They require manual follow-up and will be listed in the receipt.}}",
                                { count: preview.manualUpdateCount },
                              )}
                            </SettingsNotice>
                          ) : null}
                          {preview.borrowedInCount > 0 ? (
                            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {t(
                                "settings.filamentDefaultsBorrowedPreview",
                                "{count, plural, one {# borrowed spool will not be changed.} other {# borrowed spools will not be changed.}}",
                                { count: preview.borrowedInCount },
                              )}
                            </p>
                          ) : null}

                          <button
                            className={settingsActionButtonClass(mode === "OVERWRITE" ? "warning" : "primary")}
                            disabled={disabled || !requestValid}
                            type="button"
                            onClick={() => requestBatch(group)}
                          >
                            {mode === "OVERWRITE"
                              ? t("settings.filamentDefaultsReviewOverwrite", "Review and confirm overwrite")
                              : preview.historicalMissingPriceCount > 0
                                ? t(
                                    "settings.filamentDefaultsApplyMissingAndProtect",
                                    "Set missing prices and protect historical spools",
                                  )
                                : t("settings.filamentDefaultsApplyMissing", "Price spools missing a price")}
                          </button>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            ))
          )}
        </section>
      </SettingsSurfaceCard>

      {receipt ? (
        <BatchReceiptCard
          receipt={receipt}
          t={t}
          onClear={() => setReceipt(null)}
          onOpenSpoolDetail={onOpenSpoolDetail}
        />
      ) : null}

      {pendingOverwrite ? (() => {
        const preview = buildFilamentPriceBatchPreview({
          group: pendingOverwrite.group,
          mode: "OVERWRITE",
          currency: pendingOverwrite.request.currency,
          selectedSpoolIds: new Set(pendingOverwrite.request.spoolIds),
        });
        return (
          <AppModal
            ariaLabel={t("settings.filamentDefaultsConfirmOverwrite", "Confirm price overwrite")}
            closeOnBackdrop
            onBackdropClose={() => setPendingOverwrite(null)}
            panelClassName="app-modal-panel max-h-[calc(100dvh-3rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border p-5"
          >
            <div className="space-y-4">
              <div>
                <div className="section-eyebrow">
                  {t("settings.filamentDefaultsOverwriteReview", "Overwrite review")}
                </div>
                <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
                  {pendingOverwrite.group.materialLabel} · {pendingOverwrite.group.filamentLabel}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {pendingOverwrite.request.price} {pendingOverwrite.request.currency} · {t(
                    "settings.filamentDefaultsSpools",
                    "{count, plural, one {# spool} other {# spools}}",
                    { count: preview.eligibleCount },
                  )}
                </p>
              </div>
              <SettingsNotice tone="warning">
                {t(
                  "settings.filamentDefaultsOverwriteConfirmationWarning",
                  "{count, plural, one {# existing price will be replaced.} other {# existing prices will be replaced.}} {manual, plural, one {# was individually set.} other {# were individually set.}} This does not change the per-spool batch locks.",
                  {
                    count: preview.overwriteCount,
                    manual: preview.manualOverwriteCount,
                  },
                )}
              </SettingsNotice>
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <div className="surface-subtle p-3">
                  <dt className={settingsSectionLabelClass}>
                    {t("settings.filamentDefaultsWillUpdate", "Will update")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {preview.eligibleCount}
                  </dd>
                </div>
                <div className="surface-subtle p-3">
                  <dt className={settingsSectionLabelClass}>
                    {t("settings.filamentDefaultsExistingPrices", "Existing prices")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {preview.overwriteCount}
                  </dd>
                </div>
                <div className="surface-subtle p-3">
                  <dt className={settingsSectionLabelClass}>
                    {t("settings.filamentDefaultsWillSkip", "Will skip")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {preview.lockedCount + preview.borrowedInCount}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  className={settingsActionButtonClass("neutral")}
                  disabled={disabled}
                  type="button"
                  onClick={() => setPendingOverwrite(null)}
                >
                  {t("common.cancel", "Cancel")}
                </button>
                <button
                  className={settingsActionButtonClass("warning")}
                  disabled={disabled}
                  type="button"
                  onClick={() => void applyRequest(pendingOverwrite.request)}
                >
                  {t(
                    "settings.filamentDefaultsConfirmOverwriteAction",
                    "{count, plural, one {Confirm price update for # spool} other {Confirm price update for # spools}}",
                    { count: preview.eligibleCount },
                  )}
                </button>
              </div>
            </div>
          </AppModal>
        );
      })() : null}
    </>
  );
}
