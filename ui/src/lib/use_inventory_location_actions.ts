import { useCallback, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { commandErrorText } from "./error_text";
import type { useI18n } from "./i18n";
import type { InventoryReloadReporter } from "./use_inventory_page_data";
import {
  archiveLocationForInventory, createLocationForInventory, deleteLocationForInventory,
  mergeLocationsForInventory, renameLocationForInventory, restoreLocationForInventory,
  type InventoryLocationMutationContext,
} from "./inventory_location_data_source";

type Input = {
  active: boolean;
  ready: boolean;
  loading: boolean;
  source: string;
  context: InventoryLocationMutationContext;
  tauri: boolean;
  manageBusy: boolean;
  setManageBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  reloadSpools: (report?: InventoryReloadReporter) => Promise<void>;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryLocationActions({ active, ready, loading, source, context, tauri,
  manageBusy, setManageBusy, setError, setInfoMessage, reloadSpools, t }: Input) {
  const authorityKey = JSON.stringify([context.clientReadOnly, context.clientHostBaseUrl,
    context.clientLibraryId, context.clientTargetGeneration, ready]);
  const view = useMemo(() => ({ authorityKey, active }), [authorityKey, active]);
  const eligibility = useMemo(() => ({ ready, loading, source, tauri,
    paired: context.clientHostWritePaired, supported: context.mutationsSupported }), [ready, loading, source, tauri,
    context.clientHostWritePaired, context.mutationsSupported]);
  const latestEligibility = useRef(eligibility);
  const current = useRef<{ view: object; busy: boolean } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationInfo, setLocationInfo] = useState<string | null>(null);
  useLayoutEffect(() => { latestEligibility.current = eligibility; }, [eligibility]);
  useLayoutEffect(() => {
    const scope = { view, busy: false };
    current.current = scope;
    setLocationError(null);
    setLocationInfo(null);
    return () => {
      current.current = null;
      if (scope.busy) setManageBusy(false);
    };
  }, [view, setManageBusy]);

  const runLocationMutation = useCallback(async (
    operation: () => Promise<unknown>, successMessage: string, reloadOnFailure = false,
  ): Promise<boolean> => {
    const scope = current.current;
    if (!scope || scope.view !== view || latestEligibility.current !== eligibility ||
      scope.busy || manageBusy || !tauri || !active || !ready || loading || source !== "LIVE" ||
      !context.mutationsSupported || (context.clientReadOnly && (!context.clientHostWritePaired ||
        !context.clientHostBaseUrl || !context.clientLibraryId ||
        !Number.isSafeInteger(context.clientTargetGeneration) || context.clientTargetGeneration! < 0))) return false;
    const isCurrent = () => current.current === scope;
    scope.busy = true;
    setManageBusy(true);
    setError(null);
    setInfoMessage(null);
    setLocationError(null);
    setLocationInfo(null);
    const refresh = async () => {
      let failed = false;
      try {
        await reloadSpools((_domain, resolution) => {
          if (resolution !== "LIVE" && resolution !== "SUPERSEDED") failed = true;
        });
      } catch { failed = true; }
      return failed;
    };
    try {
      try { await operation(); }
      catch (error) {
        if (!isCurrent()) return false;
        setLocationError(commandErrorText(error,
          t("errors.requestFailed", "The request could not be completed."), t));
        // A rejected delete may mean a newly added reference. Refresh eligibility,
        // but retain the original write error if that refresh also fails.
        if (reloadOnFailure) await refresh();
        return false;
      }
      if (!isCurrent()) return false;
      setLocationInfo(successMessage);
      const failed = await refresh();
      if (!isCurrent()) return false;
      if (failed) setLocationError(t("inventory.error.loadInventory", "Failed to load inventory."));
      // The mutation was acknowledged even when its subsequent refresh failed.
      return true;
    } finally {
      if (isCurrent()) { scope.busy = false; setManageBusy(false); }
    }
  }, [view, eligibility, manageBusy, tauri, active, ready, loading, source, context,
    setManageBusy, setError, setInfoMessage, reloadSpools, t]);

  const createLocation = useCallback(
    (name: string) =>
      runLocationMutation(
        () => createLocationForInventory(context, name),
        t("inventory.locationCreated", "Location created."),
      ),
    [context, runLocationMutation, t],
  );

  const renameLocation = useCallback(
    (locationId: string, name: string) =>
      runLocationMutation(
        () => renameLocationForInventory(context, locationId, name),
        t("inventory.locationRenamed", "Location renamed."),
      ),
    [context, runLocationMutation, t],
  );

  const archiveLocation = useCallback(
    (locationId: string) =>
      runLocationMutation(
        () => archiveLocationForInventory(context, locationId),
        t("inventory.locationArchived", "Location archived."),
      ),
    [context, runLocationMutation, t],
  );

  const restoreLocation = useCallback(
    (locationId: string) =>
      runLocationMutation(
        () => restoreLocationForInventory(context, locationId),
        t("inventory.locationRestored", "Location restored."),
      ),
    [context, runLocationMutation, t],
  );

  const deleteLocation = useCallback(
    (locationId: string) =>
      runLocationMutation(
        () => deleteLocationForInventory(context, locationId),
        t("inventory.locationDeleted", "Location deleted."),
        true,
      ),
    [context, runLocationMutation, t],
  );

  const mergeLocations = useCallback(
    (sourceId: string, targetId: string) =>
      runLocationMutation(
        () => mergeLocationsForInventory(context, sourceId, targetId),
        t("inventory.locationsMerged", "Locations merged."),
      ),
    [context, runLocationMutation, t],
  );

  return { authorityKey, locationError, locationInfo, createLocation, renameLocation, archiveLocation, restoreLocation, deleteLocation, mergeLocations };
}
