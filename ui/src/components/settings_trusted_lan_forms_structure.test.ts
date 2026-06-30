import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("Trusted-LAN settings forms use shared form-control chrome", () => {
  const serverPanel = readComponentSource("settings_trusted_lan_server_panel.tsx");
  const pairingPanel = readComponentSource("settings_trusted_lan_pairing_panel.tsx");

  assert.match(serverPanel, /settingsFormControlClass/);
  assert.match(serverPanel, /settingsSectionLabelClass/);
  assert.match(pairingPanel, /settingsFormControlClass/);
  assert.match(pairingPanel, /settingsSectionLabelClass/);
  assert.doesNotMatch(serverPanel, /rounded-lg border border-slate-200 bg-white\/85 px-3 py-2/);
  assert.doesNotMatch(pairingPanel, /rounded-lg border border-slate-200 bg-white px-3 py-2/);
});
