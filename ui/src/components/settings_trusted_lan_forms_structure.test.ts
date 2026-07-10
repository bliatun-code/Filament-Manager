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
  assert.match(
    pairingPanel,
    /id="trusted-lan-pairing-panel"[\s\S]*?className="mt-4 scroll-mt-24"/,
  );
  assert.doesNotMatch(serverPanel, /rounded-lg border border-slate-200 bg-white\/85 px-3 py-2/);
  assert.doesNotMatch(pairingPanel, /rounded-lg border border-slate-200 bg-white px-3 py-2/);
});

test("Trusted-LAN network details use one disclosure with a nested editor", () => {
  const serverPanel = readComponentSource("settings_trusted_lan_server_panel.tsx");

  assert.match(serverPanel, /aria-controls="trusted-lan-network-details"/);
  assert.match(serverPanel, /id="trusted-lan-network-details" className="scroll-mt-24/);
  assert.match(serverPanel, /aria-controls="trusted-lan-network-editor"/);
  assert.match(serverPanel, /id="trusted-lan-network-editor"[\s\S]*scroll-mt-24/);
  assert.match(serverPanel, /settings\.trustedLanNetworkDetails/);
  assert.doesNotMatch(serverPanel, /settings\.trustedLanShowNetwork/);
});
