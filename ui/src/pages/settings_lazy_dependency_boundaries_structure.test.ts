import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const typeOnlyComponentImports = [
  ["settings_catalog_route_props.ts", "SettingsCatalogRefreshPanel"],
  ["settings_catalog_route_props.ts", "SettingsMissingSwatchesPanel"],
  ["settings_library_browsers_panel_props.ts", "SettingsTrustedLanBrowsersPanel"],
  ["settings_library_client_panel_props.ts", "SettingsLibraryClientPanel"],
  ["settings_library_pairing_panel_props.ts", "SettingsTrustedLanPairingPanel"],
  ["settings_library_role_modal_route_props.ts", "SettingsLibraryRoleModalRoute"],
  ["settings_library_role_panel_props.ts", "SettingsLibraryRolePanel"],
  ["settings_library_server_panel_props.ts", "SettingsTrustedLanServerPanel"],
  ["settings_library_webapp_control_props.ts", "SettingsLibraryWebappControl"],
] as const;

test("settings prop builders do not eagerly load lazy tab components", () => {
  for (const [fileName, componentName] of typeOnlyComponentImports) {
    const source = readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
    assert.match(
      source,
      new RegExp(`import type \\{ ${componentName} \\} from`),
      `${fileName} must import ${componentName} as a type`,
    );
    assert.doesNotMatch(
      source,
      new RegExp(`import \\{ ${componentName} \\} from`),
      `${fileName} must not create a runtime dependency on ${componentName}`,
    );
  }
});

test("settings diagnostics state does not eagerly load the printer presentation model", () => {
  const source = readFileSync(
    new URL("./use_settings_bambu_live_diagnostics.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /buildDiagnosticCaptureSession/);
  assert.doesNotMatch(source, /settings_bambu_live_diagnostics_model/);
});
