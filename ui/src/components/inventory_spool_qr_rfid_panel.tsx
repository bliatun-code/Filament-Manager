import type { FilamentQrMode } from "../lib/filament_qr_payload";
import { useI18n } from "../lib/i18n";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";

type InventorySpoolQrRfidPanelProps = {
  companionAvailable: boolean;
  dataUrl: string | null;
  loading: boolean;
  mode: FilamentQrMode;
  onModeChange: (mode: FilamentQrMode) => void;
  onPrintLabel: () => void;
  onStartRfidCapture: () => void;
  resolvedMode: FilamentQrMode;
  resolvedTheme: ResolvedTheme;
  runtimeAvailable: boolean;
  spoolHexColor?: string | null;
  supportsRfidCapture: boolean;
  target: string | null;
};

function qrModeButtonClass(active: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-semibold transition ${
    active
      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950"
      : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/70"
  }`;
}

export function InventorySpoolQrRfidPanel({
  companionAvailable,
  dataUrl,
  loading,
  mode,
  onModeChange,
  onPrintLabel,
  onStartRfidCapture,
  resolvedMode,
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
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {t("inventory.qrLabel", "QR")}
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {t("inventory.qrMode", "QR mode")}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={qrModeButtonClass(mode === "companion")}
            onClick={() => onModeChange("companion")}
            disabled={!companionAvailable}
          >
            {t("inventory.qrModeCompanion", "Companion link")}
          </button>
          <button
            type="button"
            className={qrModeButtonClass(mode === "portable")}
            onClick={() => onModeChange("portable")}
          >
            {t("inventory.qrModePortable", "Portable")}
          </button>
        </div>
        {!companionAvailable ? (
          <div className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {t(
              "inventory.qrCompanionUnavailable",
              "Companion link is unavailable right now. Start the Trusted-LAN companion on the active host to build a direct browser link.",
            )}
          </div>
        ) : null}
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
        <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
          {loading
            ? t("common.loading", "Loading...")
            : t("inventory.error.printLabel", "Failed to generate label.")}
        </div>
      )}
      {target ? (
        <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          <div className="font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t("inventory.qrTarget", "QR target")}
          </div>
          <div className="mt-1 break-all font-mono text-[11px] leading-relaxed">
            {target}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {resolvedMode === "companion"
              ? t(
                  "inventory.qrTargetCompanionHint",
                  "This QR opens the browser companion directly as long as the target URL is still reachable.",
                )
              : t(
                  "inventory.qrTargetPortableHint",
                  "This QR contains only the spool reference, which is more robust for small prints and host changes.",
                )}
          </div>
        </div>
      ) : null}
      <div className="mt-3">
        <button
          type="button"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100"
          onClick={onPrintLabel}
          disabled={!runtimeAvailable}
        >
          {t("inventory.printQr", "Print QR label")}
        </button>
      </div>
      <div className="mt-2">
        <button
          type="button"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100"
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
