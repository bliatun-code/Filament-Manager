import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import {
  FILAMENT_LABEL_PROFILES,
  type FilamentLabelProfileId,
} from "../lib/filament_label_profiles";
import type { InventorySpool } from "../lib/inventory_list_model";
import {
  inventoryDetailActionButtonClassName,
  inventoryDetailEyebrowClassName,
} from "./inventory_detail_panel_class";
import { InventoryDetailTintPanel } from "./inventory_detail_fact_card";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import { AppModal } from "./app_modal";
import { ModalHeader } from "./modal_chrome";

type InventorySpoolQrRfidPanelProps = {
  companionAvailable: boolean;
  dataUrl: string | null;
  loading: boolean;
  initialLabelPanelOpen?: boolean;
  onPrintLabel: (profileId: FilamentLabelProfileId, pngDataUrl: string) => Promise<void>;
  onStartRfidCapture: () => void;
  resolvedTheme: ResolvedTheme;
  runtimeAvailable: boolean;
  spoolHexColor?: string | null;
  spool: InventorySpool;
  supportsRfidCapture: boolean;
  target: string | null;
};

const qrRfidInfoBoxClassName =
  "rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/60";

export function InventorySpoolQrRfidPanel({
  companionAvailable,
  dataUrl,
  loading,
  initialLabelPanelOpen = false,
  onPrintLabel,
  onStartRfidCapture,
  resolvedTheme,
  runtimeAvailable,
  spoolHexColor,
  spool,
  supportsRfidCapture,
  target,
}: InventorySpoolQrRfidPanelProps) {
  const { t } = useI18n();
  const [labelPanelOpen, setLabelPanelOpen] = useState(initialLabelPanelOpen);
  const [labelProfileId, setLabelProfileId] =
    useState<FilamentLabelProfileId>("ptouch-24");
  const [labelPreview, setLabelPreview] = useState<string | null>(null);
  const [labelPreviewBusy, setLabelPreviewBusy] = useState(false);
  const [labelExportBusy, setLabelExportBusy] = useState(false);

  useEffect(() => {
    if (initialLabelPanelOpen) {
      setLabelPanelOpen(true);
    }
  }, [initialLabelPanelOpen]);

  useEffect(() => {
    if (!labelPanelOpen || !dataUrl) {
      setLabelPreview(null);
      return;
    }
    let active = true;
    setLabelPreviewBusy(true);
    void import("../lib/filament_label_print")
      .then(({ buildFilamentLabelPngDataUrl }) =>
        buildFilamentLabelPngDataUrl(
          {
            vendor: spool.vendor,
            material: spool.material,
            filamentName: spool.filamentName,
            colorName: spool.colorName,
            reference: spool.id,
            qrDataUrl: dataUrl,
          },
          labelProfileId,
        ),
      )
      .then((preview) => {
        if (active) {
          setLabelPreview(preview);
        }
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (active) {
          setLabelPreviewBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [dataUrl, labelPanelOpen, labelProfileId, spool]);

  const exportLabel = async () => {
    if (!labelPreview || labelExportBusy) {
      return;
    }
    setLabelExportBusy(true);
    try {
      await onPrintLabel(labelProfileId, labelPreview);
    } finally {
      setLabelExportBusy(false);
    }
  };

  return (
    <InventoryDetailTintPanel
      className="p-4"
      style={inventorySwatchInsetStyle(spoolHexColor, resolvedTheme)}
    >
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
          onClick={() => setLabelPanelOpen((open) => !open)}
          disabled={!runtimeAvailable || !companionAvailable || !dataUrl}
        >
          {t("inventory.printQr", "Create QR label")}
        </button>
      </div>
      {labelPanelOpen ? (
        <AppModal
          zIndex={80}
          onBackdropClose={() => setLabelPanelOpen(false)}
          panelClassName="flex max-h-[calc(100dvh-3rem)] w-[min(92vw,58rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <ModalHeader
            eyebrow={t("inventory.qrLabel", "QR label")}
            title={t("inventory.labelBuilderTitle", "Create label image")}
            subtitle={t(
              "inventory.labelBuilderSubtitle",
              "Choose a physical size, check the preview, and save a print-ready PNG.",
            )}
            closeLabel={t("common.close", "Close")}
            onClose={() => setLabelPanelOpen(false)}
          />
          <div id="inventory-label-builder" className="grid min-h-0 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
            <div className="flex min-h-64 items-center rounded-xl border border-slate-200 bg-slate-100 p-5 dark:border-slate-700 dark:bg-slate-950/60">
              {labelPreview ? (
                <img
                  src={labelPreview}
                  alt={t("inventory.labelPreview", "Label preview")}
                  className="mx-auto max-h-[22rem] max-w-full bg-white object-contain shadow-lg"
                />
              ) : (
                <div className="flex w-full items-center justify-center text-sm text-slate-500">
                  {labelPreviewBusy
                    ? t("inventory.labelRendering", "Rendering label...")
                    : t("inventory.labelPreviewUnavailable", "Label preview unavailable")}
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {t("inventory.labelSize", "Label size")}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-1">
                {FILAMENT_LABEL_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={labelProfileId === profile.id}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      labelProfileId === profile.id
                        ? "border-sky-500 bg-sky-50 text-slate-950 dark:bg-sky-950/50 dark:text-white"
                        : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
                    }`}
                    onClick={() => setLabelProfileId(profile.id)}
                  >
                    <span className="block font-semibold">
                      {t(`inventory.labelProfile.${profile.id}`, profile.title)}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {profile.widthMm} × {profile.heightMm} mm
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {labelProfileId === "ptouch-24"
                  ? t(
                      "inventory.labelPtouchHint",
                      "Designed for 24 mm tape with a full-height QR and readable text.",
                    )
                  : t(
                      "inventory.labelImageHint",
                      "The PNG is rendered at 300 DPI for predictable physical sizing.",
                    )}
              </div>
              <button
                type="button"
                className={`mt-4 w-full ${inventoryDetailActionButtonClassName}`}
                onClick={() => void exportLabel()}
                disabled={!labelPreview || labelPreviewBusy || labelExportBusy}
              >
                {labelExportBusy
                  ? t("inventory.labelSaving", "Saving PNG...")
                  : t("inventory.labelSaveDownloads", "Save PNG to Downloads")}
              </button>
            </div>
          </div>
        </AppModal>
      ) : null}
      <div className="mt-2">
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
    </InventoryDetailTintPanel>
  );
}
