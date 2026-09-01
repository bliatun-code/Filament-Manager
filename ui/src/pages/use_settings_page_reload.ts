import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createLibraryRevisionTracker,
  fetchLibraryDomainRevisionsForSource,
  LIBRARY_REVISION_DOMAINS,
  markLibraryRevisionUnavailable,
  observeLibraryDomainRevisions,
  resolveLibraryRevisionSource,
  type LibraryRevisionSource,
  type LibraryRevisionTracker,
} from "../lib/library_domain_revisions";
import type {
  BambuLiveIntegrationEntry,
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
  PrinterOverviewRow,
  PrinterRow,
} from "../lib/tauri_client";
import { loadSettingsPageData } from "../lib/settings_data_source";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import {
  buildSettingsPageDataModel,
  buildSettingsPageLoadErrorMessage,
  type SettingsPageMessageLabels,
} from "./settings_page_model";
import {
  buildSettingsCatalogDataSourceIdentity,
  commitResolvedSettingsCatalogData,
  reduceSettingsCatalogData,
  type SettingsCatalogDataState,
} from "./settings_catalog_data_state";
import type { LibrarySyncMode } from "./settings_library_sync_model";

type UseSettingsPageReloadInput = {
  onDataReloaded?: () => Promise<unknown> | unknown;
  setBambuLiveIntegrations: Dispatch<SetStateAction<Record<string, BambuLiveIntegrationEntry["config"]>>>;
  setCatalogData: Dispatch<SetStateAction<SettingsCatalogDataState>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLibrarySyncDeviceNameDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncHostBaseUrlDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncModeDraft: Dispatch<SetStateAction<LibrarySyncMode>>;
  setLibrarySyncSettings: Dispatch<SetStateAction<LibrarySyncSettings | null>>;
  setLibrarySyncSnapshot: Dispatch<SetStateAction<LibrarySyncRemoteSnapshot | null>>;
  setLibrarySyncValidation: Dispatch<SetStateAction<LibrarySyncHostValidationResult | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setPrinterOverview: Dispatch<SetStateAction<PrinterOverviewRow[]>>;
  setPrinters: Dispatch<SetStateAction<PrinterRow[]>>;
  setSpoolRows: Dispatch<SetStateAction<NormalizedSpoolWithMasterRow[]>>;
  setSwatchDraftById: Dispatch<SetStateAction<Record<string, string>>>;
  settingsPageMessageLabels: () => SettingsPageMessageLabels;
  settingsClientHostBaseUrl: string | null;
  settingsClientHostWritePaired: boolean;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  settingsClientTargetGeneration: number | null;
  tauri: boolean;
};

type SettingsReloadOptions = {
  revisionCheck?: boolean;
  silent?: boolean;
};

const SETTINGS_REVISION_DOMAINS = [
  LIBRARY_REVISION_DOMAINS.inventory,
  LIBRARY_REVISION_DOMAINS.catalog,
  LIBRARY_REVISION_DOMAINS.printers,
  LIBRARY_REVISION_DOMAINS.jobs,
] as const;

class SettingsRevisionPollError extends Error {}

export function useSettingsPageReload({
  onDataReloaded,
  setBambuLiveIntegrations,
  setCatalogData,
  setError,
  setLibrarySyncDeviceNameDraft,
  setLibrarySyncHostBaseUrlDraft,
  setLibrarySyncModeDraft,
  setLibrarySyncSettings,
  setLibrarySyncSnapshot,
  setLibrarySyncValidation,
  setLoading,
  setPrinterOverview,
  setPrinters,
  setSpoolRows,
  setSwatchDraftById,
  settingsPageMessageLabels,
  settingsClientHostBaseUrl,
  settingsClientHostWritePaired,
  settingsClientLibraryId,
  settingsClientReadOnly,
  settingsClientTargetGeneration,
  tauri,
}: UseSettingsPageReloadInput) {
  const reloadRequestRef = useRef(0);
  const revisionTrackerRef = useRef(createLibraryRevisionTracker());
  const dataSourceIdentity = buildSettingsCatalogDataSourceIdentity({
    clientReadOnly: settingsClientReadOnly,
    hostBaseUrl: settingsClientHostBaseUrl,
    hostWritePaired: settingsClientHostWritePaired,
    libraryId: settingsClientLibraryId,
    targetGeneration: settingsClientTargetGeneration,
  });
  const dataSourceIdentityRef = useRef(dataSourceIdentity);

  useLayoutEffect(() => {
    const sourceChanged = dataSourceIdentityRef.current !== dataSourceIdentity;
    dataSourceIdentityRef.current = dataSourceIdentity;
    if (sourceChanged) {
      reloadRequestRef.current += 1;
    }
    setCatalogData((current) =>
      reduceSettingsCatalogData(current, {
        type: "target",
        dataSourceIdentity,
      }),
    );
    if (sourceChanged) {
      // Catalog rows are Host-scoped. Never keep Host A's last-good catalog visible while a
      // replacement Host B is unresolved; transient failures for the same identity are handled
      // later by retaining the already displayed rows.
      setSwatchDraftById({});
    }
  }, [dataSourceIdentity, setCatalogData, setSwatchDraftById]);

  useEffect(
    () => () => {
      reloadRequestRef.current += 1;
    },
    [],
  );

  return useCallback(async (options?: SettingsReloadOptions) => {
    if (!tauri) {
      return;
    }
    const requestId = reloadRequestRef.current + 1;
    reloadRequestRef.current = requestId;
    let requestDataSourceIdentity = dataSourceIdentity;
    const requestIsCurrent = () =>
      reloadRequestRef.current === requestId &&
      dataSourceIdentityRef.current === requestDataSourceIdentity;
    let revisionSource: LibraryRevisionSource | null = null;
    let observedTracker: LibraryRevisionTracker | null = null;
    let revisionSignalFailed = false;
    let revisionLoadIncomplete = false;
    try {
      if (options?.revisionCheck) {
        revisionSource = resolveLibraryRevisionSource({
          clientReadOnly: settingsClientReadOnly,
          clientHostBaseUrl: settingsClientHostBaseUrl,
          clientLibraryId: settingsClientLibraryId,
        });
        const revisions = await fetchLibraryDomainRevisionsForSource(
          revisionSource,
        ).catch(() => null);
        if (!requestIsCurrent()) {
          return;
        }

        if (!revisionSource || !revisions) {
          revisionTrackerRef.current = markLibraryRevisionUnavailable(
            revisionTrackerRef.current,
            revisionSource,
          );
          // The caller applies bounded backoff after this fallback. Continue to
          // refresh at that cadence when an older host has no revision route.
          revisionSignalFailed = true;
        } else {
          const observation = observeLibraryDomainRevisions(
            revisionTrackerRef.current,
            revisionSource,
            revisions,
            SETTINGS_REVISION_DOMAINS,
          );
          if (!observation.shouldReload) {
            revisionTrackerRef.current = observation.tracker;
            return;
          }
          observedTracker = observation.tracker;
        }
      }

      if (!options?.silent) {
        setLoading(true);
      }
      const pageData = buildSettingsPageDataModel(
        await loadSettingsPageData({
          onHostLoadError: (loadError) => {
            console.warn(
              "Settings host printer overview unavailable, using cached snapshot.",
              loadError,
            );
          },
        }),
      );
      if (!requestIsCurrent()) {
        return;
      }
      const resolvedDataSourceIdentity =
        buildSettingsCatalogDataSourceIdentity({
          clientReadOnly: pageData.librarySyncSettings.mode === "CLIENT",
          hostBaseUrl: pageData.librarySyncSettings.host_base_url,
          hostWritePaired: pageData.librarySyncSettings.client_auth_paired,
          libraryId: pageData.librarySyncSettings.library_id,
          targetGeneration: pageData.librarySyncSettings.target_generation,
        });
      // The first Settings render intentionally treats an unresolved role as a
      // read-only Client. Once the persisted role has loaded, advance the active
      // request to that authoritative target before React renders it. The layout
      // transition then remains part of this request instead of cancelling and
      // discarding the response that resolved the target.
      dataSourceIdentityRef.current = resolvedDataSourceIdentity;
      requestDataSourceIdentity = resolvedDataSourceIdentity;
      setPrinters(pageData.printers);
      setPrinterOverview(pageData.printerOverview);
      setSpoolRows(pageData.spoolRows);
      setBambuLiveIntegrations(pageData.bambuLiveIntegrations);
      // A rejected Client catalog read is a partial reload, not an authoritative empty
      // catalog. Commit the target resolved by this load atomically; the request token above
      // already rejected genuine stale responses, while same-Host failures retain last-good rows.
      setCatalogData((current) =>
        commitResolvedSettingsCatalogData(current, {
          type: "reload",
          available: pageData.catalogRowsAvailable,
          dataSourceIdentity: resolvedDataSourceIdentity,
          rows: pageData.catalogRows,
        }),
      );
      setLibrarySyncSettings(pageData.librarySyncSettings);
      setLibrarySyncSnapshot(pageData.librarySyncSnapshot);
      if (!options?.silent) {
        setLibrarySyncModeDraft(pageData.librarySyncModeDraft);
        setLibrarySyncDeviceNameDraft(pageData.librarySyncDeviceNameDraft);
        setLibrarySyncHostBaseUrlDraft(pageData.librarySyncHostBaseUrlDraft);
        setLibrarySyncValidation(null);
        if (pageData.catalogRowsAvailable) {
          setSwatchDraftById(pageData.swatchDraftById);
        }
      }
      let secondaryReloadComplete = true;
      try {
        await onDataReloaded?.();
      } catch (secondaryLoadError) {
        // The base settings payload above is already valid and may contain the
        // client's cached Host data. A Host-dependent secondary section must
        // not turn that successful load into an unknown library role or a
        // page-wide load failure while the Host is temporarily unavailable.
        console.warn(
          "Settings filament defaults unavailable after the base settings load.",
          secondaryLoadError,
        );
        secondaryReloadComplete = false;
      }
      if (!requestIsCurrent()) {
        return;
      }
      if (options?.revisionCheck) {
        if (
          observedTracker &&
          pageData.revisionPollComplete &&
          secondaryReloadComplete
        ) {
          revisionTrackerRef.current = observedTracker;
        } else {
          revisionTrackerRef.current = markLibraryRevisionUnavailable(
            revisionTrackerRef.current,
            revisionSource,
          );
          revisionLoadIncomplete = !revisionSignalFailed;
        }
      }
    } catch (loadError) {
      if (
        requestIsCurrent() &&
        !(loadError instanceof SettingsRevisionPollError)
      ) {
        console.error(loadError);
        // A failed local settings read leaves the persisted library role
        // unknown. Clear the last role so library-wide writes fail closed until
        // a later explicit or polling reload succeeds.
        setLibrarySyncSettings(null);
        setError(buildSettingsPageLoadErrorMessage(settingsPageMessageLabels()));
      }
      if (requestIsCurrent() && options?.revisionCheck) {
        revisionTrackerRef.current = markLibraryRevisionUnavailable(
          revisionTrackerRef.current,
          revisionSource,
        );
        throw loadError;
      }
    } finally {
      if (requestIsCurrent() && !options?.silent) {
        setLoading(false);
      }
    }
    if (!requestIsCurrent()) {
      return;
    }
    if (revisionSignalFailed || revisionLoadIncomplete) {
      throw new SettingsRevisionPollError(
        revisionSignalFailed
          ? "Library revision signal is unavailable."
          : "Settings data used a partial cached refresh.",
      );
    }
  }, [
    onDataReloaded,
    setBambuLiveIntegrations,
    setCatalogData,
    setError,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    setLoading,
    setPrinterOverview,
    setPrinters,
    setSpoolRows,
    setSwatchDraftById,
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsPageMessageLabels,
    dataSourceIdentity,
    tauri,
  ]);
}
