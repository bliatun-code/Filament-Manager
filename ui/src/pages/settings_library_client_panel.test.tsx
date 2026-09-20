import assert from "node:assert/strict";
import test from "node:test";
import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsLibraryClientPanel } from "./settings_library_client_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("offline settings retain Host identity and separate saved pairing from reachability", () => {
  type Props = ComponentProps<typeof SettingsLibraryClientPanel>;
  const noop = () => {};
  const props: Props = {
    librarySyncBusy: false, librarySyncDeviceNameDirty: false, librarySyncDeviceNameDraft: "Desk",
    librarySyncDeviceNameSaveBusy: false, librarySyncHostBaseUrlDraft: "http://workshop.local:4278",
    librarySyncPairingDraft: "", librarySyncSnapshot: null, librarySyncSnapshotBusy: false,
    librarySyncSettings: { host_device_name: "Workshop Host", client_auth_paired: true } as Props["librarySyncSettings"],
    librarySyncValidation: { reachable: false, ok: false, message: "Raw transport failure /api/v1/health", matches_library_id: false } as Props["librarySyncValidation"],
    librarySyncValidationBusy: false,
    libraryVisibility: { clientHasStatusDetails: false, clientHasSnapshot: false } as Props["libraryVisibility"],
    locale: "en", settingsClientHostBaseUrl: "http://workshop.local:4278", settingsClientHostNeedsRepair: false,
    settingsClientHostPairingValid: true, settingsClientHostWritePaired: true, showLibraryClientAdvanced: false,
    tauri: true, t: (_key, fallback) => fallback,
    onClearClientAuth: noop, onDeviceNameChange: noop, onFetchSnapshot: noop, onPairHost: noop,
    onPairingDraftChange: noop, onRenewClientAuth: noop, onSaveDeviceName: noop, onToggleAdvanced: noop,
  };
  const html = renderToStaticMarkup(<SettingsLibraryClientPanel {...props} />);
  assert.match(html, /Workshop Host/);
  assert.match(html, /Host is unavailable/);
  assert.match(html, />Refresh<\/button>/);
  assert.match(html, />Paired<\/span>/);
  assert.doesNotMatch(html, /Raw transport failure|\/api\/v1\/health|Re-pair required/);
});
