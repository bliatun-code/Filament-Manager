import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resolvePrinterModelProfile } from "../lib/printer_profiles";
import { SettingsPrinterEditForm } from "./settings_printer_edit_form";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderEditForm(
  dirty = false,
  security: {
    accessCode?: string;
    accessCodeAction?: "KEEP" | "REPLACE" | "CLEAR";
    accessCodeConfigured?: boolean;
    clientReadOnly?: boolean;
    fingerprint?: string | null;
    liveEnabled?: boolean;
    spkiFingerprint?: string | null;
    trustAction?: "KEEP" | "TRUST_CURRENT" | "CLEAR";
    trustState?: "UNPAIRED" | "TRUSTED" | "CHANGED";
  } = {},
  discovery: {
    candidates?: Array<{
      host: string;
      name?: string | null;
      model?: string | null;
      printer_serial: string;
    }>;
    hasScanned?: boolean;
  } = {},
) {
  return renderToStaticMarkup(
    <SettingsPrinterEditForm
      bambuLiveAccessCode={security.accessCode ?? ""}
      bambuLiveAccessCodeAction={security.accessCodeAction ?? "KEEP"}
      bambuLiveAccessCodeConfigured={security.accessCodeConfigured ?? true}
      bambuLiveEnabled={security.liveEnabled ?? true}
      bambuLiveHost="192.168.1.20"
      bambuLivePrinterSerial="00M09"
      bambuLiveTlsCertificateFingerprint={
        security.fingerprint === undefined
          ? "SHA256:AA:BB:CC:DD"
          : security.fingerprint
      }
      bambuLiveTlsSpkiFingerprint={
        security.spkiFingerprint === undefined
          ? "aa11bb22"
          : security.spkiFingerprint
      }
      bambuLiveTlsTrustAction={security.trustAction ?? "KEEP"}
      bambuLiveTlsTrustState={security.trustState ?? "TRUSTED"}
      bambuDiscoveryCandidates={discovery.candidates ?? []}
      bambuDiscoveryHasScanned={discovery.hasScanned ?? false}
      bambuDiscoveryInterfaceAddress="192.168.1.10"
      bambuDiscoveryScanning={false}
      busy={false}
      dirty={dirty}
      model="Bambu Lab X1 Carbon"
      modelProfile={resolvePrinterModelProfile("Bambu Lab X1 Carbon")}
      name="Workshop"
      printerId="printer/42"
      settingsClientReadOnly={security.clientReadOnly ?? false}
      slotsPerUnit="4"
      supportsBambuLive
      tauri
      t={(_key, fallback = "") => fallback}
      trustedLanInterfaces={[
        { name: "Ethernet", address: "192.168.1.10", label: "Ethernet · 192.168.1.10" },
      ]}
      units="1"
      onBambuLiveAccessCodeChange={() => {}}
      onBambuLiveAccessCodeActionChange={() => {}}
      onBambuLiveEnabledChange={() => {}}
      onBambuLiveHostChange={() => {}}
      onBambuLiveIdentityCheck={() => {}}
      onBambuLivePrinterSerialChange={() => {}}
      onBambuLiveTlsTrustActionChange={() => {}}
      onBambuDiscoveryInterfaceAddressChange={() => {}}
      onFindBambuPrinters={() => {}}
      onRecoverBambuLiveAddress={() => {}}
      onUseDiscoveredBambuPrinter={() => {}}
      onCancel={() => {}}
      onModelChange={() => {}}
      onNameChange={() => {}}
      onSave={() => {}}
      onSlotsPerUnitChange={() => {}}
      onUnitsChange={() => {}}
    />,
  );
}

test("printer edit fields have permanent labels and matching ids", () => {
  const html = renderEditForm();
  const prefix = "settings-printer-printer_x2f_42";
  const fieldSuffixes = [
    "model",
    "name",
    "units",
    "slots-per-unit",
    "live-enabled",
    "live-host",
    "live-access-code",
    "live-printer-serial",
  ];

  for (const suffix of fieldSuffixes) {
    const id = `${prefix}-${suffix}`;
    assert.match(html, new RegExp(`for="${id}"`));
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, />Printer model<\/span>/);
  assert.match(html, />Printer name<\/span>/);
  assert.match(html, />AMS units<\/span>/);
  assert.match(html, />Slots per AMS<\/span>/);
  assert.match(html, />Printer host \/ IP<\/span>/);
  assert.match(html, />Access code<\/span>/);
  assert.match(html, />Printer serial<\/span>/);
  assert.match(html, /data-desktop-visual-qa-target="settings-printer-editor"/);
  assert.match(html, /min-\[720px\]:grid-cols-2/);
  assert.doesNotMatch(html, /md:grid-cols-2/);
  assert.match(html, /^<form/);
  assert.match(html, /<fieldset/);
});

test("printer edit fields reference existing help text", () => {
  const html = renderEditForm();
  const prefix = "settings-printer-printer_x2f_42";
  const configurationHintId = `${prefix}-configuration-hint`;
  const liveHintId = `${prefix}-live-hint`;
  const liveNoteId = `${prefix}-live-note`;

  assert.match(html, new RegExp(`id="${configurationHintId}"`));
  assert.equal(
    (html.match(new RegExp(`aria-describedby="${configurationHintId}"`, "g")) ?? []).length,
    4,
  );
  assert.match(html, new RegExp(`id="${liveHintId}"`));
  assert.match(html, new RegExp(`id="${liveNoteId}"`));
  assert.equal(
    (html.match(new RegExp(`aria-describedby="${liveHintId}"`, "g")) ?? []).length,
    3,
  );
  assert.match(html, new RegExp(`aria-describedby="${liveHintId} ${liveNoteId}"`));
  assert.match(html, /Choose model, name and multi-material capacity/);
  assert.match(html, /Optional local read-only integration/);
  assert.match(html, /secure credential store/);
});

test("Bambu discovery keeps a labeled private-interface selector and gates recovery by identity", () => {
  const matching = renderEditForm(false, {}, {
    candidates: [
      {
        host: "192.168.1.44",
        name: "Workshop printer",
        model: "P1S",
        printer_serial: "00M09",
      },
    ],
  });
  const differentPrinter = renderEditForm(false, {}, {
    candidates: [
      {
        host: "192.168.1.45",
        printer_serial: "OTHER",
      },
    ],
  });
  const clientMode = renderEditForm(false, { clientReadOnly: true });

  assert.match(matching, /Find Bambu printer/);
  assert.match(matching, /<label[^>]*for="settings-bambu-live-discovery-interface"/);
  assert.match(matching, /Network interface \(IP\)/);
  assert.match(matching, /No access code is sent/);
  assert.match(matching, /Workshop printer/);
  assert.match(matching, />Recover saved address<\/button>/);
  assert.match(differentPrinter, /This is not the saved printer/);
  assert.doesNotMatch(differentPrinter, />Recover saved address<\/button>/);
  assert.doesNotMatch(clientMode, /Find Bambu printer/);
});

test("printer edit uses native required fields and keeps save after live configuration", () => {
  const html = renderEditForm(true, {
    accessCode: "new-code",
    accessCodeAction: "REPLACE",
    accessCodeConfigured: false,
    fingerprint: null,
    trustState: "UNPAIRED",
  });
  const liveFieldsetEnd = html.indexOf("</fieldset>");
  const saveButton = html.indexOf("Save changes</button>");

  assert.ok(liveFieldsetEnd >= 0);
  assert.ok(saveButton > liveFieldsetEnd);
  assert.match(html, /<button type="submit"[^>]*>Save changes<\/button>/);
  assert.match(html, /<input[^>]*required=""[^>]*id="settings-printer-printer_x2f_42-model"|id="settings-printer-printer_x2f_42-model"[^>]*required=""/);
  assert.match(html, /autoComplete="new-password"|autocomplete="new-password"/);
  assert.match(html, />Unsaved changes<\/span>/);
});

test("printer edit never renders the stored access code and exposes explicit security actions", () => {
  const html = renderEditForm();

  assert.doesNotMatch(html, /12345678|stored-code/);
  assert.match(html, /Saved securely — enter a new code to replace/);
  assert.match(html, />Access code saved securely<\/span>/);
  assert.match(html, />Remove saved code<\/button>/);
  assert.match(html, />Printer identity<\//);
  assert.match(html, />Trusted<\/span>/);
  assert.match(html, /SHA256:AA:BB:CC:DD/);
  assert.match(html, />Forget trusted identity<\/button>/);
});

test("changed printer identity is an alert with an explicit re-pair action", () => {
  const html = renderEditForm(false, {
    fingerprint: "SHA256:NEW",
    trustState: "CHANGED",
  });

  assert.match(html, /role="alert"/);
  assert.match(html, />Identity changed<\/span>/);
  assert.match(html, /stopped before the access code was sent/);
  assert.match(html, />Trust new identity<\/button>/);
});

test("first-time TLS pairing exposes a credential-free identity check before trust", () => {
  const unchecked = renderEditForm(false, {
    fingerprint: null,
    spkiFingerprint: null,
    trustState: "UNPAIRED",
  });
  const checked = renderEditForm(false, {
    fingerprint: "reviewed-certificate",
    spkiFingerprint: "reviewed-spki",
    trustState: "UNPAIRED",
  });

  assert.match(unchecked, />Check identity<\/button>/);
  assert.doesNotMatch(unchecked, />Trust this identity<\/button>/);
  assert.match(checked, /reviewed-certificate/);
  assert.match(checked, />Check identity<\/button>/);
  assert.match(checked, />Trust this identity<\/button>/);
});

test("client mode shows host-managed security state without credential controls", () => {
  const html = renderEditForm(false, { clientReadOnly: true });

  assert.match(html, /An access code is saved on the host desktop/);
  assert.doesNotMatch(html, /id="settings-printer-printer_x2f_42-live-access-code"/);
  assert.doesNotMatch(html, />Remove saved code<\/button>/);
  assert.doesNotMatch(html, />Check identity<\/button>/);
  assert.doesNotMatch(html, />Forget trusted identity<\/button>/);
});

test("disabled live status keeps existing security controls available for cleanup", () => {
  const html = renderEditForm(false, { liveEnabled: false });
  const prefix = "settings-printer-printer_x2f_42";

  assert.match(html, />Access code saved securely<\/span>/);
  assert.match(html, />Remove saved code<\/button>/);
  assert.match(html, />Forget trusted identity<\/button>/);
  assert.match(html, /Leave disabled to keep the current printer flow unchanged/);
  for (const suffix of ["live-host", "live-access-code", "live-printer-serial"]) {
    const input = html.match(
      new RegExp(`<input[^>]*id="${prefix}-${suffix}"[^>]*>`),
    )?.[0];
    assert.ok(input, `${suffix} remains rendered`);
    assert.doesNotMatch(input, /required=""/);
  }
});

test("printer edit disables save until the normalized draft changes", () => {
  const cleanHtml = renderEditForm(false);
  const dirtyHtml = renderEditForm(true);

  assert.match(cleanHtml, /<button type="submit"[^>]*disabled=""[^>]*>Save changes<\/button>/);
  assert.doesNotMatch(
    dirtyHtml,
    /<button type="submit"[^>]*disabled=""[^>]*>Save changes<\/button>/,
  );
  assert.match(cleanHtml, />No changes to save<\/span>/);
  assert.match(
    dirtyHtml,
    /data-desktop-visual-qa-target="settings-printer-editor-actions"/,
  );
});
