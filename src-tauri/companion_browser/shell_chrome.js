import { formatInventoryDisplayTitle } from "./formatters.js";
import { t } from "./companion_i18n.js";
import { swatchCssStyle, toSwatchColor } from "./companion_theme.js";

function renderRootFlowButton(activeRootFlow, item, escapeHtml) {
  return `
    <button
      class="root-flow-button"
      type="button"
      data-action="set-root-flow"
      data-root-flow="${escapeHtml(item.flow)}"
      data-active="${activeRootFlow === item.flow ? "true" : "false"}"
    >
      <span class="root-flow-label">${escapeHtml(item.label)}</span>
      <span class="root-flow-meta">${escapeHtml(item.meta)}</span>
    </button>
  `;
}

function renderStatusLine(statusMessage, statusTone, busy, escapeHtml, locale = "en") {
  const message = String(statusMessage || "").trim();
  const hiddenMessages = new Set([
    t(locale, "status.companionReady", "Companion session ready."),
    t(locale, "status.refreshed", "Local data refreshed."),
  ]);
  if (!message) {
    return "";
  }
  if (!busy && statusTone === "default") {
    return "";
  }
  if (!busy && hiddenMessages.has(message)) {
    return "";
  }
  return `<div class="status-line app-status-line" data-tone="${escapeHtml(statusTone)}">${escapeHtml(message)}</div>`;
}

function renderAttributeMap(attributes, escapeHtml) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value != null)
    .map(([name, value]) => (value === true ? name : `${name}="${escapeHtml(value)}"`))
    .join(" ");
}

export function renderCompanionActionButton(options) {
  const {
    attributes = {},
    className = "",
    disabled = false,
    escapeHtml,
    label,
    swatch = false,
    type = "button",
    variant = "primary",
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const variantClass =
    variant === "secondary"
      ? "secondary-button"
      : variant === "ghost"
        ? "ghost-button"
        : "primary-button";
  const classes = [
    variantClass,
    swatch ? "swatch-action-button" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const renderedAttributes = renderAttributeMap({ type, ...attributes, disabled }, escape);
  return `<button class="${escape(classes)}"${renderedAttributes ? ` ${renderedAttributes}` : ""}>${escape(label)}</button>`;
}

export function renderSwatchSelectionCard(options) {
  const {
    actions = "",
    aside = "",
    badges = [],
    body = "",
    className = "",
    escapeHtml,
    meta = [],
    swatch,
    title,
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const cleanedMeta = meta.filter(Boolean).map((value) => escape(value));
  const cleanedBadges = badges.filter(Boolean).map((value) => escape(value));
  const badgeHtml =
    cleanedBadges.length > 0
      ? `<div class="pill-row compact-pill-row">${cleanedBadges.map((badge) => `<span class="pill">${badge}</span>`).join("")}</div>`
      : "";
  const classes = [
    "surface-card",
    "companion-selection-card",
    "swatch-surface",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="${escape(classes)}" style="${escape(swatchCssStyle(swatch))}">
      <div class="companion-selection-card-head">
        <div class="stack companion-selection-card-copy">
          <div class="swatch-line">
            <span class="swatch-dot" style="background:${escape(toSwatchColor(swatch))};"></span>
            <span class="list-title">${escape(title)}</span>
          </div>
          ${cleanedMeta.length > 0 ? `<div class="meta-line">${cleanedMeta.join(" · ")}</div>` : ""}
        </div>
        ${aside || badgeHtml}
      </div>
      ${body}
      ${actions ? `<div class="detail-actions form-action-block companion-selection-card-actions">${actions}</div>` : ""}
    </div>
  `;
}

function renderTabletRootSwitch(activeRootFlow, rootFlowItems, escapeHtml, locale = "en") {
  return `
    <div class="root-switch" role="tablist" aria-label="${escapeHtml(t(locale, "nav.primaryFlowsAria", "Primary flows"))}">
      ${rootFlowItems.map((item) => renderRootFlowButton(activeRootFlow, item, escapeHtml)).join("")}
    </div>
  `;
}

export function renderDesktopRail(options) {
  const { locale = "en", activeRootFlow, rootFlowItems, activeLoansCount, escapeHtml } = options;
  return `
    <aside class="desktop-rail surface-panel">
      <div class="desktop-rail-top">
        <p class="eyebrow">${escapeHtml(t(locale, "rail.eyebrow", "Browser Companion"))}</p>
        <div class="desktop-rail-title">${escapeHtml(t(locale, "rail.title", "Filament Manager"))}</div>
      </div>
      <nav class="desktop-rail-nav" aria-label="${escapeHtml(t(locale, "nav.primaryFlowsAria", "Primary flows"))}">
        ${rootFlowItems.map((item) => renderRootFlowButton(activeRootFlow, item, escapeHtml)).join("")}
      </nav>
      <div class="desktop-rail-meta">
        <span class="desktop-rail-meta-line">${escapeHtml(t(locale, "rail.activeLoans", "{count} active loans", { count: activeLoansCount }))}</span>
      </div>
    </aside>
  `;
}

export function renderPhoneBottomNav(options) {
  const { activeRootFlow, rootFlowItems, escapeHtml, locale = "en" } = options;
  return `
    <nav class="phone-bottom-nav" aria-label="${escapeHtml(t(locale, "nav.primaryFlowsAria", "Primary flows"))}">
      ${rootFlowItems
        .map(
          (item) => `
            <button
              class="phone-nav-button"
              type="button"
              data-action="set-root-flow"
              data-root-flow="${escapeHtml(item.flow)}"
              data-active="${activeRootFlow === item.flow ? "true" : "false"}"
            >
              <span>${escapeHtml(item.label)}</span>
            </button>
          `,
        )
        .join("")}
    </nav>
  `;
}

export function renderTopbar(options) {
  const {
    layoutMode,
    locale = "en",
    activeRootFlow,
    activeRootFlowItem,
    rootFlowItems,
    busy,
    statusMessage,
    statusTone,
    escapeHtml,
  } = options;
  const flowLabel = activeRootFlowItem?.label || "Inventory";
  const flowMeta = activeRootFlowItem?.meta || "Trusted-LAN workflow";
  const showHeading = layoutMode === "phone";

  return `
    <header class="app-topbar surface-panel" data-layout="${escapeHtml(layoutMode)}">
      <div class="app-topbar-main" data-layout="${escapeHtml(layoutMode)}">
        ${
          showHeading
            ? `
              <div class="topbar-heading">
                <h1 class="app-title">${escapeHtml(flowLabel)}</h1>
                <p class="topbar-subcopy">${escapeHtml(flowMeta)}</p>
              </div>
            `
            : layoutMode === "desktop"
              ? '<div class="topbar-utility-spacer" aria-hidden="true"></div>'
              : ""
        }
        ${layoutMode === "tablet" ? renderTabletRootSwitch(activeRootFlow, rootFlowItems, escapeHtml, locale) : ""}
      </div>
      ${renderStatusLine(statusMessage, statusTone, busy, escapeHtml, locale)}
    </header>
  `;
}

export function renderDetailModalShell(options) {
  const {
    layoutMode,
    locale = "en",
    selectedSpool,
    detailBusy,
    detailBusyLabel,
    body,
    escapeHtml,
  } = options;
  const selectedTitle = selectedSpool
    ? formatInventoryDisplayTitle(
        selectedSpool.master.material,
        selectedSpool.master.filament_name,
        selectedSpool.master.color_name,
      )
    : t(locale, "detail.spoolDetailsFallback", "Spool details");
  const statusChips = [];
  if (!selectedSpool && layoutMode !== "phone") {
    statusChips.push(`<span class="chip chip-quiet">${escapeHtml(t(locale, "detail.noSelection", "No selection"))}</span>`);
  }
  if (detailBusy) {
    statusChips.push(`<span class="chip chip-quiet">${escapeHtml(detailBusyLabel)}</span>`);
  }
  const closeLabel =
    layoutMode === "phone"
      ? t(options.locale || "en", "shell.done", "Done")
      : t(options.locale || "en", "shell.close", "Close");
  const showSelectedTitleInHeader = layoutMode === "phone";

  return `
    <div class="detail-modal-backdrop" data-layout="${escapeHtml(layoutMode)}">
      <div class="detail-modal-shell">
        <section class="detail-panel detail-modal surface-panel">
          <div class="detail-panel-header">
            <div class="detail-modal-copy">
              <p class="workflow-kicker">${escapeHtml(t(locale, "detail.spoolHeading", "Spool"))}</p>
              ${showSelectedTitleInHeader ? `<h2>${escapeHtml(selectedTitle)}</h2>` : ""}
            </div>
            <div class="detail-modal-actions">
              ${statusChips.length > 0 ? `<div class="pill-row detail-modal-status">${statusChips.join("")}</div>` : ""}
              <button class="ghost-button compact-back-button" type="button" data-action="close-detail">
                ${escapeHtml(closeLabel)}
              </button>
            </div>
          </div>
          <div class="detail-modal-body">
            ${body}
          </div>
        </section>
      </div>
    </div>
  `;
}

export function renderTaskSheetShell(options) {
  const {
    layoutMode,
    title,
    subtitle,
    body,
    escapeHtml,
    locale = "en",
    shellClass = "",
    panelClass = "",
    kicker = "",
  } = options;
  const closeLabel = layoutMode === "phone" ? t(locale, "shell.done", "Done") : t(locale, "shell.close", "Close");
  const shellClasses = ["task-sheet-shell", shellClass].filter(Boolean).join(" ");
  const panelClasses = ["task-sheet", "surface-panel", panelClass].filter(Boolean).join(" ");

  return `
    <div class="task-sheet-backdrop" data-layout="${escapeHtml(layoutMode)}">
      <div class="${escapeHtml(shellClasses)}">
        <section class="${escapeHtml(panelClasses)}">
          <div class="task-sheet-header">
            <div class="task-sheet-copy">
              ${kicker ? `<p class="workflow-kicker">${escapeHtml(kicker)}</p>` : ""}
              <h2>${escapeHtml(title)}</h2>
              ${subtitle ? `<p class="section-copy">${escapeHtml(subtitle)}</p>` : ""}
            </div>
            <button class="ghost-button compact-back-button" type="button" data-action="close-task-sheet">
              ${escapeHtml(closeLabel)}
            </button>
          </div>
          <div class="task-sheet-body">
            ${body}
          </div>
        </section>
      </div>
    </div>
  `;
}

export function renderTrustedLanPairingApp(options) {
  const { busy, statusTone, statusMessage, escapeHtml, locale = "en" } = options;

  return `
    <div class="companion-shell">
      <div class="companion-frame pairing-frame">
        <section class="hero-card pairing-card">
          <div>
            <p class="eyebrow">${escapeHtml(t(locale, "rail.title", "Filament Manager"))}</p>
            <h1 class="hero-title">${escapeHtml(t(locale, "trustedLan.title", "Trusted-LAN browser companion"))}</h1>
            <p class="hero-copy">
              ${escapeHtml(
                t(
                  locale,
                  "trustedLan.copy",
                  "This browser is using the trusted-LAN companion path. Open a pairing link from desktop Settings to approve this browser. Trusted-LAN traffic is not encrypted, so only use it on a network you trust.",
                ),
              )}
            </p>
          </div>
          <div class="stack">
            <div class="info-card">
              ${escapeHtml(
                t(
                  locale,
                  "trustedLan.pairingHint",
                  "Desktop Settings creates short-lived, single-use pairing links for human browser access.",
                ),
              )}
            </div>
            <div class="status-line" data-tone="${escapeHtml(statusTone)}">${escapeHtml(
              statusMessage ||
                t(
                  locale,
                  "trustedLan.awaiting",
                  "Waiting for a trusted-LAN pairing link.",
                ),
            )}</div>
            <button class="ghost-button" data-action="refresh" ${busy ? "disabled" : ""}>
              ${escapeHtml(t(locale, "shell.refresh", "Refresh"))}
            </button>
          </div>
        </section>
      </div>
    </div>
  `;
}
