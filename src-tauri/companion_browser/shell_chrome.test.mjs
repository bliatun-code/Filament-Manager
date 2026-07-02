import test from "node:test";
import assert from "node:assert/strict";

import {
  renderCompanionActionButton,
  renderDesktopRail,
  renderDetailModalShell,
  renderPhoneBottomNav,
  renderSwatchListRow,
  renderSwatchSelectionCard,
  renderSwatchSurface,
  renderTopbar,
  renderTrustedLanPairingApp,
} from "./shell_chrome.js";

const rootFlowItems = [
  { flow: "storage", label: "Inventory", meta: "12 visible", compactMeta: "12" },
  { flow: "loans", label: "Loans", meta: "2 active", compactMeta: "2" },
  { flow: "printers", label: "Printers", meta: "3 configured", compactMeta: "3" },
  { flow: "settings", label: "Settings", meta: "Trusted-LAN session", compactMeta: "On" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

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

test("companion action helper renders variants, swatches and boolean attributes", () => {
  const html = renderCompanionActionButton({
    variant: "secondary",
    type: "submit",
    swatch: true,
    disabled: true,
    className: "loan-action-button",
    attributes: {
      "data-action": "save&go",
      "aria-label": 'Save "now"',
      hidden: false,
    },
    escapeHtml,
    label: "Save <now>",
  });

  assert.equal(
    html,
    '<button class="secondary-button swatch-action-button loan-action-button" type="submit" data-action="save&amp;go" aria-label="Save &quot;now&quot;" disabled>Save &lt;now&gt;</button>',
  );
  assert.doesNotMatch(html, /hidden/);

  const coloredHtml = renderCompanionActionButton({
    swatch: "#16A34A",
    escapeHtml,
    label: "Save color",
  });
  assert.match(coloredHtml, /class="primary-button swatch-action-button"/);
  assert.match(coloredHtml, /style="--swatch-rgb:22 163 74;--swatch-solid:#16A34A"/);
});

test("swatch selection card helper owns selected filament preview chrome", () => {
  const html = renderSwatchSelectionCard({
    badges: ["Selected"],
    body: '<form data-action="save"></form>',
    className: "loan-create-card",
    escapeHtml,
    meta: ["Bambu", "#12", "500 g"],
    swatch: "#2563EB",
    title: "PLA <Blue>",
  });

  assert.match(html, /surface-card companion-selection-card swatch-surface loan-create-card/);
  assert.match(html, /companion-selection-card-head/);
  assert.match(html, /swatch-dot/);
  assert.match(html, /PLA &lt;Blue&gt;/);
  assert.match(html, /Bambu · #12 · 500 g/);
  assert.match(html, /Selected/);
  assert.match(html, /--swatch-rgb:37 99 235/);
  assert.match(html, /data-action="save"/);
});

test("swatch surface helper owns card surface attributes", () => {
  const html = renderSwatchSurface({
    tag: "article",
    className: "loan-card",
    attributes: {
      "data-selected": true,
      "aria-label": "PLA <Green>",
    },
    body: "<span>Body</span>",
    escapeHtml,
    swatch: "#16A34A",
  });

  assert.equal(
    html,
    '<article class="surface-card loan-card swatch-surface swatch-card-surface" data-selected aria-label="PLA &lt;Green&gt;" style="--swatch-rgb:22 163 74;--swatch-solid:#16A34A"><span>Body</span></article>',
  );

  const emptySlotHtml = renderSwatchSurface({
    tag: "article",
    surfaceClass: "",
    className: "slot-card slot-card-empty",
    attributes: { "data-slot-loaded": "false" },
    body: "Open",
    escapeHtml,
  });

  assert.equal(
    emptySlotHtml,
    '<article class="slot-card slot-card-empty" data-slot-loaded="false">Open</article>',
  );

  const bannerHtml = renderSwatchSurface({
    cardSurface: false,
    surfaceClass: "",
    className: "selection-banner",
    body: "Hidden",
    escapeHtml,
    swatch: "#ef4444",
  });
  assert.equal(
    bannerHtml,
    '<div class="selection-banner swatch-surface" style="--swatch-rgb:239 68 68;--swatch-solid:#EF4444">Hidden</div>',
  );
});

test("swatch list row helper owns filament row chrome", () => {
  const html = renderSwatchListRow({
    action: "select-spool",
    active: true,
    attributes: {
      "data-spool-id": "spool-1",
    },
    badges: ["Borrowed <in>"],
    className: "loan-picker-option",
    escapeHtml,
    meta: ["Bambu", "#123"],
    subtitle: "Shelf & box",
    swatch: "#16A34A",
    title: "PLA <Green>",
    weight: "500 g",
  });

  assert.match(html, /list-row dense-list-row spool-list-row swatch-surface loan-picker-option/);
  assert.match(html, /data-action="select-spool"/);
  assert.match(html, /data-active="true"/);
  assert.match(html, /data-spool-id="spool-1"/);
  assert.match(html, /--swatch-rgb:22 163 74/);
  assert.match(html, /PLA &lt;Green&gt;/);
  assert.match(html, /Shelf &amp; box/);
  assert.match(html, /Bambu · #123/);
  assert.match(html, /500 g/);
  assert.match(html, /Borrowed &lt;in&gt;/);
});

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

test("root flow navigation labels use the active locale for assistive text", () => {
  const tabletHtml = renderTopbar({
    layoutMode: "tablet",
    locale: "nb",
    activeRootFlow: "storage",
    activeRootFlowItem: rootFlowItems[0],
    rootFlowItems,
    busy: false,
    statusMessage: "",
    statusTone: "default",
    escapeHtml: (value) => String(value ?? ""),
  });
  const phoneHtml = renderPhoneBottomNav({
    activeRootFlow: "storage",
    rootFlowItems,
    locale: "nb",
    escapeHtml: (value) => String(value ?? ""),
  });
  const desktopHtml = renderDesktopRail({
    locale: "nb",
    activeRootFlow: "storage",
    rootFlowItems,
    activeLoansCount: 2,
    escapeHtml: (value) => String(value ?? ""),
  });

  assert.match(tabletHtml, /aria-label="Hovedflyter"/);
  assert.match(phoneHtml, /aria-label="Hovedflyter"/);
  assert.match(desktopHtml, /aria-label="Hovedflyter"/);
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
