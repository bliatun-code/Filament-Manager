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
  requireWritableFilamentStandardsSnapshot,
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
  clientHostWritePaired: boolean;
  clientLibraryId?: string | null;
  clientReadOnly: boolean;
  clientTargetGeneration?: number | null;
  fallbackSpoolRows: readonly NormalizedSpoolWithMasterRow[];
  onInventoryChanged: () => Promise<void> | void;
  onLoadError: (error: unknown) => void;
  roleResolved: boolean;
  tauri: boolean;
};

type LoadFilamentStandardsOptions = {
  preserveSnapshotOnFailure?: boolean;
  propagateFailure?: boolean;
};

export function useSettingsFilamentDefaults({
  clientHostBaseUrl,
  clientHostWritePaired,
  clientLibraryId,
  clientReadOnly,
  clientTargetGeneration,
  fallbackSpoolRows,
  onInventoryChanged,
  onLoadError,
  roleResolved,
  tauri,
}: UseSettingsFilamentDefaultsInput) {
  const dataSourceKey = !tauri
    ? "browser"
    : !roleResolved
      ? "unresolved"
    : clientReadOnly
      ? [
          "client",
          clientHostBaseUrl?.trim() ?? "",
          clientLibraryId?.trim() ?? "",
          Number.isSafeInteger(clientTargetGeneration)
            ? String(clientTargetGeneration)
            : "unresolved-generation",
          clientHostWritePaired ? "paired" : "unpaired",
        ].join(":")
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
  const [hostUnsupportedState, setHostUnsupportedState] = useState<{
    dataSourceKey: string;
    value: boolean;
  }>(() => ({ dataSourceKey, value: false }));
  const hostUnsupported =
    hostUnsupportedState.dataSourceKey === dataSourceKey
      ? hostUnsupportedState.value
      : false;
  const [loadFailedState, setLoadFailedState] = useState<{
    dataSourceKey: string;
    value: boolean;
  }>(() => ({ dataSourceKey, value: false }));
  const loadFailed =
    loadFailedState.dataSourceKey === dataSourceKey
      ? loadFailedState.value
      : false;
  const hostTargetMissing =
    tauri &&
    roleResolved &&
    clientReadOnly &&
    (!clientHostBaseUrl?.trim() || !clientLibraryId?.trim());
  const requestGenerationRef = useRef(0);

  const loadSnapshot = useCallback(
    async (options: LoadFilamentStandardsOptions = {}) => {
      const requestGeneration = requestGenerationRef.current + 1;
      requestGenerationRef.current = requestGeneration;
      if (!tauri) {
        setSnapshot(null);
        setHostUnsupportedState({ dataSourceKey, value: false });
        setLoadFailedState({ dataSourceKey, value: false });
        setLoading(false);
        return null;
      }
      if (!roleResolved) {
        // The persisted role is authoritative for this library-wide feature.
        // Do not expose local rows or call local commands while role loading is
        // pending or has failed.
        setSnapshot(null);
        setHostUnsupportedState({ dataSourceKey, value: false });
        setLoadFailedState({ dataSourceKey, value: false });
        setLoading(false);
        return null;
      }
      if (hostTargetMissing) {
        // Missing Host coordinates are a configuration state, not a failed
        // request. Keep the section fail-closed and let it point the user to
        // client pairing instead of offering a retry that cannot succeed.
        setSnapshot(null);
        setHostUnsupportedState({ dataSourceKey, value: false });
        setLoadFailedState({ dataSourceKey, value: false });
        setLoading(false);
        return null;
      }
      setLoading(true);
      try {
        const next = clientReadOnly
          ? await fetchLibrarySyncFilamentStandards(
              clientHostBaseUrl ?? "",
              clientLibraryId ?? "",
            )
          : await getFilamentStandards();
        if (requestGenerationRef.current !== requestGeneration) {
          return null;
        }
        setSnapshot(next);
        setHostUnsupportedState({ dataSourceKey, value: false });
        setLoadFailedState({ dataSourceKey, value: false });
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
        if (hostUnsupported) {
          setHostUnsupportedState({ dataSourceKey, value: true });
        } else if (!options.preserveSnapshotOnFailure) {
          setHostUnsupportedState({ dataSourceKey, value: false });
        }
        setLoadFailedState({
          dataSourceKey,
          value: clientReadOnly && !hostUnsupported,
        });
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
      dataSourceKey,
      hostTargetMissing,
      onLoadError,
      roleResolved,
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
  const retryLoad = useCallback(
    () => loadSnapshot({ preserveSnapshotOnFailure: true }),
    [loadSnapshot],
  );

  const spoolRows = useMemo(
    () =>
      !roleResolved
        ? []
        : snapshot
        ? mapFilamentStandardsSnapshotRows(snapshot)
        : mapFallbackFilamentDefaultsRows(fallbackSpoolRows),
    [fallbackSpoolRows, roleResolved, snapshot],
  );

  const persistedGroupPrices = useMemo(
    () => filamentGroupPriceDefaults(snapshot),
    [snapshot],
  );

  const requireWritableSnapshot = useCallback(
    () =>
      requireWritableFilamentStandardsSnapshot({
        clientReadOnly,
        roleResolved,
        snapshot,
      }),
    [clientReadOnly, roleResolved, snapshot],
  );

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
    hostUnsupported,
    hostTargetMissing,
    loadFailed,
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
    retryLoad,
  };
}
