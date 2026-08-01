import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(
  new URL("./tauri_printer_client.ts", import.meta.url),
  "utf8",
);
const editDraftSource = readFileSync(
  new URL("../pages/use_settings_printer_edit_draft.ts", import.meta.url),
  "utf8",
);

function typeBody(typeName: string): string {
  const match = clientSource.match(
    new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\};`),
  );
  assert.ok(match, `missing ${typeName}`);
  return match[1];
}

test("Bambu live snapshots expose credential state without returning the access code", () => {
  const settings = typeBody("BambuLiveIntegrationSettings");

  assert.match(settings, /access_code_configured\?: boolean/);
  assert.doesNotMatch(settings, /\n\s*access_code\??:/);
  assert.match(settings, /tls_trust_state\?: BambuTlsTrustState/);
  assert.match(settings, /tls_certificate_fingerprint\?: string \| null/);
  assert.match(settings, /tls_spki_fingerprint\?: string \| null/);
  assert.doesNotMatch(editDraftSource, /liveConfig\?\.access_code\b/);
});

test("Bambu live writes require explicit credential and trust actions", () => {
  const input = typeBody("SaveBambuLiveIntegrationInput");

  assert.match(input, /access_code_action: BambuAccessCodeAction/);
  assert.match(input, /access_code\?: string \| null/);
  assert.match(input, /tls_trust_action: BambuTlsTrustAction/);
  assert.match(input, /expected_tls_certificate_sha256\?: string \| null/);
  assert.match(input, /expected_tls_spki_sha256\?: string \| null/);
  assert.match(clientSource, /access_code_action: input\.access_code_action/);
  assert.match(clientSource, /tls_trust_action: input\.tls_trust_action/);
  assert.match(clientSource, /"inspect_bambu_live_tls_identity"/);
});

test("Bambu discovery and address recovery never expose or submit credentials", () => {
  for (const typeName of [
    "BambuPrinterDiscoveryCandidate",
    "RecoverBambuLiveHostInput",
    "BambuLiveHostRecovery",
  ]) {
    const value = typeBody(typeName);
    assert.doesNotMatch(value, /access_code|credential|token|password/i);
  }
  assert.match(clientSource, /"discover_bambu_live_printers"/);
  assert.match(clientSource, /"recover_bambu_live_host"/);
  const recoveryCall = clientSource.match(
    /export async function recoverBambuLiveHost\([\s\S]*?\n\}/,
  )?.[0];
  assert.ok(recoveryCall, "missing Bambu address recovery client call");
  assert.doesNotMatch(recoveryCall, /access_code|credential|token|password/i);
});
