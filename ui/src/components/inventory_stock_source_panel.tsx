import { SegmentedChoiceRow } from "./segmented_choice_row";
import { inlineStatusSignalClass, neutralChipClass } from "../lib/chip_styles";
import { swatchCssBackground, toSwatchColor } from "../lib/color_utils";
import { useI18n } from "../lib/i18n";
import type {
  BambuFilamentCodeBatch,
  BambuFilamentCodeBatchRow,
  BambuFilamentCodeBatchCreateState,
} from "../lib/bambu_filament_code_batch";
import type { BambuFilamentCodeLookup } from "../lib/bambu_filament_code_lookup";
import { formatMasterDisplayTitle } from "../lib/inventory_list_model";
import { inventoryCatalogRowStyle } from "../lib/inventory_swatch_style";
import type { InventoryCreateMode } from "../lib/inventory_create_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { MasterCatalogRow } from "../lib/tauri_client";

type InventoryStockSourcePanelProps = {
  activeCatalogMasters: MasterCatalogRow[];
  bambuBatchInput: string;
  bambuBatchCreateState: BambuFilamentCodeBatchCreateState;
  bambuCodeBatch: BambuFilamentCodeBatch;
  bambuCodeLookup: BambuFilamentCodeLookup;
  catalogQuery: string;
  createMode: InventoryCreateMode;
  disabledBambuBatchCreate: boolean;
  isCatalogCreateMode: boolean;
  manualColorName: string;
  manualFilamentName: string;
  manualHexColor: string;
  manualMaterial: string;
  manualVendor: string;
  onBambuBatchInputChange: (value: string) => void;
  onCatalogQueryChange: (value: string) => void;
  onCreateBambuCodeBatch: () => void;
  onCreateModeChange: (value: InventoryCreateMode) => void;
  onManualColorNameChange: (value: string) => void;
  onManualFilamentNameChange: (value: string) => void;
  onManualHexColorChange: (value: string) => void;
  onManualMaterialChange: (value: string) => void;
  onManualVendorChange: (value: string) => void;
  onSelectCatalogMaster: (master: MasterCatalogRow) => void;
  onUseManualFromCatalog: () => void;
  resolvedTheme: ResolvedTheme;
  selectedCatalogMasterId: string | null;
  tauriAvailable: boolean;
};

function BambuFilamentCodeLookupHint({
  lookup,
}: {
  lookup: BambuFilamentCodeLookup;
}) {
  const { t } = useI18n();

  const displayMatches =
    lookup.activeMatches.length > 0 ? lookup.activeMatches : lookup.discontinuedMatches;
  const matchPreview = displayMatches
    .slice(0, 3)
    .map((master) => formatMasterDisplayTitle(master))
    .join(", ");
  const remainingCount = Math.max(0, displayMatches.length - 3);

  let message = t(
    "inventory.bambuCodeHelp",
    "Use the five digit code printed as Filament Code on the Bambu box label.",
  );
  if (lookup.status === "no_match") {
    message = t(
      "inventory.bambuCodeNoMatch",
      "No Bambu catalog entry uses this filament code yet.",
    );
  } else if (lookup.status === "single_active") {
    message = t(
      "inventory.bambuCodeSingleMatch",
      "One active Bambu catalog entry matched and is selected.",
    );
  } else if (lookup.status === "multiple_active") {
    message = t(
      "inventory.bambuCodeMultipleMatches",
      "This code is used by several active Bambu catalog entries. Choose the correct row.",
    );
  } else if (lookup.status === "discontinued_only") {
    message = t(
      "inventory.bambuCodeDiscontinuedOnly",
      "Only discontinued Bambu catalog entries use this code.",
    );
  }

  return (
    <div
      className="rounded-2xl border border-slate-200/90 bg-white/72 p-3 text-xs text-slate-600 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700/80 dark:bg-slate-950/45 dark:text-slate-300"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-none text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
          <span className="block text-[9px] uppercase tracking-[0.18em]">
            {t("inventory.bambuCodeLabel", "Filament Code")}
          </span>
          <span className="mt-1 block text-lg font-semibold tracking-normal text-slate-900 dark:text-slate-50">
            {lookup.code ?? "53400"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-800 dark:text-slate-100">{message}</div>
          {matchPreview ? (
            <div className="mt-1 leading-5 text-slate-500 dark:text-slate-400">
              {matchPreview}
              {remainingCount > 0
                ? ` +${remainingCount} ${t("inventory.bambuCodeMoreMatches", "more")}`
                : ""}
            </div>
          ) : (
            <div className="mt-1 leading-5 text-slate-500 dark:text-slate-400">
              {lookup.code
                ? t(
                    "inventory.bambuCodeTryCatalogSearch",
                    "You can still search by material, series, or color name.",
                  )
                : t(
                    "inventory.bambuCodeEnterExample",
                    "Type the code into the search field, for example 53400.",
                  )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function bambuBatchRowStatusLabel(
  row: BambuFilamentCodeBatchRow,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (row.master) {
    return t("inventory.bambuBatchReady", "Ready");
  }
  if (row.lookup.status === "multiple_active") {
    return t("inventory.bambuBatchAmbiguous", "Choose manually");
  }
  if (row.lookup.status === "discontinued_only") {
    return t("common.discontinued", "Discontinued");
  }
  if (row.lookup.status === "no_match") {
    return t("inventory.bambuBatchNoMatch", "No match");
  }
  return t("inventory.bambuBatchNoCode", "No code");
}

function bambuBatchRowPreview(row: BambuFilamentCodeBatchRow): string {
  if (row.master) {
    return formatMasterDisplayTitle(row.master);
  }
  const matches =
    row.lookup.activeMatches.length > 0
      ? row.lookup.activeMatches
      : row.lookup.discontinuedMatches;
  if (matches.length === 0) {
    return row.sourceText;
  }
  const preview = matches
    .slice(0, 2)
    .map((master) => formatMasterDisplayTitle(master))
    .join(", ");
  return matches.length > 2 ? `${preview} +${matches.length - 2}` : preview;
}

function bambuBatchCreateStateMessage(
  state: BambuFilamentCodeBatchCreateState,
  t: ReturnType<typeof useI18n>["t"],
): string | null {
  if (state.totalCount === 0) {
    return null;
  }
  if (state.reason === "borrowed_owner_required") {
    return t(
      "inventory.bambuBatchBorrowedOwnerRequired",
      "Enter who the spools are borrowed from before creating this borrowed-in batch.",
    );
  }
  if (state.reason === "no_ready_rows") {
    return t(
      "inventory.bambuBatchNoneReady",
      "No rows are ready yet. Review ambiguous, discontinued or missing codes manually.",
    );
  }
  if (state.partial) {
    return t(
      "inventory.bambuBatchPartialReady",
      "Only ready rows will be added; review rows are skipped.",
    );
  }
  if (state.readyCount > 0) {
    return t("inventory.bambuBatchAllReady", "All pasted codes are ready.");
  }
  return null;
}

function BambuFilamentCodeBatchPanel({
  batch,
  createState,
  disabledCreate,
  input,
  onCreateBatch,
  onInputChange,
  tauriAvailable,
}: {
  batch: BambuFilamentCodeBatch;
  createState: BambuFilamentCodeBatchCreateState;
  disabledCreate: boolean;
  input: string;
  onCreateBatch: () => void;
  onInputChange: (value: string) => void;
  tauriAvailable: boolean;
}) {
  const { t } = useI18n();
  const visibleRows = batch.rows.slice(0, 6);
  const hiddenCount = Math.max(0, batch.rows.length - visibleRows.length);
  const createMessage = bambuBatchCreateStateMessage(createState, t);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/72 p-3 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700/80 dark:bg-slate-950/45">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {t("inventory.bambuBatchTitle", "Batch Filament Codes")}
          </div>
          <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {t(
              "inventory.bambuBatchHelp",
              "Paste one or more five digit codes. Ready matches use the stock details on the right.",
            )}
          </div>
        </div>
        {batch.rows.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold tabular-nums">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200">
              {batch.creatableRows.length} {t("inventory.bambuBatchReadyShort", "ready")}
            </span>
            {batch.blockedRows.length > 0 ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                {batch.blockedRows.length} {t("inventory.bambuBatchNeedsReview", "review")}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {createMessage ? (
        <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {createMessage}
        </div>
      ) : null}

      <textarea
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        placeholder={t("inventory.bambuBatchPlaceholder", "53400\n53600\n65103")}
        rows={4}
        className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500"
        disabled={!tauriAvailable}
      />

      {batch.rows.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {visibleRows.map((row) => {
            const ready = Boolean(row.master);
            return (
              <div
                key={row.key}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/55"
              >
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {row.code ?? row.sourceText}
                  </div>
                  <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {bambuBatchRowPreview(row)}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                    ready
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                  }`}
                >
                  {bambuBatchRowStatusLabel(row, t)}
                </span>
              </div>
            );
          })}
          {hiddenCount > 0 ? (
            <div className="px-1 text-xs text-slate-500 dark:text-slate-400">
              +{hiddenCount} {t("inventory.bambuBatchMoreRows", "more")}
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className="mt-3 w-full rounded-xl border border-slate-900 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        onClick={onCreateBatch}
        disabled={disabledCreate}
      >
        {t("inventory.bambuBatchAddReady", "Add ready matches")} ·{" "}
        {batch.creatableRows.length}
      </button>
    </div>
  );
}

export function InventoryStockSourcePanel({
  activeCatalogMasters,
  bambuBatchInput,
  bambuBatchCreateState,
  bambuCodeBatch,
  bambuCodeLookup,
  catalogQuery,
  createMode,
  disabledBambuBatchCreate,
  isCatalogCreateMode,
  manualColorName,
  manualFilamentName,
  manualHexColor,
  manualMaterial,
  manualVendor,
  onBambuBatchInputChange,
  onCatalogQueryChange,
  onCreateBambuCodeBatch,
  onCreateModeChange,
  onManualColorNameChange,
  onManualFilamentNameChange,
  onManualHexColorChange,
  onManualMaterialChange,
  onManualVendorChange,
  onSelectCatalogMaster,
  onUseManualFromCatalog,
  resolvedTheme,
  selectedCatalogMasterId,
  tauriAvailable,
}: InventoryStockSourcePanelProps) {
  const { t } = useI18n();

  return (
    <div className="surface-card space-y-4">
      <div className="surface-subtle px-4 py-4">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SegmentedChoiceRow
              className="min-w-0 flex-1"
              label={t("inventory.vendorSource", "Vendor source")}
              labelWidthClassName="min-[920px]:w-32"
              value={createMode}
              onChange={onCreateModeChange}
              options={[
                {
                  value: "bambu",
                  label: t("vendor.bambu", "Bambu"),
                },
                {
                  value: "esun",
                  label: t("vendor.esun", "eSUN"),
                },
                {
                  value: "manual",
                  label: t("vendor.generic", "Generic"),
                },
              ]}
            />
            {isCatalogCreateMode ? (
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                {activeCatalogMasters.length}
              </span>
            ) : null}
          </div>

          {isCatalogCreateMode ? (
            <div className="space-y-2.5">
              <input
                type="search"
                value={catalogQuery}
                onChange={(event) => onCatalogQueryChange(event.target.value)}
                placeholder={
                  createMode === "bambu"
                    ? t("wishlist.searchBambu", "Search Bambu material/color or filament code")
                    : t("wishlist.searchEsun", "Search eSUN material/color")
                }
                className="page-header-search !w-full"
                disabled={!tauriAvailable}
              />
              {createMode === "bambu" ? (
                <>
                  <BambuFilamentCodeLookupHint lookup={bambuCodeLookup} />
                  <BambuFilamentCodeBatchPanel
                    batch={bambuCodeBatch}
                    createState={bambuBatchCreateState}
                    disabledCreate={disabledBambuBatchCreate}
                    input={bambuBatchInput}
                    onCreateBatch={onCreateBambuCodeBatch}
                    onInputChange={onBambuBatchInputChange}
                    tauriAvailable={tauriAvailable}
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {isCatalogCreateMode ? (
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-950/70 lg:max-h-[26rem] lg:overflow-y-auto">
            {activeCatalogMasters.map((master) => {
              const selected = selectedCatalogMasterId === master.id;
              return (
                <button
                  key={master.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectCatalogMaster(master)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] transition ${
                    selected
                      ? "border-slate-900/20 ring-1 ring-slate-900/10 dark:border-slate-400/50 dark:ring-slate-400/20"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-500"
                  }`}
                  style={inventoryCatalogRowStyle(
                    master.hex_color ?? null,
                    selected,
                    resolvedTheme,
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-8 w-8 shrink-0 rounded-md border border-slate-200 dark:border-slate-600"
                      style={{
                        background: swatchCssBackground(master.hex_color),
                      }}
                    />
                    <span className="min-w-0">
                      <span
                        className="block overflow-hidden break-words font-semibold leading-tight text-slate-900 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                        title={formatMasterDisplayTitle(master)}
                      >
                        {formatMasterDisplayTitle(master)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{master.material}</span>
                        <span>{master.default_weight} g</span>
                        {master.is_discontinued ? (
                          <span className={inlineStatusSignalClass("warning", "text-[11px]")}>
                            {t("common.discontinued", "Discontinued")}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </span>

                  {selected ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">
                      ✓ {t("common.selected", "Selected")}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {activeCatalogMasters.length === 0 ? (
              <div className="px-2 py-4 text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "inventory.noCatalogMatches",
                  "No catalog entries match the current vendor filters.",
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900/80"
            onClick={onUseManualFromCatalog}
          >
            {t("wishlist.addMissingFilamentManual", "Missing filament? Add it manually")}
          </button>
        </div>
      ) : null}

      {createMode === "manual" ? (
        <div className="surface-subtle p-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {t("inventory.manualDetails", "Manual details")}
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(
              "inventory.manualDetailsHelp",
              "Use this when a filament is missing from the vendor catalog or you want a fully manual entry.",
            )}
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {["Bambu", "eSUN", "Generic"].map((vendorPreset) => (
                <button
                  key={vendorPreset}
                  type="button"
                  onClick={() => onManualVendorChange(vendorPreset)}
                  className={neutralChipClass(
                    manualVendor.trim().toLowerCase() === vendorPreset.toLowerCase(),
                    "px-3 py-1 text-[11px]",
                  )}
                >
                  {vendorPreset}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={manualVendor}
                onChange={(event) => onManualVendorChange(event.target.value)}
                placeholder={t("wishlist.vendorPlaceholder", "Vendor")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
              <input
                type="text"
                value={manualMaterial}
                onChange={(event) => onManualMaterialChange(event.target.value)}
                placeholder={t("wishlist.materialPlaceholder", "Material")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
              <input
                type="text"
                value={manualFilamentName}
                onChange={(event) => onManualFilamentNameChange(event.target.value)}
                placeholder={t("wishlist.filamentName", "Filament name")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
              <input
                type="text"
                value={manualColorName}
                onChange={(event) => onManualColorNameChange(event.target.value)}
                placeholder={t("wishlist.colorName", "Color name")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualHexColor}
                onChange={(event) => onManualHexColorChange(event.target.value)}
                placeholder={t("wishlist.hexOptional", "Hex color")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-100"
                disabled={!tauriAvailable}
              />
              <input
                type="color"
                value={toSwatchColor(manualHexColor)}
                onChange={(event) => onManualHexColorChange(event.target.value)}
                className="h-10 w-12 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950/80"
                disabled={!tauriAvailable}
              />
              <span
                className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-600"
                style={{ background: swatchCssBackground(manualHexColor) }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
