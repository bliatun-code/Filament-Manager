import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { toErrorMessage } from "../lib/error_text";
import { openExportedLabelFile, type FilamentLabelExportResult } from "../lib/tauri_label_file_client";
import {
  FILAMENT_LABEL_DIMENSION_STEP_MM,
  FILAMENT_LABEL_MAX_HEIGHT_MM,
  FILAMENT_LABEL_MAX_WIDTH_MM,
  FILAMENT_LABEL_MIN_HEIGHT_MM,
  FILAMENT_LABEL_MIN_WIDTH_MM,
  FILAMENT_LABEL_PROFILES,
  filamentLabelSize,
  validateFilamentLabelDimensions,
  type FilamentLabelSize,
  type FilamentLabelSizeSelectionId,
} from "../lib/filament_label_profiles";
import {
  readFilamentLabelPreferences,
  writeFilamentLabelPreferences,
  type FilamentLabelPreferences,
} from "../lib/filament_label_preferences";
import type { InventorySpool } from "../lib/inventory_list_model";
import {
  inventoryDetailActionButtonClassName,
  inventoryDetailEyebrowClassName,
  inventoryDetailFormControlClassName,
} from "./inventory_detail_panel_class";
import { InventoryDetailTintPanel } from "./inventory_detail_fact_card";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import { AppModal } from "./app_modal";
import { ModalHeader, ModalNotice } from "./modal_chrome";

type InventorySpoolQrRfidPanelProps = {
  authorityKey?: string | null;
  companionAvailable: boolean;
  dataUrl: string | null;
  deterministicLabelPreferences?: boolean;
  loading: boolean;
  initialLabelPanelOpen?: boolean;
  labelPanelRequestId?: number;
  onRetryQr?: () => void;
  onPrintLabel: (labelSize: FilamentLabelSize, pngDataUrl: string) => Promise<FilamentLabelExportResult | void>;
  onStartRfidCapture: () => void;
  resolvedTheme: ResolvedTheme;
  runtimeAvailable: boolean;
  spoolHexColor?: string | null;
  spool: InventorySpool;
  supportsRfidCapture: boolean;
  target: string | null;
  showRfidControls?: boolean;
  compact?: boolean;
};

const qrRfidInfoBoxClassName =
  "app-modal-inset-soft rounded-lg border px-3 py-2 text-xs";

function parseCustomDimensionDraft(value: string): number {
  return value.trim() ? Number(value) : Number.NaN;
}

export function InventorySpoolQrRfidPanel({
  authorityKey = null,
  companionAvailable,
  dataUrl,
  deterministicLabelPreferences = false,
  loading,
  initialLabelPanelOpen = false,
  labelPanelRequestId = 0,
  onRetryQr,
  onPrintLabel,
  onStartRfidCapture,
  resolvedTheme,
  runtimeAvailable,
  spoolHexColor,
  spool,
  supportsRfidCapture,
  target,
  showRfidControls = true,
  compact = false,
}: InventorySpoolQrRfidPanelProps) {
  const { t } = useI18n();
  const [labelPanelOpen, setLabelPanelOpen] = useState(initialLabelPanelOpen);
  const [labelPreferences, setLabelPreferences] = useState<FilamentLabelPreferences>(() =>
    readFilamentLabelPreferences({ deterministic: deterministicLabelPreferences }),
  );
  const [customWidthDraft, setCustomWidthDraft] = useState(() =>
    String(labelPreferences.customWidthMm),
  );
  const [customHeightDraft, setCustomHeightDraft] = useState(() =>
    String(labelPreferences.customHeightMm),
  );
  const [labelPreview, setLabelPreview] = useState<{
    pngDataUrl: string;
    renderKey: string;
  } | null>(null);
  const [labelPreviewBusy, setLabelPreviewBusy] = useState(false);
  const [labelPreviewFailed, setLabelPreviewFailed] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [openingSavedFile, setOpeningSavedFile] = useState(false);
  const [openSavedFileError, setOpenSavedFileError] = useState<{ scope: object; message: string } | null>(null);
  const [labelExportBusy, setLabelExportBusy] = useState(false);
  const [labelExportFeedback, setLabelExportFeedback] = useState<(FilamentLabelExportResult & { scope: object }) | null>(null);
  const handledLabelPanelRequestRef = useRef(labelPanelRequestId);

  const customDimensions = useMemo(
    () => ({
      widthMm: parseCustomDimensionDraft(customWidthDraft),
      heightMm: parseCustomDimensionDraft(customHeightDraft),
    }),
    [customHeightDraft, customWidthDraft],
  );
  const customValidation = useMemo(
    () => validateFilamentLabelDimensions(customDimensions),
    [customDimensions],
  );
  const labelSize = useMemo(() => {
    if (labelPreferences.selectedSize !== "custom") {
      return filamentLabelSize(labelPreferences.selectedSize);
    }
    if (!customValidation.valid) {
      return null;
    }
    return filamentLabelSize("custom", customValidation.dimensions);
  }, [customValidation, labelPreferences.selectedSize]);
  const labelRenderKey = useMemo(() => {
    if (!dataUrl || !target || !labelSize) {
      return null;
    }
    return JSON.stringify([
      authorityKey,
      labelSize.selectionId,
      labelSize.widthMm,
      labelSize.heightMm,
      dataUrl,
      target,
      spool.vendor,
      spool.material,
      spool.filamentName,
      spool.colorName,
      spool.id,
    ]);
  }, [
    authorityKey,
    dataUrl,
    labelSize,
    spool.colorName,
    spool.filamentName,
    spool.id,
    spool.material,
    spool.vendor,
    target,
  ]);
  const currentLabelPreview =
    labelPreview?.renderKey === labelRenderKey ? labelPreview.pngDataUrl : null;
  const scope = useMemo(() => ({ renderKey: labelRenderKey, open: labelPanelOpen }), [labelRenderKey, labelPanelOpen]);
  const currentScope = useRef<object | null>(null);
  const activeExport = useRef<object | null>(null);
  const activeOpen = useRef<object | null>(null);
  const savedExport = useRef<typeof labelExportFeedback>(null);
  useLayoutEffect(() => {
    currentScope.current = scope;
    savedExport.current = null;
    setLabelExportBusy(false);
    setOpeningSavedFile(false);
    return () => { currentScope.current = null; };
  }, [scope]);
  const closeLabelPanel = () => {
    savedExport.current = null;
    setLabelPanelOpen(false);
    setLabelExportFeedback(null);
    setOpenSavedFileError(null);
  };
  const customValidationMessage = !customValidation.valid
    ? customValidation.code === "width-too-small-for-height"
      ? t(
          "inventory.labelCustomSizeShapeError",
          "Use landscape format: width must be at least 20 mm greater than height and at least 1.6 × the height.",
        )
      : t(
          "inventory.labelCustomSizeRangeError",
          "Width must be 45–150 mm and height 24–80 mm, in 0.5 mm steps.",
        )
    : null;
  const customWidthInvalid =
    !customValidation.valid && customValidation.code.startsWith("width");
  const customHeightInvalid =
    !customValidation.valid && customValidation.code.startsWith("height");

  useEffect(() => {
    if (initialLabelPanelOpen) {
      setLabelPanelOpen(true);
    }
  }, [initialLabelPanelOpen]);

  useEffect(() => {
    if (labelPanelRequestId > handledLabelPanelRequestRef.current) {
      handledLabelPanelRequestRef.current = labelPanelRequestId;
      setLabelPanelOpen(true);
    }
  }, [labelPanelRequestId]);

  useEffect(() => {
    if (labelPreferences.selectedSize !== "custom" || !customValidation.valid) {
      return;
    }
    const { widthMm, heightMm } = customValidation.dimensions;
    setLabelPreferences((current) => {
      if (current.customWidthMm === widthMm && current.customHeightMm === heightMm) {
        return current;
      }
      const next = { ...current, customWidthMm: widthMm, customHeightMm: heightMm };
      writeFilamentLabelPreferences(next, {
        deterministic: deterministicLabelPreferences,
      });
      return next;
    });
  }, [
    customValidation,
    deterministicLabelPreferences,
    labelPreferences.selectedSize,
  ]);

  useEffect(() => {
    if (!labelPanelOpen || !dataUrl || !target || !labelSize || !labelRenderKey) {
      setLabelPreview(null);
      setLabelPreviewBusy(false);
      setLabelPreviewFailed(null);
      return;
    }
    let active = true;
    setLabelPreviewBusy(true);
    setLabelPreviewFailed(null);
    setLabelPreview(null);
    const timer = window.setTimeout(() => {
      void Promise.all([
        import("../lib/filament_label_print"),
        import("../lib/filament_qr_branding"),
      ])
        .then(async ([{ buildFilamentLabelPngDataUrl }, { buildBrandedFilamentQrDataUrl }]) => {
          const qrDataUrl = await buildBrandedFilamentQrDataUrl(target, "monochrome");
          return buildFilamentLabelPngDataUrl(
            {
              vendor: spool.vendor,
              material: spool.material,
              filamentName: spool.filamentName,
              colorName: spool.colorName,
              reference: spool.id,
              qrDataUrl,
            },
            labelSize,
          );
        })
        .then((preview) => {
          if (active) {
            setLabelPreview({ pngDataUrl: preview, renderKey: labelRenderKey });
          }
        })
        .catch((error) => {
          console.error(error);
          if (active) setLabelPreviewFailed(labelRenderKey);
        })
        .finally(() => {
          if (active) {
            setLabelPreviewBusy(false);
          }
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    dataUrl,
    labelPanelOpen,
    labelRenderKey,
    previewAttempt,
    labelSize,
    spool.colorName,
    spool.filamentName,
    spool.id,
    spool.material,
    spool.vendor,
    target,
  ]);

  const selectLabelSize = (selectedSize: FilamentLabelSizeSelectionId) => {
    setLabelPreferences((current) => {
      if (current.selectedSize === selectedSize) {
        return current;
      }
      const next = { ...current, selectedSize };
      writeFilamentLabelPreferences(next, {
        deterministic: deterministicLabelPreferences,
      });
      return next;
    });
  };

  const exportLabel = async () => {
    if (!currentLabelPreview || !labelSize || !labelRenderKey || labelExportBusy || currentScope.current !== scope || activeExport.current === scope) {
      return;
    }
    activeExport.current = scope;
    savedExport.current = null;
    setLabelExportBusy(true);
    setLabelExportFeedback(null);
    setOpenSavedFileError(null);
    try {
      const result = await onPrintLabel(labelSize, currentLabelPreview);
      if (result && currentScope.current === scope) {
        const feedback = { ...result, scope };
        savedExport.current = feedback;
        setLabelExportFeedback(feedback);
      }
    } catch (error) {
      if (currentScope.current === scope) setLabelExportFeedback({ scope, success: false, message: toErrorMessage(error, t("inventory.error.printLabel", "Failed to generate label."), t) });
    } finally {
      if (activeExport.current === scope) activeExport.current = null;
      if (currentScope.current === scope) setLabelExportBusy(false);
    }
  };

  const openSavedLabel = async () => {
    if (!runtimeAvailable || !labelExportFeedback?.success || !labelExportFeedback.exportedPath || labelExportFeedback.scope !== scope || currentScope.current !== scope || savedExport.current !== labelExportFeedback || activeOpen.current === scope || activeExport.current === scope) return;
    activeOpen.current = scope;
    setOpeningSavedFile(true);
    setOpenSavedFileError(null);
    try {
      await openExportedLabelFile(labelExportFeedback.exportedPath);
    } catch (error) {
      if (currentScope.current === scope) setOpenSavedFileError({ scope, message: toErrorMessage(error, t("errors.savedLabelFileOpenFailed", "The saved label file could not be opened. Open it from Downloads, or save it again."), t) });
    } finally {
      if (activeOpen.current === scope) activeOpen.current = null;
      if (currentScope.current === scope) setOpeningSavedFile(false);
    }
  };

  const qrContent = (<>
      <div className={inventoryDetailEyebrowClassName}>
        {t("inventory.qrLabel", "QR")}
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {t("inventory.qrCompanionLinkLabel", "Companion link")}
        </div>
      </div>
      {dataUrl ? (
        <div className="mt-3 flex justify-center">
          <img
            src={dataUrl}
            alt={t("inventory.qrCode", "QR code")}
            className="h-36 w-36 rounded-lg border border-slate-200 bg-white object-contain p-0.5 dark:border-slate-700"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      ) : (
        <div className={`mt-3 text-slate-500 dark:text-slate-400 ${qrRfidInfoBoxClassName}`}>
          {loading
            ? t("common.loading", "Loading...")
            : t(
                "inventory.qrCompanionUnavailable",
                "Companion link is unavailable right now. Start the Trusted-LAN companion on the active host to build a direct browser link.",
              )}
          {!loading && runtimeAvailable && onRetryQr ? (
            <button type="button" className={`${inventoryDetailActionButtonClassName} mt-2`} onClick={onRetryQr}>
              {t("inventory.labelRetryPreview", "Try preview again")}
            </button>
          ) : null}
        </div>
      )}
      {target ? (
        <div className={`mt-3 text-slate-600 dark:text-slate-300 ${qrRfidInfoBoxClassName}`}>
          <div className="font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t("inventory.qrTarget", "QR target")}
          </div>
          <div className="mt-1 break-all font-mono text-[11px] leading-relaxed">
            {target}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {t(
              "inventory.qrTargetCompanionHint",
              "This QR opens the browser companion directly as long as the target URL is still reachable.",
            )}
          </div>
        </div>
      ) : null}
      <div className="mt-3">
        <button
          type="button"
          className={inventoryDetailActionButtonClassName}
          onClick={() => labelPanelOpen ? closeLabelPanel() : setLabelPanelOpen(true)}
          disabled={!runtimeAvailable || !companionAvailable || !dataUrl || !target}
        >
          {t("inventory.printQr", "Create QR label")}
        </button>
      </div>
      <div className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {t(
          "inventory.labelSheetInventoryHint",
          "Need labels for several rolls? Choose “Select multiple” in Inventory, or create a label sheet for all stock from the header.",
        )}
      </div>

  </>);

  return (
    <InventoryDetailTintPanel
      className={compact ? "inventory-balanced-qr" : "p-4"}
      style={compact ? undefined : inventorySwatchInsetStyle(spoolHexColor, resolvedTheme)}
    >
      {compact ? <details className="inventory-balanced-disclosure">
        <summary className="app-control-focus">{t("inventory.qrLabel", "QR")} · {t("inventory.printLabelAction", "Print label")}</summary>
        <div className="pt-3">{qrContent}</div>
      </details> : qrContent}
      {labelPanelOpen ? (
        <AppModal
          zIndex={80}
          onBackdropClose={closeLabelPanel}
          panelClassName="app-modal-panel flex max-h-[calc(100dvh-3rem)] w-[min(92vw,58rem)] flex-col overflow-hidden rounded-2xl border"
        >
          <ModalHeader
            eyebrow={t("inventory.qrLabel", "QR label")}
            title={t("inventory.labelBuilderTitle", "Create label image")}
            subtitle={t(
              "inventory.labelBuilderSubtitle",
              "Choose a physical size, check the preview, and save a print-ready PNG.",
            )}
            closeLabel={t("common.close", "Close")}
            onClose={closeLabelPanel}
          />
          <div id="inventory-label-builder" className="grid min-h-0 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
            <div className="app-modal-inset flex min-h-64 items-center rounded-xl border p-5">
              {currentLabelPreview ? (
                <img
                  src={currentLabelPreview}
                  alt={t("inventory.labelPreview", "Label preview")}
                  className="mx-auto max-h-[22rem] max-w-full bg-white object-contain shadow-lg"
                />
              ) : (
                <div className="flex w-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-500">
                  {customValidationMessage && labelPreferences.selectedSize === "custom"
                    ? customValidationMessage
                    : labelPreviewBusy
                    ? t("inventory.labelRendering", "Rendering label...")
                    : labelPreviewFailed === labelRenderKey
                    ? t("inventory.labelPreviewFailed", "Could not prepare the label preview. Try again.")
                    : t("inventory.labelPreviewUnavailable", "Label preview unavailable")}
                  {labelPreviewFailed === labelRenderKey && labelRenderKey && labelSize ? (
                    <button type="button" className={inventoryDetailActionButtonClassName}
                      onClick={() => { setLabelPreviewBusy(true); setLabelPreviewFailed(null); setPreviewAttempt((attempt) => attempt + 1); }}>
                      {t("inventory.labelRetryPreview", "Try preview again")}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {t("inventory.labelSize", "Label size")}
              </div>
              <div
                className="mt-2 grid grid-cols-2 gap-2"
                role="group"
                aria-label={t("inventory.labelSize", "Label size")}
              >
                {FILAMENT_LABEL_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={labelPreferences.selectedSize === profile.id}
                    className={`app-control-focus rounded-lg border px-3 py-2.5 text-left text-sm outline-none transition ${
                      labelPreferences.selectedSize === profile.id
                        ? "app-modal-selected-control"
                        : "app-soft-control"
                    }`}
                    onClick={() => selectLabelSize(profile.id)}
                  >
                    <span className="block font-semibold">
                      {t(`inventory.labelProfile.${profile.id}`, profile.title)}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {profile.widthMm} × {profile.heightMm} mm
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={labelPreferences.selectedSize === "custom"}
                  className={`app-control-focus rounded-lg border px-3 py-2.5 text-left text-sm outline-none transition ${
                    labelPreferences.selectedSize === "custom"
                      ? "app-modal-selected-control"
                      : "app-soft-control"
                  }`}
                  onClick={() => selectLabelSize("custom")}
                >
                  <span className="block font-semibold">
                    {t("inventory.labelProfile.custom", "Custom")}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {labelPreferences.customWidthMm} × {labelPreferences.customHeightMm} mm
                  </span>
                </button>
              </div>
              {labelPreferences.selectedSize === "custom" ? (
                <div
                  className="app-modal-inset mt-3 rounded-xl border p-3"
                  role="group"
                  aria-label={t("inventory.labelProfile.custom", "Custom")}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span>{t("inventory.labelCustomWidth", "Width")}</span>
                      <span className="font-normal text-slate-500">{" "}mm</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={FILAMENT_LABEL_MIN_WIDTH_MM}
                        max={FILAMENT_LABEL_MAX_WIDTH_MM}
                        step={FILAMENT_LABEL_DIMENSION_STEP_MM}
                        value={customWidthDraft}
                        aria-invalid={customWidthInvalid}
                        aria-describedby="filament-label-custom-size-message"
                        className={`mt-1.5 w-full ${inventoryDetailFormControlClassName}`}
                        onChange={(event) => setCustomWidthDraft(event.currentTarget.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span>{t("inventory.labelCustomHeight", "Height")}</span>
                      <span className="font-normal text-slate-500">{" "}mm</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={FILAMENT_LABEL_MIN_HEIGHT_MM}
                        max={FILAMENT_LABEL_MAX_HEIGHT_MM}
                        step={FILAMENT_LABEL_DIMENSION_STEP_MM}
                        value={customHeightDraft}
                        aria-invalid={customHeightInvalid}
                        aria-describedby="filament-label-custom-size-message"
                        className={`mt-1.5 w-full ${inventoryDetailFormControlClassName}`}
                        onChange={(event) => setCustomHeightDraft(event.currentTarget.value)}
                      />
                    </label>
                  </div>
                  <div
                    id="filament-label-custom-size-message"
                    className={`mt-2 text-xs leading-5 ${
                      customValidationMessage
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                    role={customValidationMessage ? "alert" : undefined}
                  >
                    {customValidationMessage ??
                      t(
                        "inventory.labelCustomSizeHint",
                        "Landscape · width 45–150 mm · height 24–80 mm · 0.5 mm steps.",
                      )}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {labelPreferences.selectedSize === "ptouch-24"
                  ? t(
                      "inventory.labelPtouchHint",
                      "Designed for 24 mm tape with a full-height QR and readable text.",
                    )
                  : t(
                      "inventory.labelImageHint",
                      "The PNG is rendered at 300 DPI for predictable physical sizing.",
                    )}
              </div>
              <div className="app-modal-inset mt-3 rounded-lg border px-3 py-2.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {t(
                  "inventory.labelSheetInventoryHint",
                  "Need labels for several rolls? Choose “Select multiple” in Inventory, or create a label sheet for all stock from the header.",
                )}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {t("inventory.labelPrintActualSize", "Print at 100% or Actual size, with page fitting turned off. Match the selected label or paper size in your print settings.")}
              </p>
              <button
                type="button"
                className={`mt-4 w-full ${inventoryDetailActionButtonClassName}`}
                onClick={() => void exportLabel()}
                disabled={
                  !labelSize || !currentLabelPreview || labelPreviewBusy || labelExportBusy
                }
              >
                {labelExportBusy
                  ? t("inventory.labelSaving", "Saving PNG...")
                  : t("inventory.labelSaveDownloads", "Save PNG to Downloads")}
              </button>
              {labelExportFeedback && labelExportFeedback.scope === scope ? (
                <ModalNotice className="mt-3" tone={labelExportFeedback.success ? "success" : "danger"} role={labelExportFeedback.success ? "status" : "alert"}>
                  {labelExportFeedback.message}
                </ModalNotice>
              ) : null}
              {labelExportFeedback?.success && labelExportFeedback.scope === scope && labelExportFeedback.exportedPath ? (
                <button type="button" className={`mt-3 w-full ${inventoryDetailActionButtonClassName}`} disabled={openingSavedFile || labelExportBusy} onClick={() => void openSavedLabel()}>
                  {openingSavedFile ? t("inventory.labelOpeningSavedFile", "Opening file...") : t("inventory.labelOpenSavedFile", "Open saved file")}
                </button>
              ) : null}
              {openSavedFileError?.scope === scope ? <ModalNotice className="mt-3" tone="danger" role="alert">{openSavedFileError.message}</ModalNotice> : null}
            </div>
          </div>
        </AppModal>
      ) : null}
      {showRfidControls ? <><div className="mt-2">
        <button
          type="button"
          className={inventoryDetailActionButtonClassName}
          onClick={onStartRfidCapture}
          disabled={!runtimeAvailable || !supportsRfidCapture}
        >
          {t("inventory.rfidButton", "RFID")}
        </button>
      </div>
      <div className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {supportsRfidCapture
          ? t(
              "inventory.rfidHintReady",
              "Capture AMS slot identity data, review it, and save the observed RFID tag when it looks correct.",
            )
          : t(
              "inventory.rfidHintNeedsLive",
              "RFID capture needs a printer with Live Bambu status enabled and at least one AMS slot available.",
            )}
      </div>
      </> : null}
    </InventoryDetailTintPanel>
  );
}
