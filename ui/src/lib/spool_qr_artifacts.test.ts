import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpoolQrArtifacts,
  resolveSpoolQrCompanionShellUrl,
} from "./spool_qr_artifacts";
import type { TrustedLanCompanionStatus } from "./tauri_client";

function trustedLanStatus(
  overrides: Partial<TrustedLanCompanionStatus> = {},
): TrustedLanCompanionStatus {
  return {
    enabled: true,
    selected_interface_name: "en0",
    selected_interface_address: "192.168.1.20",
    bind_address: "192.168.1.20",
    base_url: "http://192.168.1.20:4278",
    shell_url: "http://192.168.1.20:4278/companion",
    listen_port: 4278,
    shell_reachable: true,
    health_error: null,
    running: true,
    last_error: null,
    api_version: "1",
    auth_mode: "pairing",
    ...overrides,
  };
}

test("resolveSpoolQrCompanionShellUrl prefers the client host shell in client mode", async () => {
  let trustedLanCalls = 0;
  const shellUrl = await resolveSpoolQrCompanionShellUrl(
    {
      clientReadOnly: true,
      clientHostBaseUrl: "http://192.168.1.50:4278",
    },
    {
      loadTrustedLanStatus: async () => {
        trustedLanCalls += 1;
        return trustedLanStatus();
      },
    },
  );

  assert.equal(shellUrl, "http://192.168.1.50:4278/companion");
  assert.equal(trustedLanCalls, 0);
});

test("resolveSpoolQrCompanionShellUrl falls back to trusted LAN shell outside client mode", async () => {
  const shellUrl = await resolveSpoolQrCompanionShellUrl(
    {
      clientReadOnly: false,
      clientHostBaseUrl: "http://192.168.1.50:4278",
    },
    {
      loadTrustedLanStatus: async () => trustedLanStatus(),
    },
  );

  assert.equal(shellUrl, "http://192.168.1.20:4278/companion");
});

test("buildSpoolQrArtifacts builds a companion QR artifact when a shell URL is available", async () => {
  const artifact = await buildSpoolQrArtifacts(
    {
      spoolId: " spool_1 ",
      mode: "companion",
      clientReadOnly: false,
    },
    {
      loadTrustedLanStatus: async () => trustedLanStatus(),
      buildQrDataUrl: async (payload) => `qr:${payload}`,
    },
  );

  assert.equal(artifact.qrReference, "spool_1");
  assert.equal(artifact.qrMode, "companion");
  assert.equal(
    artifact.qrPayload,
    "http://192.168.1.20:4278/companion?spool_qr=v1%3Aspool_1",
  );
  assert.equal(artifact.qrDataUrl, `qr:${artifact.qrPayload}`);
  assert.equal(artifact.qrTarget, artifact.qrPayload);
  assert.equal(artifact.companionShellUrl, "http://192.168.1.20:4278/companion");
});

test("buildSpoolQrArtifacts falls back to portable QR when companion status is unavailable", async () => {
  const artifact = await buildSpoolQrArtifacts(
    {
      spoolId: "spool_1",
      mode: "companion",
      clientReadOnly: false,
    },
    {
      loadTrustedLanStatus: async () => {
        throw new Error("trusted LAN unavailable");
      },
      buildQrDataUrl: async (payload) => `qr:${payload}`,
    },
  );

  assert.equal(artifact.qrMode, "portable");
  assert.equal(artifact.qrPayload, "v1:spool_1");
  assert.equal(artifact.qrDataUrl, "qr:v1:spool_1");
  assert.equal(artifact.companionShellUrl, null);
});
