import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { appErrorCode } from "../lib/error_text";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import {
  buildFilamentPriceBatchInput,
  emptyFilamentStandardsSettings,
  filamentGroupPriceDefaults,
  mapFallbackFilamentDefaultsRows,
  mapFilamentPriceBatchReceipt,
  mapFilamentStandardsSnapshotRows,
  refreshAfterFilamentPriceBatch,
  settingsWithDefaultPurchaseCurrency,
  settingsWithGroupPriceDefault,
} from "../lib/settings_filament_defaults_data_source";
import type {
  FilamentPriceBatchRequest,
  SaveFilamentGroupPriceDefaultRequest,
} from "../lib/settings_filament_defaults_model";
import {
  applyFilamentPriceBatch,
  fetchLibrarySyncFilamentStandards,
  getFilamentStandards,
  saveFilamentStandards,
  type FilamentStandardsSnapshot,
} from "../lib/tauri_client";

type UseSettingsFilamentDefaultsInput = {
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientReadOnly: boolean;
  fallbackSpoolRows: readonly NormalizedSpoolWithMasterRow[];
  onInventoryChanged: () => Promise<void> | void;
  onLoadError: (error: unknown) => void;
  tauri: boolean;
};

type LoadFilamentStandardsOptions = {
  preserveSnapshotOnFailure?: boolean;
  propagateFailure?: boolean;
};

export function useSettingsFilamentDefaults({
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  fallbackSpoolRows,
  onInventoryChanged,
  onLoadError,
  tauri,
}: UseSettingsFilamentDefaultsInput) {
  const dataSourceKey = !tauri
    ? "browser"
    : clientReadOnly
      ? `client:${clientHostBaseUrl?.trim() ?? ""}:${clientLibraryId?.trim() ?? ""}`
      : "local";
  const [snapshotState, setSnapshotState] = useState<{
    dataSourceKey: string;
    snapshot: FilamentStandardsSnapshot | null;
  }>(() => ({ dataSourceKey, snapshot: null }));
  const snapshot =
    snapshotState.dataSourceKey === dataSourceKey
      ? snapshotState.snapshot
      : null;
  const setSnapshot = useCallback(
    (next: FilamentStandardsSnapshot | null) => {
      setSnapshotState({ dataSourceKey, snapshot: next });
    },
    [dataSourceKey],
  );
  const [loading, setLoading] = useState(tauri);
  const requestGenerationRef = useRef(0);

  const loadSnapshot = useCallback(
    async (options: LoadFilamentStandardsOptions = {}) => {
      const requestGeneration = requestGenerationRef.current + 1;
      requestGenerationRef.current = requestGeneration;
      if (!tauri) {
        setSnapshot(null);
        setLoading(false);
        return null;
      }
      setLoading(true);
      try {
        const next = clientReadOnly
          ? clientHostBaseUrl?.trim() && clientLibraryId?.trim()
            ? await fetchLibrarySyncFilamentStandards(
                clientHostBaseUrl,
                clientLibraryId,
              )
            : null
          : await getFilamentStandards();
        if (requestGenerationRef.current !== requestGeneration) {
          return null;
        }
        setSnapshot(next);
        return next;
      } catch (error) {
        if (requestGenerationRef.current !== requestGeneration) {
          return null;
        }
        const hostUnsupported =
          clientReadOnly &&
          appErrorCode(error) === "filament_standards.host_unsupported";
        if (hostUnsupported || !options.preserveSnapshotOnFailure) {
          // An older Host can still provide its spool list. Keep the tab useful
          // and read-only without presenting local defaults as Host data.
          setSnapshot(null);
        }
        if (!clientReadOnly) {
          onLoadError(error);
        } else {
          console.warn(error);
        }
        if (options.propagateFailure && !hostUnsupported) {
          throw error;
        }
        return null;
      } finally {
        if (requestGenerationRef.current === requestGeneration) {
          setLoading(false);
        }
      }
    },
    [
      clientHostBaseUrl,
      clientLibraryId,
      clientReadOnly,
      onLoadError,
      setSnapshot,
      tauri,
    ],
  );

  useEffect(() => {
    void loadSnapshot();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [loadSnapshot]);

  const reload = useCallback(
    () =>
      loadSnapshot({
        preserveSnapshotOnFailure: true,
        propagateFailure: true,
      }),
    [loadSnapshot],
  );

  const spoolRows = useMemo(
    () =>
      snapshot
        ? mapFilamentStandardsSnapshotRows(snapshot)
        : mapFallbackFilamentDefaultsRows(fallbackSpoolRows),
    [fallbackSpoolRows, snapshot],
  );

  const persistedGroupPrices = useMemo(
    () => filamentGroupPriceDefaults(snapshot),
    [snapshot],
  );

  const requireWritableSnapshot = useCallback(() => {
    if (clientReadOnly) {
      throw new Error("Filamentstandarder administreres på vertsmaskinen.");
    }
    if (!snapshot) {
      throw new Error("Filamentstandardene er ikke ferdig lastet.");
    }
    return snapshot;
  }, [clientReadOnly, snapshot]);

  const onSaveDefaultCurrency = useCallback(
    async (currency: string) => {
      const current = requireWritableSnapshot();
      const saved = await saveFilamentStandards(
        settingsWithDefaultPurchaseCurrency(current, currency),
      );
      setSnapshot(saved);
    },
    [requireWritableSnapshot, setSnapshot],
  );

  const onSaveGroupPrice = useCallback(
    async (request: SaveFilamentGroupPriceDefaultRequest) => {
      const current = requireWritableSnapshot();
      const saved = await saveFilamentStandards(
        settingsWithGroupPriceDefault(current, request),
      );
      setSnapshot(saved);
    },
    [requireWritableSnapshot, setSnapshot],
  );

  const onApplyBatch = useCallback(
    async (request: FilamentPriceBatchRequest) => {
      const current = requireWritableSnapshot();
      const receipt = await applyFilamentPriceBatch(
        buildFilamentPriceBatchInput(current, request),
      );
      const mapped = mapFilamentPriceBatchReceipt(receipt, request, current);
      const refreshed = await refreshAfterFilamentPriceBatch({
        refreshInventory: onInventoryChanged,
        refreshStandards: getFilamentStandards,
      });
      if (refreshed) {
        setSnapshot(refreshed);
      }
      return mapped;
    },
    [onInventoryChanged, requireWritableSnapshot, setSnapshot],
  );

  return {
    busy: loading,
    defaultCurrency:
      snapshot?.settings.default_purchase_currency ??
      emptyFilamentStandardsSettings().default_purchase_currency ??
      "",
    persistedGroupPrices,
    settingsValid: snapshot?.settings_valid !== false,
    spoolRows,
    onApplyBatch,
    onSaveDefaultCurrency,
    onSaveGroupPrice,
    reload,
  };
}
