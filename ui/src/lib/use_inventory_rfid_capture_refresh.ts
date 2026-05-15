import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { useI18n } from "./i18n";
import {
  extractRfidCaptureFields,
  type RfidCaptureField,
  type RfidObservedTraySnapshot,
} from "./inventory_rfid_capture";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";
import {
  getPrinterSettings,
  type BambuLiveIntegrationSettings,
} from "./tauri_client";

type InventoryRfidCaptureRefreshInput = {
  clientReadOnly: boolean;
  observedTrayCaptureSnapshot: RfidObservedTraySnapshot | null;
  rfidCaptureFieldsLength: number;
  selectedRfidCaptureSlot: InventoryPrinterSlotOption | null;
  selectedSpoolRfidCaptureSlots: InventoryPrinterSlotOption[];
  setBambuLiveIntegrations: Dispatch<
    SetStateAction<Record<string, BambuLiveIntegrationSettings>>
  >;
  setRfidCaptureError: Dispatch<SetStateAction<string | null>>;
  setRfidCaptureFieldsBySlotId: Dispatch<SetStateAction<Record<string, RfidCaptureField[]>>>;
  setRfidCaptureLoading: Dispatch<SetStateAction<boolean>>;
  showRfidCaptureModal: boolean;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryRfidCaptureRefresh({
  clientReadOnly,
  observedTrayCaptureSnapshot,
  rfidCaptureFieldsLength,
  selectedRfidCaptureSlot,
  selectedSpoolRfidCaptureSlots,
  setBambuLiveIntegrations,
  setRfidCaptureError,
  setRfidCaptureFieldsBySlotId,
  setRfidCaptureLoading,
  showRfidCaptureModal,
  tauriAvailable,
  t,
}: InventoryRfidCaptureRefreshInput) {
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    if (
      !showRfidCaptureModal ||
      !tauriAvailable ||
      clientReadOnly ||
      !selectedRfidCaptureSlot
    ) {
      return;
    }
    let cancelled = false;

    const refreshCapture = async () => {
      if (cancelled || refreshInFlightRef.current) {
        return;
      }
      refreshInFlightRef.current = true;
      setRfidCaptureLoading(true);
      try {
        const snapshot = await getPrinterSettings();
        if (cancelled) {
          return;
        }
        const nextIntegrations = Object.fromEntries(
          (snapshot.bambu_live_integrations ?? []).map((entry) => [entry.printer_id, entry.config]),
        ) as Record<string, BambuLiveIntegrationSettings>;
        setBambuLiveIntegrations(nextIntegrations);
        const observedState = nextIntegrations[selectedRfidCaptureSlot.printerId]?.observed_state;
        if (!observedState?.raw_payload_json) {
          if (
            rfidCaptureFieldsLength === 0 &&
            !(observedTrayCaptureSnapshot?.fields.length)
          ) {
            setRfidCaptureError(
              t(
                "inventory.rfidCaptureNoPayload",
                "Waiting for tray data from the printer. Start or resume a print if the stream is idle.",
              ),
            );
          } else {
            setRfidCaptureError(null);
          }
          return;
        }
        const capturedBySlot = selectedSpoolRfidCaptureSlots.map((slot) => ({
          slotId: slot.slotId,
          captured: extractRfidCaptureFields(observedState.raw_payload_json, slot.slotIndex),
        }));
        const captured =
          capturedBySlot.find((entry) => entry.slotId === selectedRfidCaptureSlot.slotId)?.captured ?? [];
        if (captured.length === 0) {
          if (
            rfidCaptureFieldsLength === 0 &&
            !(observedTrayCaptureSnapshot?.fields.length)
          ) {
            setRfidCaptureError(
              t(
                "inventory.rfidCaptureNoSlotData",
                "No slot-specific AMS fields have arrived yet for this slot.",
              ),
            );
          } else {
            setRfidCaptureError(null);
          }
          return;
        }
        setRfidCaptureError(null);
        const observedAt = observedState.last_seen_at ?? new Date().toISOString();
        setRfidCaptureFieldsBySlotId((current) => {
          const next = { ...current };
          for (const slotEntry of capturedBySlot) {
            if (slotEntry.captured.length === 0) {
              continue;
            }
            const existingFields = next[slotEntry.slotId] ?? [];
            const merged = new Map(existingFields.map((field) => [field.path, field]));
            for (const field of slotEntry.captured) {
              const existing = merged.get(field.path);
              if (!existing) {
                merged.set(field.path, {
                  path: field.path,
                  label: field.label,
                  valueText: field.valueText,
                  lastSeenAt: observedAt,
                  receiveCount: 1,
                  changeCount: 1,
                });
                continue;
              }
              merged.set(field.path, {
                ...existing,
                label: field.label,
                valueText: field.valueText,
                lastSeenAt: observedAt,
                receiveCount: existing.receiveCount + 1,
                changeCount:
                  existing.valueText === field.valueText
                    ? existing.changeCount
                    : existing.changeCount + 1,
              });
            }
            next[slotEntry.slotId] = Array.from(merged.values()).sort((left, right) =>
              left.label.localeCompare(right.label, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            );
          }
          return next;
        });
      } catch (captureError) {
        console.error(captureError);
        if (!cancelled) {
          setRfidCaptureError(
            t("inventory.rfidCaptureFailed", "Could not refresh RFID capture from the printer."),
          );
        }
      } finally {
        refreshInFlightRef.current = false;
        if (!cancelled) {
          setRfidCaptureLoading(false);
        }
      }
    };

    void refreshCapture();
    const timer = window.setInterval(() => {
      void refreshCapture();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    clientReadOnly,
    observedTrayCaptureSnapshot,
    rfidCaptureFieldsLength,
    selectedRfidCaptureSlot,
    selectedSpoolRfidCaptureSlots,
    setBambuLiveIntegrations,
    setRfidCaptureError,
    setRfidCaptureFieldsBySlotId,
    setRfidCaptureLoading,
    showRfidCaptureModal,
    t,
    tauriAvailable,
  ]);
}
