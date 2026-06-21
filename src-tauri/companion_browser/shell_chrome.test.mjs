import test from "node:test";
import assert from "node:assert/strict";

import {
  renderDetailModalShell,
  renderPhoneBottomNav,
  renderTopbar,
  renderTrustedLanPairingApp,
} from "./shell_chrome.js";

const rootFlowItems = [
  { flow: "storage", label: "Inventory", meta: "12 visible", compactMeta: "12" },
  { flow: "loans", label: "Loans", meta: "2 active", compactMeta: "2" },
  { flow: "printers", label: "Printers", meta: "3 configured", compactMeta: "3" },
  { flow: "settings", label: "Settings", meta: "Trusted-LAN session", compactMeta: "On" },
];

function createSelectedSpool() {
  return {
    spool: {
      id: "spool-1",
      remaining_g: 720,
      location_id: "Shelf A",
    },
    master: {
      material: "PLA",
      filament_name: "Basic",
      color_name: "White",
      hex_color: "#ffffff",
    },
  };
}

test("topbar renders the tablet root switch with all primary flows", () => {
  const html = renderTopbar({
    layoutMode: "tablet",
    activeRootFlow: "storage",
    activeRootFlowItem: rootFlowItems[0],
    rootFlowItems,
    busy: false,
    statusMessage: "Saving...",
    statusTone: "default",
    escapeHtml: (value) => String(value ?? ""),
  });

  assert.match(html, /Inventory/);
  assert.match(html, /12 visible/);
  assert.match(html, /Loans/);
  assert.match(html, /Printers/);
  assert.match(html, /Settings/);
  assert.doesNotMatch(html, /Refresh companion data/);
  assert.match(html, /12 visible/);
  assert.doesNotMatch(html, /<h1 class="app-title">/);
});

test("desktop topbar stays a utility strip instead of repeating the page heading or refresh control", () => {
  const html = renderTopbar({
    layoutMode: "desktop",
    activeRootFlow: "storage",
    activeRootFlowItem: rootFlowItems[0],
    rootFlowItems,
    busy: false,
    statusMessage: "",
    statusTone: "default",
    escapeHtml: (value) => String(value ?? ""),
  });

  assert.match(html, /topbar-utility-spacer/);
  assert.doesNotMatch(html, /Refresh companion data/);
  assert.doesNotMatch(html, /<h1 class="app-title">Inventory/);
});

test("phone topbar drops the extra desktop summary chrome and shared refresh action", () => {
  const html = renderTopbar({
    layoutMode: "phone",
    activeRootFlow: "storage",
    activeRootFlowItem: rootFlowItems[0],
    rootFlowItems,
    busy: false,
    statusMessage: "",
    statusTone: "default",
    escapeHtml: (value) => String(value ?? ""),
  });

  assert.doesNotMatch(html, /Active flow/);
  assert.doesNotMatch(html, /Desktop-owned/);
  assert.doesNotMatch(html, /Refresh/);
  assert.doesNotMatch(html, /Forget/);
});

test("phone bottom nav renders just the four primary flow labels", () => {
  const html = renderPhoneBottomNav({
    activeRootFlow: "loans",
    rootFlowItems,
    escapeHtml: (value) => String(value ?? ""),
  });

  assert.match(html, /data-root-flow="storage"/);
  assert.match(html, /data-root-flow="loans"/);
  assert.match(html, /data-root-flow="printers"/);
  assert.match(html, /data-root-flow="settings"/);
  assert.doesNotMatch(html, />On</);
});

test("detail modal shell wraps the provided body and close affordance", () => {
  const html = renderDetailModalShell({
    layoutMode: "desktop",
    selectedSpool: createSelectedSpool(),
    detailBusy: false,
    detailBusyLabel: "",
    body: "<div>Detail body</div>",
    escapeHtml: (value) => String(value ?? ""),
  });

  assert.match(html, /<p class="workflow-kicker">Spool<\/p>/);
  assert.doesNotMatch(html, /PLA · Basic · White/);
  assert.doesNotMatch(html, /#1/);
  assert.match(html, /Detail body/);
  assert.match(html, /data-action="close-detail"/);
});

test("phone detail modal uses the compact header chrome", () => {
  const html = renderDetailModalShell({
    layoutMode: "phone",
    selectedSpool: createSelectedSpool(),
    detailBusy: false,
    detailBusyLabel: "",
    body: "<div>Detail body</div>",
    escapeHtml: (value) => String(value ?? ""),
  });

  assert.match(html, /PLA · Basic · White/);
  assert.match(html, /Done/);
  assert.doesNotMatch(html, /#1/);
  assert.doesNotMatch(html, /Review this spool/);
});

test("trusted-LAN shell renders the pairing handoff state", () => {
  const html = renderTrustedLanPairingApp({
    busy: false,
    statusTone: "default",
    statusMessage: "Waiting for a trusted-LAN pairing link.",
    escapeHtml: (value) => String(value ?? ""),
  });

  assert.match(html, /Trusted-LAN browser companion/);
  assert.match(html, /trusted-LAN pairing link/i);
  assert.doesNotMatch(html, /Bootstrap token/);
});
