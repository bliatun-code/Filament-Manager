import { formatInventoryDisplayTitle } from "./formatters.js";
import { t } from "./companion_i18n.js";
import { swatchCssStyle, toSwatchColor } from "./companion_theme.js";

export const COMPANION_ROOT_FLOW_PANEL_ID = "companion-root-panel";

export function companionRootFlowTabId(flow) {
  return `companion-root-tab-${String(flow || "").trim()}`;
}

function companionRootFlowNavigationId(flow) {
  return `companion-root-nav-${String(flow || "").trim()}`;
}

function renderRootFlowButton(activeRootFlow, item, escapeHtml, semantics = "navigation") {
  const active = activeRootFlow === item.flow;
  const tabAttributes =
    semantics === "tabs"
      ? `
      id="${escapeHtml(companionRootFlowTabId(item.flow))}"
      role="tab"
      aria-selected="${active ? "true" : "false"}"
      aria-controls="${COMPANION_ROOT_FLOW_PANEL_ID}"
      tabindex="${active ? "0" : "-1"}"`
      : `
      id="${escapeHtml(companionRootFlowNavigationId(item.flow))}"${
        active ? '\n      aria-current="page"' : ""
      }`;
  return `
    <button
      class="root-flow-button"
      type="button"
      data-action="set-root-flow"
      data-root-flow="${escapeHtml(item.flow)}"
      data-active="${active ? "true" : "false"}"${tabAttributes}
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

function companionActionChrome(options) {
  const { className = "", swatch = false, variant = "primary" } = options;
  const variantClass =
    variant === "secondary"
      ? "secondary-button"
      : variant === "ghost"
        ? "ghost-button"
        : "primary-button";
  return {
    classes: [
      variantClass,
      swatch ? "swatch-action-button" : "",
      className,
    ]
      .filter(Boolean)
      .join(" "),
    swatchStyle: typeof swatch === "string" && swatch.trim() ? swatchCssStyle(swatch) : "",
  };
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
  const { classes, swatchStyle } = companionActionChrome({ className, swatch, variant });
  const renderedAttributes = renderAttributeMap(
    {
      type,
      ...attributes,
      style: [swatchStyle, attributes.style].filter(Boolean).join(";") || undefined,
      disabled,
    },
    escape,
  );
  return `<button class="${escape(classes)}"${renderedAttributes ? ` ${renderedAttributes}` : ""}>${escape(label)}</button>`;
}

export function renderCompanionActionLink(options) {
  const {
    attributes = {},
    className = "",
    escapeHtml,
    href,
    label,
    swatch = false,
    variant = "ghost",
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const { classes, swatchStyle } = companionActionChrome({ className, swatch, variant });
  const renderedAttributes = renderAttributeMap(
    {
      href,
      ...attributes,
      style: [swatchStyle, attributes.style].filter(Boolean).join(";") || undefined,
    },
    escape,
  );
  return `<a class="${escape(classes)}"${renderedAttributes ? ` ${renderedAttributes}` : ""}>${escape(label)}</a>`;
}

export function renderSegmentedControl(options) {
  const {
    action,
    activeValue,
    ariaLabel = "",
    className = "",
    columns,
    escapeHtml,
    items = [],
    valueAttribute,
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const classes = ["segmented-control", className].filter(Boolean).join(" ");
  const renderedAttributes = renderAttributeMap(
    {
      ...(columns ? { "data-columns": columns } : {}),
      role: "group",
      ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
    },
    escape,
  );
  const buttons = items
    .map((item) => {
      const value = String(item.value ?? "");
      const itemAttributes = item.attributes || {};
      const buttonAttributes = renderAttributeMap(
        {
          type: "button",
          ...itemAttributes,
          ...(action ? { "data-action": action } : {}),
          ...(valueAttribute ? { [valueAttribute]: value } : {}),
          "data-active": String(activeValue) === value ? "true" : "false",
          disabled: item.disabled,
        },
        escape,
      );
      return `
        <button class="segment-button"${buttonAttributes ? ` ${buttonAttributes}` : ""}>
          <span>${escape(item.label)}</span>
          ${item.meta ? `<span class="segment-meta">${escape(item.meta)}</span>` : ""}
        </button>
      `;
    })
    .join("");

  return `<div class="${escape(classes)}"${renderedAttributes ? ` ${renderedAttributes}` : ""}>${buttons}</div>`;
}

export function renderFilterChipButton(options) {
  const {
    active = false,
    attributes = {},
    className = "",
    escapeHtml,
    label,
    type = "button",
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const classes = ["filter-chip-button", className].filter(Boolean).join(" ");
  const renderedAttributes = renderAttributeMap(
    {
      type,
      ...attributes,
      "data-active": active ? "true" : "false",
    },
    escape,
  );
  return `<button class="${escape(classes)}"${renderedAttributes ? ` ${renderedAttributes}` : ""}>${escape(label)}</button>`;
}

export function renderDetailField(options) {
  const {
    body = "",
    className = "",
    escapeHtml,
    label = "",
    tag = "label",
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const tagName = tag === "div" ? "div" : "label";
  const classes = ["stack", "detail-field", className].filter(Boolean).join(" ");
  return `
    <${tagName} class="${escape(classes)}">
      ${label ? `<span class="muted">${escape(label)}</span>` : ""}
      ${body}
    </${tagName}>
  `;
}

export function renderFormActionBlock(options) {
  const { actions = "", className = "", escapeHtml } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const classes = ["detail-actions", "form-action-block", className].filter(Boolean).join(" ");
  return `<div class="${escape(classes)}">${actions}</div>`;
}

export function renderCompanionStateCard(options) {
  const {
    body = "",
    className = "",
    escapeHtml,
    message = "",
    tag = "div",
    tone = "empty",
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const tagName = ["article", "div", "section"].includes(tag) ? tag : "div";
  const toneClass = tone === "info" ? "info-card" : "empty-card";
  const classes = [toneClass, className].filter(Boolean).join(" ");
  const content = body || escape(message);
  return `<${tagName} class="${escape(classes)}">${content}</${tagName}>`;
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
      ${actions
        ? renderFormActionBlock({
            actions,
            className: "companion-selection-card-actions",
            escapeHtml: escape,
          })
        : ""}
    </div>
  `;
}

export function renderSwatchSurface(options) {
  const {
    attributes = {},
    body = "",
    cardSurface = true,
    className = "",
    escapeHtml,
    surfaceClass = "surface-card",
    swatch,
    tag = "div",
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const tagName = ["article", "div", "section"].includes(tag) ? tag : "div";
  const hasSwatch = typeof swatch === "string" && swatch.trim();
  const classes = [
    surfaceClass,
    className,
    hasSwatch ? "swatch-surface" : "",
    hasSwatch && cardSurface ? "swatch-card-surface" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const renderedAttributes = renderAttributeMap(
    {
      ...attributes,
      style: [hasSwatch ? swatchCssStyle(swatch) : "", attributes.style].filter(Boolean).join(";") || undefined,
    },
    escape,
  );

  return `<${tagName} class="${escape(classes)}"${renderedAttributes ? ` ${renderedAttributes}` : ""}>${body}</${tagName}>`;
}

export function renderSelectionBanner(options) {
  const {
    actions = "",
    className = "",
    escapeHtml,
    message = "",
    summary = [],
    swatch = "",
    title,
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const summaryItems = (Array.isArray(summary) ? summary : [summary]).filter(Boolean).map((value) => escape(value));

  return renderSwatchSurface({
    cardSurface: false,
    surfaceClass: "",
    className: ["selection-banner", "selection-banner-muted", "compact-selection-banner", className]
      .filter(Boolean)
      .join(" "),
    escapeHtml: escape,
    swatch,
    body: `
      <div class="selection-banner-copy">
        <div class="list-title">${escape(title)}</div>
        ${message ? `<div class="section-copy">${escape(message)}</div>` : ""}
      </div>
      ${summaryItems.length > 0 ? `<div class="selection-banner-summary meta-line">${summaryItems.join(" · ")}</div>` : ""}
      ${actions ? `<div class="selection-banner-actions">${actions}</div>` : ""}
    `,
  });
}

export function renderSwatchListRow(options) {
  const {
    action,
    active,
    attributes = {},
    badges = [],
    className = "",
    escapeHtml,
    meta = [],
    metaClassName = "",
    subtitle = "",
    swatch,
    title,
    type = "button",
    weight = "",
  } = options;
  const escape = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const cleanedMeta = meta.filter(Boolean).map((value) => escape(value));
  const cleanedBadges = badges.filter(Boolean).map((value) => escape(value));
  const classes = [
    "list-row",
    "dense-list-row",
    "spool-list-row",
    "swatch-surface",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const rowStyle = [swatchCssStyle(swatch), attributes.style].filter(Boolean).join(";");
  const renderedAttributes = renderAttributeMap(
    {
      type,
      ...attributes,
      ...(active == null ? {} : { "data-active": active ? "true" : "false" }),
      ...(action ? { "data-action": action } : {}),
      style: rowStyle,
    },
    escape,
  );
  const metaClasses = ["meta-line", "spool-row-meta", metaClassName].filter(Boolean).join(" ");
  const sideHtml =
    weight || cleanedBadges.length > 0
      ? `
        <div class="dense-list-side">
          ${weight ? `<div class="spool-row-weight">${escape(weight)}</div>` : ""}
          ${
            cleanedBadges.length > 0
              ? `<div class="pill-row compact-pill-row">${cleanedBadges.map((badge) => `<span class="pill">${badge}</span>`).join("")}</div>`
              : ""
          }
        </div>
      `
      : "";

  return `
    <button class="${escape(classes)}"${renderedAttributes ? ` ${renderedAttributes}` : ""}>
      <div class="dense-list-main">
        <div class="swatch-line spool-row-title">
          <span class="swatch-dot" style="background:${escape(toSwatchColor(swatch))};"></span>
          <span class="list-title">${escape(title)}</span>
        </div>
        ${subtitle ? `<div class="list-subtitle">${escape(subtitle)}</div>` : ""}
        ${cleanedMeta.length > 0 ? `<div class="${escape(metaClasses)}">${cleanedMeta.join(" · ")}</div>` : ""}
      </div>
      ${sideHtml}
    </button>
  `;
}

function renderTabletRootSwitch(activeRootFlow, rootFlowItems, escapeHtml, locale = "en") {
  return `
    <div class="root-switch" role="tablist" aria-label="${escapeHtml(t(locale, "nav.primaryFlowsAria", "Primary flows"))}">
      ${rootFlowItems.map((item) => renderRootFlowButton(activeRootFlow, item, escapeHtml, "tabs")).join("")}
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
        ${rootFlowItems.map((item) => renderRootFlowButton(activeRootFlow, item, escapeHtml, "navigation")).join("")}
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
              id="${escapeHtml(companionRootFlowNavigationId(item.flow))}"
              type="button"
              data-action="set-root-flow"
              data-root-flow="${escapeHtml(item.flow)}"
              data-active="${activeRootFlow === item.flow ? "true" : "false"}"
              ${activeRootFlow === item.flow ? 'aria-current="page"' : ""}
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
        locale,
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
        <section
          class="detail-panel detail-modal surface-panel"
          role="dialog"
          aria-modal="true"
          aria-busy="${detailBusy ? "true" : "false"}"
          aria-labelledby="companion-detail-dialog-title"
          tabindex="-1"
          data-companion-overlay="detail"
        >
          <div class="detail-panel-header">
            <div class="detail-modal-copy">
              <p class="workflow-kicker">${escapeHtml(t(locale, "detail.spoolHeading", "Spool"))}</p>
              <h2 id="companion-detail-dialog-title"${showSelectedTitleInHeader ? "" : ' class="sr-only"'}>${escapeHtml(selectedTitle)}</h2>
            </div>
            <div class="detail-modal-actions">
              ${statusChips.length > 0 ? `<div class="pill-row detail-modal-status">${statusChips.join("")}</div>` : ""}
              <button class="ghost-button compact-back-button" type="button" data-action="close-detail" data-overlay-initial-focus>
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
        <section
          class="${escapeHtml(panelClasses)}"
          role="dialog"
          aria-modal="true"
          aria-labelledby="companion-task-sheet-title"
          tabindex="-1"
          data-companion-overlay="task-sheet"
        >
          <div class="task-sheet-header">
            <div class="task-sheet-copy">
              ${kicker ? `<p class="workflow-kicker">${escapeHtml(kicker)}</p>` : ""}
              <h2 id="companion-task-sheet-title">${escapeHtml(title)}</h2>
              ${subtitle ? `<p class="section-copy">${escapeHtml(subtitle)}</p>` : ""}
            </div>
            <button class="ghost-button compact-back-button" type="button" data-action="close-task-sheet" data-overlay-initial-focus>
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
            ${renderCompanionStateCard({
              escapeHtml,
              message: t(
                locale,
                "trustedLan.pairingHint",
                "Desktop Settings creates short-lived, single-use pairing links for human browser access.",
              ),
              tone: "info",
            })}
            <div class="status-line" data-tone="${escapeHtml(statusTone)}">${escapeHtml(
              statusMessage ||
                t(
                  locale,
                  "trustedLan.awaiting",
                  "Waiting for a trusted-LAN pairing link.",
                ),
            )}</div>
            ${renderCompanionActionButton({
              variant: "ghost",
              attributes: { "data-action": "refresh" },
              disabled: busy,
              escapeHtml,
              label: t(locale, "shell.refresh", "Refresh"),
            })}
          </div>
        </section>
      </div>
    </div>
  `;
}
