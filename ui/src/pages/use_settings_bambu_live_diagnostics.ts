import { useEffect, useState } from "react";
import type { BambuLiveIntegrationEntry } from "../lib/tauri_client";
import {
  updateDiagnosticCaptureSessionFromPayload,
  type DiagnosticCaptureSession,
  type DiagnosticFilterKey,
  type DiagnosticSortKey,
} from "../lib/diagnostic_capture";
import { createSettingsBambuLiveCaptureSession } from "./settings_bambu_live_diagnostics_model";

type BambuLiveIntegrationConfig = BambuLiveIntegrationEntry["config"];

type UseSettingsBambuLiveDiagnosticsInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationConfig>;
  expandedBambuDetailsPrinterId: string | null;
};

export function useSettingsBambuLiveDiagnostics({
  bambuLiveIntegrations,
  expandedBambuDetailsPrinterId,
}: UseSettingsBambuLiveDiagnosticsInput) {
  const [diagnosticCaptureByPrinterId, setDiagnosticCaptureByPrinterId] = useState<
    Record<string, DiagnosticCaptureSession>
  >({});
  const [diagnosticCaptureActiveByPrinterId, setDiagnosticCaptureActiveByPrinterId] = useState<
    Record<string, boolean>
  >({});
  const [diagnosticChartFieldByPrinterId, setDiagnosticChartFieldByPrinterId] = useState<
    Record<string, string>
  >({});
  const [diagnosticSortByPrinterId, setDiagnosticSortByPrinterId] = useState<
    Record<string, DiagnosticSortKey>
  >({});
  const [diagnosticFilterByPrinterId, setDiagnosticFilterByPrinterId] = useState<
    Record<string, DiagnosticFilterKey>
  >({});

  useEffect(() => {
    if (!expandedBambuDetailsPrinterId) {
      return;
    }
    if (!diagnosticCaptureActiveByPrinterId[expandedBambuDetailsPrinterId]) {
      return;
    }
    const observedState = bambuLiveIntegrations[expandedBambuDetailsPrinterId]?.observed_state;
    if (!observedState?.raw_payload_json) {
      return;
    }
    const observedAt = observedState.last_seen_at ?? new Date().toISOString();
    setDiagnosticCaptureByPrinterId((current) => {
      const updated = updateDiagnosticCaptureSessionFromPayload({
        session: current[expandedBambuDetailsPrinterId],
        rawPayload: observedState.raw_payload_json,
        observedAt,
      });
      if (!updated) {
        return current;
      }
      return { ...current, [expandedBambuDetailsPrinterId]: updated };
    });
  }, [bambuLiveIntegrations, diagnosticCaptureActiveByPrinterId, expandedBambuDetailsPrinterId]);

  function ensureDiagnosticSession(printerId: string) {
    const liveConfig = bambuLiveIntegrations[printerId] ?? null;
    setDiagnosticCaptureByPrinterId((current) => {
      if (current[printerId]) {
        return current;
      }
      return {
        ...current,
        [printerId]: createSettingsBambuLiveCaptureSession(liveConfig),
      };
    });
    setDiagnosticCaptureActiveByPrinterId((current) => ({
      ...current,
      [printerId]: current[printerId] ?? true,
    }));
    setDiagnosticSortByPrinterId((current) => ({
      ...current,
      [printerId]: current[printerId] ?? "path",
    }));
    setDiagnosticFilterByPrinterId((current) => ({
      ...current,
      [printerId]: current[printerId] ?? "all",
    }));
  }

  function toggleBambuLiveCapture(printerId: string, captureActive: boolean) {
    if (captureActive) {
      setDiagnosticCaptureActiveByPrinterId((current) => ({
        ...current,
        [printerId]: false,
      }));
      return;
    }

    const liveConfig = bambuLiveIntegrations[printerId] ?? null;
    const nextSession = createSettingsBambuLiveCaptureSession(liveConfig);
    setDiagnosticCaptureByPrinterId((current) => ({
      ...current,
      [printerId]: nextSession,
    }));
    setDiagnosticCaptureActiveByPrinterId((current) => ({
      ...current,
      [printerId]: true,
    }));
    setDiagnosticChartFieldByPrinterId((current) => {
      if (!current[printerId]) {
        return current;
      }
      return {
        ...current,
        [printerId]: "",
      };
    });
  }

  return {
    diagnosticCaptureActiveByPrinterId,
    diagnosticCaptureByPrinterId,
    diagnosticChartFieldByPrinterId,
    diagnosticFilterByPrinterId,
    diagnosticSortByPrinterId,
    ensureDiagnosticSession,
    setDiagnosticChartFieldByPrinterId,
    setDiagnosticFilterByPrinterId,
    setDiagnosticSortByPrinterId,
    toggleBambuLiveCapture,
  };
}
