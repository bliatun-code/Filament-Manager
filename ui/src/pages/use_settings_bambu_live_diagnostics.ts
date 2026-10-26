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
    setDiagnosticCaptureByPrinterId((current) => {
      let next = current;
      for (const [printerId, active] of Object.entries(diagnosticCaptureActiveByPrinterId)) {
        const observedState = bambuLiveIntegrations[printerId]?.observed_state;
        if (!active || !observedState) continue;
        const updated = updateDiagnosticCaptureSessionFromObservedState({
          session: current[printerId],
          observedState,
        });
        if (updated && updated !== current[printerId]) {
          if (next === current) next = { ...current };
          next[printerId] = updated;
        }
      }
      return next;
    });
  }, [bambuLiveIntegrations, diagnosticCaptureActiveByPrinterId]);

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
    // Starting after a pause resumes the same session rather than erasing it.
    setDiagnosticCaptureByPrinterId((current) => current[printerId] ? current : ({
      ...current,
      [printerId]: buildDiagnosticCaptureSession(liveConfig?.observed_state ?? null),
    }));
    setDiagnosticCaptureActiveByPrinterId((current) => ({
      ...current,
      [printerId]: true,
    }));
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
