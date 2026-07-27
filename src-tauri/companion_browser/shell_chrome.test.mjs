import test from "node:test";
import assert from "node:assert/strict";

import {
  renderCompanionActionButton,
  renderCompanionActionLink,
  renderCompanionStateCard,
  renderDesktopRail,
  renderDetailField,
  renderDetailModalShell,
  renderFilterChipButton,
  renderFormActionBlock,
  renderPhoneBottomNav,
  renderSegmentedControl,
  renderSelectionBanner,
  renderSwatchListRow,
  renderSwatchSelectionCard,
  renderSwatchSurface,
  renderTaskSheetShell,
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
  assert.match(coloredHtml, /style="--swatch-rgb:22 163 74;--swatch-solid:#16A34A;/);
  assert.match(coloredHtml, /--swatch-action-start:rgb\(41 170 88\)/);
  assert.match(coloredHtml, /--swatch-action-contrast:#0F172A/);
});

test("companion action link helper renders external links with shared chrome", () => {
  const html = renderCompanionActionLink({
    attributes: {
      target: "_blank",
      rel: "noreferrer",
      "aria-label": 'Open "docs"',
    },
    className: "companion-link-button",
    escapeHtml,
    href: "https://example.test/docs?x=1&y=2",
    label: "Open <docs>",
  });

  assert.equal(
    html,
    '<a class="ghost-button companion-link-button" href="https://example.test/docs?x=1&amp;y=2" target="_blank" rel="noreferrer" aria-label="Open &quot;docs&quot;">Open &lt;docs&gt;</a>',
  );
});

test("segmented control helper owns segment button chrome", () => {
  const html = renderSegmentedControl({
    action: "set-mode",
    activeValue: "dark",
    ariaLabel: "Theme <mode>",
    columns: 3,
    escapeHtml,
    items: [
      { value: "auto", label: "Auto", meta: "Follow device" },
      { value: "dark", label: "Dark", meta: "Low <light>" },
      { value: "light", label: "Light", disabled: true },
    ],
    valueAttribute: "data-theme-mode",
  });

  assert.match(html, /class="segmented-control" data-columns="3" role="group" aria-label="Theme &lt;mode&gt;"/);
  assert.match(html, /class="segment-button" type="button" data-action="set-mode" data-theme-mode="dark" data-active="true"/);
  assert.match(html, /Low &lt;light&gt;/);
  assert.match(html, /data-theme-mode="light" data-active="false" disabled/);
});

test("filter chip helper owns compact filter button chrome", () => {
  const html = renderFilterChipButton({
    active: true,
    attributes: {
      "data-action": "set-filter",
      "data-filter": "ACTIVE",
    },
    className: "loan-filter-button",
    escapeHtml,
    label: "Active <2>",
  });

  assert.equal(
    html,
    '<button class="filter-chip-button loan-filter-button" type="button" data-action="set-filter" data-filter="ACTIVE" data-active="true">Active &lt;2&gt;</button>',
  );
});

test("detail field helper owns task sheet field chrome", () => {
  const html = renderDetailField({
    className: "loan-field",
    escapeHtml,
    label: "Measured <weight>",
    body: '<input name="grams" />',
  });

  assert.match(html, /class="stack detail-field loan-field"/);
  assert.match(html, /Measured &lt;weight&gt;/);
  assert.match(html, /<input name="grams" \/>/);

  const divHtml = renderDetailField({
    tag: "div",
    escapeHtml,
    label: "Read-only",
    body: "<strong>Value</strong>",
  });

  assert.match(divHtml.trim(), /^<div class="stack detail-field">/);
  assert.match(divHtml, /<strong>Value<\/strong>/);
});

test("form action block helper owns task sheet action chrome", () => {
  const html = renderFormActionBlock({
    className: "sticky-actions",
    escapeHtml,
    actions: '<button type="submit">Save</button>',
  });

  assert.equal(
    html,
    '<div class="detail-actions form-action-block sticky-actions"><button type="submit">Save</button></div>',
  );
});

test("companion state card helper owns empty and info card chrome", () => {
  const infoHtml = renderCompanionStateCard({
    className: "loan-empty-state",
    escapeHtml,
    message: "No <rows>",
    tone: "info",
  });
  assert.equal(infoHtml, '<div class="info-card loan-empty-state">No &lt;rows&gt;</div>');

  const emptyHtml = renderCompanionStateCard({
    body: "<strong>Nothing here</strong>",
    escapeHtml,
    tag: "section",
  });
  assert.equal(emptyHtml, '<section class="empty-card"><strong>Nothing here</strong></section>');
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

  assert.match(
    html,
    /^<article class="surface-card loan-card swatch-surface swatch-card-surface" data-selected aria-label="PLA &lt;Green&gt;" style="--swatch-rgb:22 163 74;--swatch-solid:#16A34A;/,
  );
  assert.match(html, /--swatch-action-start:rgb\(41 170 88\)/);
  assert.match(html, /--swatch-action-contrast:#0F172A/);
  assert.match(html, /"><span>Body<\/span><\/article>$/);

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
    '<div class="selection-banner swatch-surface" style="--swatch-rgb:239 68 68;--swatch-solid:#EF4444;--swatch-action-start:rgb(188 69 74);--swatch-action-end:rgb(167 54 60);--swatch-action-border:rgb(243 113 113);--swatch-action-contrast:#FFFFFF;--swatch-action-inner:rgba(255, 255, 255, 0.18);--swatch-action-shadow-rgb:239 68 68">Hidden</div>',
  );
});

test("selection banner helper owns hidden selection chrome", () => {
  const html = renderSelectionBanner({
    actions: "<button>Recover</button>",
    className: "storage-hidden-banner",
    escapeHtml,
    message: "PLA <hidden> stays selected",
    summary: ["#42", "850 g", "Shelf & A"],
    swatch: "#16A34A",
    title: "Selected <spool>",
  });

  assert.match(html, /class="selection-banner selection-banner-muted compact-selection-banner storage-hidden-banner swatch-surface"/);
  assert.match(html, /style="--swatch-rgb:22 163 74;--swatch-solid:#16A34A;/);
  assert.match(html, /--swatch-action-start:rgb\(41 170 88\)/);
  assert.match(html, /Selected &lt;spool&gt;/);
  assert.match(html, /PLA &lt;hidden&gt; stays selected/);
  assert.match(html, /#42 · 850 g · Shelf &amp; A/);
  assert.match(html, /<div class="selection-banner-actions"><button>Recover<\/button><\/div>/);
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
  assert.doesNotMatch(html, /#1/);
  assert.match(html, /Detail body/);
  assert.match(html, /data-action="close-detail"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="companion-detail-dialog-title"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /data-companion-overlay="detail"/);
  assert.match(html, /id="companion-detail-dialog-title" class="sr-only"/);
  assert.match(html, /data-overlay-initial-focus/);
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

test("task sheet shell exposes a named modal dialog and initial focus target", () => {
  const html = renderTaskSheetShell({
    layoutMode: "desktop",
    title: "Load filament",
    subtitle: "Brutus · AMS 1",
    body: "<form>Task body</form>",
    escapeHtml,
  });

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="companion-task-sheet-title"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /data-companion-overlay="task-sheet"/);
  assert.match(html, /<h2 id="companion-task-sheet-title">Load filament<\/h2>/);
  assert.match(html, /data-action="close-task-sheet" data-overlay-initial-focus/);
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
