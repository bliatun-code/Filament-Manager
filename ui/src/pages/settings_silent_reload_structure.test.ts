import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_settings_page_reload.ts", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");
const pollingSource = readFileSync(
  new URL("./use_settings_silent_reload.ts", import.meta.url),
  "utf8",
);
const initialLoadSource = readFileSync(
  new URL("./use_settings_initial_load.ts", import.meta.url),
  "utf8",
);
const libraryActionsSource = readFileSync(
  new URL("./use_settings_library_actions_runtime.ts", import.meta.url),
  "utf8",
);

test("silent settings reloads preserve editable local drafts", () => {
  const snapshotUpdateIndex = source.indexOf(
    "setLibrarySyncSnapshot(pageData.librarySyncSnapshot);",
  );
  const draftGuardIndex = source.indexOf(
    "if (!options?.silent) {",
    snapshotUpdateIndex,
  );
  const draftGuardEndIndex = source.indexOf("\n      }\n    } catch", draftGuardIndex);
  const guardedDraftBlock = source.slice(draftGuardIndex, draftGuardEndIndex);

  assert.ok(snapshotUpdateIndex > 0);
  assert.ok(draftGuardIndex > snapshotUpdateIndex);
  assert.ok(draftGuardEndIndex > draftGuardIndex);
  assert.match(guardedDraftBlock, /setLibrarySyncModeDraft/);
  assert.match(guardedDraftBlock, /setLibrarySyncDeviceNameDraft/);
  assert.match(guardedDraftBlock, /setLibrarySyncHostBaseUrlDraft/);
  assert.match(guardedDraftBlock, /setLibrarySyncValidation/);
  assert.match(guardedDraftBlock, /setSwatchDraftById/);
});

test("silent settings reloads still update persisted and live datasets", () => {
  const updateBlockStart = source.indexOf("setPrinters(pageData.printers);");
  const guardIndex = source.indexOf("if (!options?.silent) {", updateBlockStart);

  assert.ok(updateBlockStart > 0);
  assert.ok(guardIndex > updateBlockStart);
  for (const setter of [
    "setPrinters",
    "setPrinterOverview",
    "setSpoolRows",
    "setBambuLiveIntegrations",
    "setCatalogData",
    "setLibrarySyncSettings",
    "setLibrarySyncSnapshot",
  ]) {
    const setterIndex = source.indexOf(`${setter}(`, updateBlockStart);
    assert.ok(setterIndex >= updateBlockStart && setterIndex < guardIndex, setter);
  }
});

test("catalog reloads use target-aware freshness state and guard editable drafts", () => {
  assert.match(source, /reduceSettingsCatalogData\(current, \{\s*type: "target"/);
  assert.match(
    source,
    /commitResolvedSettingsCatalogData\(current, \{\s*type: "reload",\s*available: pageData\.catalogRowsAvailable/,
  );
  assert.match(source, /dataSourceIdentityRef\.current = resolvedDataSourceIdentity/);
  assert.match(source, /requestDataSourceIdentity = resolvedDataSourceIdentity/);
  assert.match(
    source,
    /if \(pageData\.catalogRowsAvailable\) \{\s*setSwatchDraftById\(pageData\.swatchDraftById\)/,
  );
  assert.match(source, /sourceChanged[\s\S]*?setSwatchDraftById\(\{\}\)/);
});

test("settings pauses background reload waves during a catalog refresh", () => {
  assert.match(settingsSource, /enabled: !catalogRefreshBusy/);
  assert.match(pollingSource, /enabled: tauri && enabled/);
});

test("a resolved first load is not repeated solely because its target identity changed", () => {
  assert.match(
    settingsSource,
    /catalogDataSourceIdentity === settingsCatalogTargetIdentity &&\s*catalogLoadStatus !== "pending"/,
  );
  assert.match(initialLoadSource, /if \(!dataSourceReady\) \{\s*void reloadSettings\(\)/);
});

test("long catalog writes lock library target changes until their result is definitive", () => {
  assert.match(
    libraryActionsSource,
    /librarySyncInteractionBusy =\s*librarySyncBusy \|\| catalogRefreshBusy/,
  );
  assert.match(
    libraryActionsSource,
    /useSettingsLibrarySyncActions\(\{[\s\S]*?librarySyncBusy: librarySyncInteractionBusy/,
  );
  assert.match(
    settingsSource,
    /librarySyncBusy: librarySyncInteractionBusy/,
  );
});

test("a completed settings data reload also refreshes filament standards", () => {
  const inventoryUpdateIndex = source.indexOf("setSpoolRows(pageData.spoolRows);");
  const standardsReloadIndex = source.indexOf("await onDataReloaded?.();");
  const revisionCommitIndex = source.indexOf(
    "revisionTrackerRef.current = observedTracker;",
  );

  assert.ok(inventoryUpdateIndex > 0);
  assert.ok(standardsReloadIndex > inventoryUpdateIndex);
  assert.ok(revisionCommitIndex > standardsReloadIndex);
});

test("a failed secondary filament-default refresh preserves loaded settings and role", () => {
  const secondaryTryIndex = source.indexOf(
    "let secondaryReloadComplete = true;",
  );
  const standardsReloadIndex = source.indexOf(
    "await onDataReloaded?.();",
    secondaryTryIndex,
  );
  const secondaryCatchIndex = source.indexOf(
    "} catch (secondaryLoadError) {",
    standardsReloadIndex,
  );
  const currentRequestCheckIndex = source.indexOf(
    "if (!requestIsCurrent()) {",
    secondaryCatchIndex,
  );
  const secondaryFailureBlock = source.slice(
    secondaryCatchIndex,
    currentRequestCheckIndex,
  );

  assert.ok(secondaryTryIndex > source.indexOf("setLibrarySyncSettings(pageData.librarySyncSettings);"));
  assert.ok(standardsReloadIndex > secondaryTryIndex);
  assert.ok(secondaryCatchIndex > standardsReloadIndex);
  assert.ok(currentRequestCheckIndex > secondaryCatchIndex);
  assert.match(secondaryFailureBlock, /console\.warn/);
  assert.match(secondaryFailureBlock, /secondaryReloadComplete = false/);
  assert.doesNotMatch(secondaryFailureBlock, /setLibrarySyncSettings\(null\)/);
  assert.doesNotMatch(secondaryFailureBlock, /setError\(/);
});

test("an incomplete secondary refresh keeps revision polling in fallback mode", () => {
  assert.match(
    source,
    /observedTracker &&\s*pageData\.revisionPollComplete &&\s*secondaryReloadComplete/,
  );
});

test("silent settings polling gates full reads on a library revision signal", () => {
  assert.match(source, /fetchLibraryDomainRevisionsForSource/);
  assert.match(source, /SETTINGS_REVISION_DOMAINS/);
  assert.match(source, /revisionPollComplete/);
  assert.match(source, /observeLibraryDomainRevisions/);
});

test("settings keeps periodic fallback reads while revisions are unavailable", () => {
  assert.match(source, /revisionSignalFailed = true/);
  assert.doesNotMatch(source, /status !== "unavailable"/);
  assert.doesNotMatch(source, /Library revision signal remains unavailable/);
});

test("a failed settings read clears the persisted role before any later write", () => {
  const catchIndex = source.indexOf("} catch (loadError) {");
  const roleClearIndex = source.indexOf("setLibrarySyncSettings(null);", catchIndex);
  const errorIndex = source.indexOf(
    "setError(buildSettingsPageLoadErrorMessage",
    catchIndex,
  );

  assert.ok(catchIndex > 0);
  assert.ok(roleClearIndex > catchIndex);
  assert.ok(errorIndex > roleClearIndex);
});

test("settings reloads discard stale role targets without dropping the replacement load", () => {
  assert.match(source, /const reloadRequestRef = useRef\(0\)/);
  assert.match(
    source,
    /const dataSourceIdentity = buildSettingsCatalogDataSourceIdentity\(/,
  );
  assert.match(source, /settingsClientTargetGeneration/);
  assert.match(source, /settingsClientHostWritePaired/);
  assert.match(
    source,
    /const pageData = buildSettingsPageDataModel\([\s\S]*?if \(!requestIsCurrent\(\)\) \{\s*return;\s*\}[\s\S]*?setPrinters\(pageData\.printers\)/,
  );
  assert.doesNotMatch(source, /silentReloadInFlightRef\.current\) \{[\s\S]*?return;/);
});
