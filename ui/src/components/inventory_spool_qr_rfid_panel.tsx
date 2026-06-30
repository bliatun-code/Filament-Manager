import { useI18n } from "../lib/i18n";
import { inventoryDetailEyebrowClassName } from "./inventory_detail_panel_class";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";

type InventorySpoolQrRfidPanelProps = {
  companionAvailable: boolean;
  dataUrl: string | null;
  loading: boolean;
  onPrintLabel: () => void;
  onStartRfidCapture: () => void;
  resolvedTheme: ResolvedTheme;
  runtimeAvailable: boolean;
  spoolHexColor?: string | null;
  supportsRfidCapture: boolean;
  target: string | null;
};

const qrRfidInfoBoxClassName =
  "rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/60";

const qrRfidActionButtonClassName =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100";

export function InventorySpoolQrRfidPanel({
  companionAvailable,
  dataUrl,
  loading,
  onPrintLabel,
  onStartRfidCapture,
  resolvedTheme,
  runtimeAvailable,
  spoolHexColor,
  supportsRfidCapture,
  target,
}: InventorySpoolQrRfidPanelProps) {
  const { t } = useI18n();

  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
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
          className={qrRfidActionButtonClassName}
          onClick={onPrintLabel}
          disabled={!runtimeAvailable || !companionAvailable || !dataUrl}
        >
          {t("inventory.printQr", "Print QR label")}
        </button>
      </div>
      <div className="mt-2">
        <button
          type="button"
          className={qrRfidActionButtonClassName}
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
    </div>
  );
}
