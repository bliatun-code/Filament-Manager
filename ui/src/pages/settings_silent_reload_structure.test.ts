import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_settings_page_reload.ts", import.meta.url),
  "utf8",
);

test("silent settings reloads preserve editable local drafts", () => {
  const snapshotUpdateIndex = source.indexOf(
    "setLibrarySyncSnapshot(pageData.librarySyncSettings.cached_snapshot ?? null);",
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
    "setCatalogMasters",
    "setLibrarySyncSettings",
    "setLibrarySyncSnapshot",
  ]) {
    const setterIndex = source.indexOf(`${setter}(`, updateBlockStart);
    assert.ok(setterIndex >= updateBlockStart && setterIndex < guardIndex, setter);
  }
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
