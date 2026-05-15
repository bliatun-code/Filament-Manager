import assert from "node:assert/strict";
import test from "node:test";

import type { TrustedLanCompanionStatus } from "../lib/tauri_client";
import {
  buildTrustedLanActionMessage,
  buildTrustedLanConfigMessage,
  buildTrustedLanCompanionModel,
  buildTrustedLanNoPrivateInterfaceMessage,
  findNewTrustedLanActiveBrowserIds,
  buildTrustedLanPairedBrowserListModel,
  isTrustedLanNetworkDraftDirty,
  resolveTrustedLanInterfaceAddressDraft,
} from "./settings_companion_model";

function t(_key: string, fallback: string) {
  return fallback;
}

function createTrustedLanStatus(
  overrides: Partial<TrustedLanCompanionStatus> = {},
): TrustedLanCompanionStatus {
  return {
    enabled: false,
    selected_interface_name: null,
    selected_interface_address: null,
    bind_address: null,
    base_url: null,
    shell_url: null,
    listen_port: 4278,
    shell_reachable: false,
    health_error: null,
    running: false,
    last_error: null,
    api_version: "v1",
    auth_mode: "pairing-session",
    ...overrides,
  };
}

test("buildTrustedLanCompanionModel reports the scaffold as disabled by default", () => {
  const model = buildTrustedLanCompanionModel({
    trustedLanStatus: createTrustedLanStatus(),
    statusLoading: false,
    actionBusy: false,
    t,
  });

  assert.equal(model.enabled, false);
  assert.equal(model.reachable, false);
  assert.equal(model.statusTone, "idle");
  assert.equal(model.statusPillLabel, "Off");
  assert.equal(model.statusLabel, "Disabled by default");
  assert.equal(
    model.statusHint,
    "Trusted-LAN access stays off until you explicitly enable it from the desktop app.",
  );
  assert.equal(model.interfaceValue, "Not selected");
  assert.equal(model.portValue, "4278");
  assert.equal(
    model.portHint,
    "Use a fixed port so pairing links and exact host/origin checks stay predictable.",
  );
  assert.equal(
    model.shellUrlValue,
    "Not available until trusted-LAN mode is enabled",
  );
  assert.equal(model.authLabel, "Per-browser pairing");
  assert.equal(model.pairActionDisabled, true);
  assert.equal(model.configActionDisabled, false);
});

test("buildTrustedLanCompanionModel formats selected interface and URL details", () => {
  const model = buildTrustedLanCompanionModel({
    trustedLanStatus: createTrustedLanStatus({
      enabled: true,
      running: true,
      shell_reachable: true,
      selected_interface_name: "Wi-Fi",
      selected_interface_address: "192.168.1.50",
      bind_address: "192.168.1.50:4278",
      base_url: "http://192.168.1.50:4278",
      shell_url: "http://192.168.1.50:4278/companion",
    }),
    statusLoading: false,
    actionBusy: false,
    t,
  });

  assert.equal(model.statusTone, "live");
  assert.equal(model.statusPillLabel, "Live");
  assert.equal(model.statusLabel, "Running");
  assert.equal(
    model.statusHint,
    "Trusted-LAN companion is listening on the selected private interface.",
  );
  assert.equal(model.interfaceValue, "Wi-Fi (192.168.1.50)");
  assert.equal(model.interfaceHint, "192.168.1.50:4278");
  assert.equal(model.shellUrlValue, "http://192.168.1.50:4278/companion");
  assert.equal(
    model.shellUrlHint,
    "This exact LAN URL will later be used for browser pairing on your trusted network.",
  );
  assert.equal(model.pairActionDisabled, false);
});

test("buildTrustedLanCompanionModel keeps the live status visible while refreshing", () => {
  const loadingModel = buildTrustedLanCompanionModel({
    trustedLanStatus: createTrustedLanStatus({
      enabled: true,
      running: true,
      shell_reachable: true,
      shell_url: "http://192.168.1.50:4278/companion",
    }),
    statusLoading: true,
    actionBusy: false,
    t,
  });
  const busyModel = buildTrustedLanCompanionModel({
    trustedLanStatus: createTrustedLanStatus({
      enabled: true,
      running: true,
      shell_reachable: true,
      shell_url: "http://192.168.1.50:4278/companion",
    }),
    statusLoading: false,
    actionBusy: true,
    t,
  });

  assert.equal(loadingModel.statusTone, "live");
  assert.equal(loadingModel.statusPillLabel, "Live");
  assert.equal(loadingModel.statusLabel, "Running");
  assert.equal(loadingModel.pairActionDisabled, true);
  assert.equal(loadingModel.configActionDisabled, true);
  assert.equal(busyModel.pairActionDisabled, true);
  assert.equal(busyModel.configActionDisabled, true);
});

test("buildTrustedLanCompanionModel shows starting while enabled server health is still settling", () => {
  const model = buildTrustedLanCompanionModel({
    trustedLanStatus: createTrustedLanStatus({
      enabled: true,
      running: true,
      shell_reachable: false,
      shell_url: "http://192.168.1.50:4278/companion",
    }),
    statusLoading: true,
    actionBusy: false,
    t,
  });

  assert.equal(model.statusTone, "warn");
  assert.equal(model.statusPillLabel, "Checking");
  assert.equal(model.statusLabel, "Starting...");
});

test("buildTrustedLanCompanionModel still shows loading when no status snapshot exists yet", () => {
  const model = buildTrustedLanCompanionModel({
    trustedLanStatus: null,
    statusLoading: true,
    actionBusy: false,
    t,
  });

  assert.equal(model.statusTone, "idle");
  assert.equal(model.statusPillLabel, "Checking");
  assert.equal(model.statusLabel, "Loading...");
});

test("buildTrustedLanCompanionModel marks enabled but unreachable servers as warn", () => {
  const model = buildTrustedLanCompanionModel({
    trustedLanStatus: createTrustedLanStatus({
      enabled: true,
      running: true,
      shell_reachable: false,
    }),
    statusLoading: false,
    actionBusy: false,
    t,
  });

  assert.equal(model.statusTone, "warn");
  assert.equal(model.statusPillLabel, "Check");
  assert.equal(model.statusLabel, "Not responding");
});

test("resolveTrustedLanInterfaceAddressDraft prefers the saved trusted-LAN interface", () => {
  const draft = resolveTrustedLanInterfaceAddressDraft(
    createTrustedLanStatus({
      selected_interface_address: "192.168.1.50",
    }),
    [
      {
        name: "Ethernet",
        address: "192.168.1.40",
        label: "Ethernet (192.168.1.40)",
      },
    ],
  );

  assert.equal(draft, "192.168.1.50");
});

test("resolveTrustedLanInterfaceAddressDraft falls back to the first detected interface", () => {
  const draft = resolveTrustedLanInterfaceAddressDraft(createTrustedLanStatus(), [
    {
      name: "Wi-Fi",
      address: "192.168.1.25",
      label: "Wi-Fi (192.168.1.25)",
    },
    {
      name: "Ethernet",
      address: "192.168.1.30",
      label: "Ethernet (192.168.1.30)",
    },
  ]);

  assert.equal(draft, "192.168.1.25");
});

test("resolveTrustedLanInterfaceAddressDraft stays empty when no LAN interface is available", () => {
  const draft = resolveTrustedLanInterfaceAddressDraft(createTrustedLanStatus(), []);

  assert.equal(draft, "");
});

test("isTrustedLanNetworkDraftDirty compares selected interface and parsed port", () => {
  const status = createTrustedLanStatus({
    listen_port: 4278,
    selected_interface_address: "192.168.1.50",
  });

  assert.equal(
    isTrustedLanNetworkDraftDirty({
      interfaceAddressDraft: "192.168.1.50",
      portDraft: "4278",
      trustedLanStatus: status,
    }),
    false,
  );
  assert.equal(
    isTrustedLanNetworkDraftDirty({
      interfaceAddressDraft: "192.168.1.51",
      portDraft: "4278",
      trustedLanStatus: status,
    }),
    true,
  );
  assert.equal(
    isTrustedLanNetworkDraftDirty({
      interfaceAddressDraft: "192.168.1.50",
      portDraft: "5000",
      trustedLanStatus: status,
    }),
    true,
  );
  assert.equal(
    isTrustedLanNetworkDraftDirty({
      interfaceAddressDraft: "",
      portDraft: "invalid",
      trustedLanStatus: null,
    }),
    false,
  );
});

test("buildTrustedLanPairedBrowserListModel keeps active browsers first and human-readable", () => {
  const model = buildTrustedLanPairedBrowserListModel({
    browsers: [
      {
        id: "revoked-browser",
        display_name: "Workshop iPad",
        paired_at: "2026-03-28T17:30:00.000Z",
        last_seen_at: "2026-03-28T18:30:00.000Z",
        last_origin: "http://192.168.86.25:4278",
        revoked_at: "2026-03-28T18:45:00.000Z",
      },
      {
        id: "active-recent",
        display_name: "Kitchen Phone",
        paired_at: "2026-03-28T18:00:00.000Z",
        last_seen_at: "2026-03-28T19:59:00.000Z",
        last_origin: "http://192.168.86.25:4278/companion",
        revoked_at: null,
      },
      {
        id: "active-new",
        display_name: "MacBook Air",
        paired_at: "2026-03-28T19:20:00.000Z",
        last_seen_at: null,
        last_origin: null,
        revoked_at: null,
      },
    ],
    locale: "en",
    t,
    nowMs: Date.parse("2026-03-28T20:00:00.000Z"),
  });

  assert.deepEqual(
    model.activeRows.map((row) => row.id),
    ["active-recent", "active-new"],
  );
  assert.deepEqual(
    model.revokedRows.map((row) => row.id),
    ["revoked-browser"],
  );
  assert.equal(model.activeRows[0]?.activityLabel, "Last seen 1 min ago");
  assert.equal(model.activeRows[0]?.originLabel, "192.168.86.25:4278");
  assert.equal(model.activeRows[1]?.activityLabel, "Waiting for first renewal");
  assert.equal(model.activeRows[1]?.initials, "MA");
  assert.equal(model.revokedRows[0]?.statusLabel, "Revoked");
  assert.match(model.revokedRows[0]?.activityLabel ?? "", /^Revoked /);
});

test("buildTrustedLanPairedBrowserListModel uses Norwegian relative wording and fallback initials", () => {
  const model = buildTrustedLanPairedBrowserListModel({
    browsers: [
      {
        id: "unnamed",
        display_name: " ",
        paired_at: "2026-03-28T18:00:00.000Z",
        last_seen_at: "2026-03-28T19:55:00.000Z",
        last_origin: "192.168.86.25:4278",
        revoked_at: null,
      },
    ],
    locale: "nb",
    t,
    nowMs: Date.parse("2026-03-28T20:00:00.000Z"),
  });

  assert.equal(model.activeRows[0]?.displayName, "Paired browser");
  assert.equal(model.activeRows[0]?.initials, "PB");
  assert.equal(model.activeRows[0]?.activityLabel, "Last seen 5 min siden");
  assert.equal(model.activeRows[0]?.originLabel, "192.168.86.25:4278");
});

test("findNewTrustedLanActiveBrowserIds detects newly paired browsers only", () => {
  const ids = findNewTrustedLanActiveBrowserIds(
    [
      {
        id: "existing-active",
        display_name: "Existing",
        paired_at: "2026-03-28T18:00:00.000Z",
        last_seen_at: "2026-03-28T19:00:00.000Z",
        last_origin: "http://192.168.86.25:4278",
        revoked_at: null,
      },
      {
        id: "already-revoked",
        display_name: "Old device",
        paired_at: "2026-03-28T16:00:00.000Z",
        last_seen_at: "2026-03-28T17:00:00.000Z",
        last_origin: "http://192.168.86.25:4278",
        revoked_at: "2026-03-28T17:30:00.000Z",
      },
    ],
    [
      {
        id: "existing-active",
        display_name: "Existing",
        paired_at: "2026-03-28T18:00:00.000Z",
        last_seen_at: "2026-03-28T20:00:00.000Z",
        last_origin: "http://192.168.86.25:4278",
        revoked_at: null,
      },
      {
        id: "new-active",
        display_name: "Kitchen phone",
        paired_at: "2026-03-28T20:00:00.000Z",
        last_seen_at: null,
        last_origin: null,
        revoked_at: null,
      },
      {
        id: "already-revoked",
        display_name: "Old device",
        paired_at: "2026-03-28T16:00:00.000Z",
        last_seen_at: "2026-03-28T17:00:00.000Z",
        last_origin: "http://192.168.86.25:4278",
        revoked_at: "2026-03-28T17:30:00.000Z",
      },
    ],
  );

  assert.deepEqual(ids, ["new-active"]);
});

test("buildTrustedLanActionMessage returns stable action feedback copy", () => {
  const labels = {
    allBrowsersRevoked: "All trusted-LAN browsers revoked.",
    browserRevoked: "Trusted-LAN browser revoked.",
    pairingCopied: "Trusted-LAN pairing link copied.",
    pairingCreated: "Trusted-LAN pairing link created and copied.",
  };

  assert.equal(buildTrustedLanActionMessage("pairingCreated", labels), labels.pairingCreated);
  assert.equal(buildTrustedLanActionMessage("pairingCopied", labels), labels.pairingCopied);
  assert.equal(buildTrustedLanActionMessage("browserRevoked", labels), labels.browserRevoked);
  assert.equal(
    buildTrustedLanActionMessage("allBrowsersRevoked", labels),
    labels.allBrowsersRevoked,
  );
});

test("buildTrustedLanConfigMessage returns stable configuration feedback copy", () => {
  const labels = {
    disabled: "Web app server turned off.",
    enabled: "Web app server turned on.",
    enabledPending: "Web app server is starting. Refresh status if it takes a moment.",
    networkSaved: "Web app network settings saved.",
    starting: "Starting web app server...",
  };

  assert.equal(buildTrustedLanConfigMessage("enabled", labels), labels.enabled);
  assert.equal(buildTrustedLanConfigMessage("disabled", labels), labels.disabled);
  assert.equal(buildTrustedLanConfigMessage("networkSaved", labels), labels.networkSaved);
  assert.equal(buildTrustedLanConfigMessage("starting", labels), labels.starting);
  assert.equal(buildTrustedLanConfigMessage("enabledPending", labels), labels.enabledPending);
});

test("buildTrustedLanNoPrivateInterfaceMessage returns stable validation copy", () => {
  assert.equal(
    buildTrustedLanNoPrivateInterfaceMessage({
      noPrivateInterface: "Pick a private interface before turning on the web app server.",
    }),
    "Pick a private interface before turning on the web app server.",
  );
});
