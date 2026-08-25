import { useEffect, useState } from "react";
import type { BambuLiveIntegrationEntry } from "../lib/tauri_client";
import {
  buildDiagnosticCaptureSession,
  updateDiagnosticCaptureSessionFromObservedState,
  type DiagnosticCaptureSession,
  type DiagnosticFilterKey,
  type DiagnosticSortKey,
} from "../lib/diagnostic_capture";

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
    if (!observedState) {
      return;
    }
    setDiagnosticCaptureByPrinterId((current) => {
      const updated = updateDiagnosticCaptureSessionFromObservedState({
        session: current[expandedBambuDetailsPrinterId],
        observedState,
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
        [printerId]: buildDiagnosticCaptureSession(liveConfig?.observed_state ?? null),
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
    const nextSession = buildDiagnosticCaptureSession(liveConfig?.observed_state ?? null);
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
