import type {
  DiagnosticCaptureSession,
  DiagnosticFilterKey,
  DiagnosticSortKey,
} from "../lib/diagnostic_capture";
import { useI18n } from "../lib/i18n";
import { formatSettingsDateTime } from "../lib/settings_utils";
import type { BambuLiveIntegrationSettings } from "../lib/tauri_client";
import type { SettingsBambuLiveDiagnosticsModel } from "../pages/settings_bambu_live_diagnostics_model";
import { SettingsBambuLiveCaptureChartPanel } from "./settings_bambu_live_capture_chart_panel";
import { SettingsBambuLiveCapturedFieldsPanel } from "./settings_bambu_live_captured_fields_panel";
import { SettingsBambuLiveDiagnosticsSummary } from "./settings_bambu_live_diagnostics_summary";
import { SettingsBambuLiveRawPayloadPanel } from "./settings_bambu_live_raw_payload_panel";
import { SettingsBambuLiveTrayCards } from "./settings_bambu_live_tray_cards";

type SettingsBambuLiveObservedDetailsPanelProps = {
  captureActive: boolean;
  diagnosticFilter: DiagnosticFilterKey;
  diagnosticSession: DiagnosticCaptureSession | null;
  diagnosticSort: DiagnosticSortKey;
  downloadName: string;
  liveConfig: BambuLiveIntegrationSettings;
  model: SettingsBambuLiveDiagnosticsModel;
  onCopyError: (message: string) => void;
  onCopySuccess: (message: string) => void;
  onDiagnosticFilterChange: (filter: DiagnosticFilterKey) => void;
  onDiagnosticSortChange: (sort: DiagnosticSortKey) => void;
  onSelectedChartFieldChange: (fieldPath: string) => void;
  onToggleCapture: () => void;
  printerId: string;
};

function countObservedTopLevelFields(rawPayload: unknown): number {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return 0;
  }

  return Object.keys(rawPayload as Record<string, unknown>).length;
}

export function SettingsBambuLiveObservedDetailsPanel({
  captureActive,
  diagnosticFilter,
  diagnosticSession,
  diagnosticSort,
  downloadName,
  liveConfig,
  model,
  onCopyError,
  onCopySuccess,
  onDiagnosticFilterChange,
  onDiagnosticSortChange,
  onSelectedChartFieldChange,
  onToggleCapture,
  printerId,
}: SettingsBambuLiveObservedDetailsPanelProps) {
  const { locale, t } = useI18n();
  const {
    amsReadInProgress,
    diagnosticChartFields,
    diagnosticChartPoints,
    diagnosticFields,
    diagnosticGroups,
    diagnosticMetricCards,
    diagnosticTrayCards,
    fallbackSummaryParts,
    observedState,
    observedSummaryParts,
    selectedDiagnosticChartField,
    signalQualityBuckets,
    sortedDiagnosticFields,
  } = model;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
      {observedState ? (
        <div className="space-y-3">
          <div>
            {t("settings.bambuLiveStatus", "Connection status")}:{" "}
            {observedState.mqtt_connected
              ? t("settings.bambuLiveConnected", "Connected")
              : t("settings.bambuLiveDisconnected", "Not connected")}
          </div>
          <div>
            {t("settings.bambuLiveLastSeen", "Last seen")}:{" "}
            {observedState.last_seen_at
              ? formatSettingsDateTime(observedState.last_seen_at, locale)
              : "—"}
          </div>
          <div>
            {t("settings.bambuLiveObservedSummary", "Observed summary")}:{" "}
            {observedSummaryParts.join(" · ") || fallbackSummaryParts.join(" · ") || "—"}
          </div>
          {observedState.raw_status_note ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {observedState.raw_status_note}
            </div>
          ) : null}
          {amsReadInProgress ? (
            <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
              {t(
                "settings.bambuLiveAmsReading",
                "AMS refresh in progress. RFID and tray matching can look temporarily uncertain until reading finishes.",
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {captureActive
                  ? t("settings.bambuLiveCaptureRunning", "Capture is running")
                  : t("settings.bambuLiveCapturePaused", "Capture is paused")}
              </span>
              <span className="ml-2">
                {captureActive
                  ? t(
                      "settings.bambuLiveCaptureRunningHint",
                      "Incoming live bursts are being collected into this session now.",
                    )
                  : t(
                      "settings.bambuLiveCapturePausedHint",
                      "The current session is frozen until you start capture again.",
                    )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`rounded border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${
                  captureActive
                    ? "border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-200"
                    : "border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-200"
                }`}
                onClick={onToggleCapture}
              >
                {captureActive
                  ? t("settings.bambuLiveStopCapture", "Stop capture")
                  : t("settings.bambuLiveStartCapture", "Start capture")}
              </button>
            </div>
          </div>
          <SettingsBambuLiveTrayCards
            moreCandidatesLabel={t(
              "settings.bambuLiveMoreInventoryCandidates",
              "More matching rolls exist in inventory.",
            )}
            printerId={printerId}
            trays={diagnosticTrayCards}
          />
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/50">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("settings.bambuLiveDiagnostics", "Diagnostics")}
            </div>
            <div className="mt-2 space-y-2 text-[11px] text-slate-600 dark:text-slate-300">
              <div>
                {t("settings.bambuLiveConfiguredHost", "Configured host")}:{" "}
                {liveConfig.host?.trim() || "—"}
              </div>
              <div>
                {t("settings.bambuLiveConfiguredSerial", "Configured printer serial")}:{" "}
                {liveConfig.printer_serial?.trim() || "—"}
              </div>
              <div>
                {t("settings.bambuLivePrinterOnline", "Online")}:{" "}
                {observedState.online ? "true" : "false"}
              </div>
              <div>
                {t("settings.bambuLiveMqttConnected", "MQTT connected")}:{" "}
                {observedState.mqtt_connected ? "true" : "false"}
              </div>
              <div>
                {t("settings.bambuLiveFieldCount", "Observed top-level fields")}:{" "}
                {countObservedTopLevelFields(observedState.raw_payload_json)}
              </div>
              <div>
                {t("settings.bambuLiveCapturedFieldCount", "Captured fields in this session")}:{" "}
                {diagnosticFields.length}
              </div>
            </div>
            <SettingsBambuLiveDiagnosticsSummary
              metrics={diagnosticMetricCards}
              printerId={printerId}
              signalQualityBuckets={signalQualityBuckets}
            />
            <SettingsBambuLiveCaptureChartPanel
              chartFields={diagnosticChartFields}
              chartPoints={diagnosticChartPoints}
              onSelectedFieldChange={onSelectedChartFieldChange}
              selectedFieldPath={selectedDiagnosticChartField}
            />
            <SettingsBambuLiveCapturedFieldsPanel
              diagnosticFilter={diagnosticFilter}
              diagnosticGroups={diagnosticGroups}
              diagnosticSession={diagnosticSession}
              diagnosticSort={diagnosticSort}
              downloadName={downloadName}
              onDiagnosticFilterChange={onDiagnosticFilterChange}
              onDiagnosticSortChange={onDiagnosticSortChange}
              sortedFieldCount={sortedDiagnosticFields.length}
            />
            <SettingsBambuLiveRawPayloadPanel
              onCopyError={onCopyError}
              onCopySuccess={onCopySuccess}
              rawPayload={observedState.raw_payload_json}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            {t("settings.bambuLiveObservedDetails", "Observed live details")}
          </div>
          <div>
            {t(
              "settings.bambuLiveObservedEmpty",
              "No observed live data yet. This section will later show the incoming status fields, connection health and useful AMS values for this printer.",
            )}
          </div>
          <div>
            {t("settings.bambuLiveConfiguredHost", "Configured host")}:{" "}
            {liveConfig.host?.trim() || "—"}
          </div>
          <div>
            {t("settings.bambuLiveConfiguredSerial", "Configured printer serial")}:{" "}
            {liveConfig.printer_serial?.trim() || "—"}
          </div>
        </div>
      )}
    </div>
  );
}
