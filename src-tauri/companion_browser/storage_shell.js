import {
  formatInventoryDisplayTitle,
  formatRollReference,
  formatStatusLabel,
  sortCatalogMastersAlphabetically,
} from "./formatters.js";
import {
  bambuFilamentCodeLookupRequiresExplicitSelection,
  buildBambuFilamentCodeLookup,
  catalogMasterMatchesBambuFilamentCode,
} from "./bambu_filament_code_lookup.js";
import { suggestSwatchHex, swatchCssStyle, toSwatchColor } from "./companion_theme.js";
import { t } from "./companion_i18n.js";
import { isBorrowedInOwnership, normalizeDomainToken, parseSpoolStatus } from "./companion_domain.js";
import { renderCompanionActionButton, renderSwatchSelectionCard } from "./shell_chrome.js";

function catalogMatchesSource(master, source) {
  const vendor = String(master?.vendor || "").trim().toLowerCase();
  if (source === "esun") {
    return vendor.includes("esun");
  }
  if (source === "manual") {
    return false;
  }
  return vendor.includes("bambu");
}

function resolveAddSheetState(state) {
  const draft = state.borrowedInDraft || {};
  const source = String(draft.source || "bambu").trim().toLowerCase();
  const rawCatalogSearch = String(draft.catalogSearch || "").trim();
  const catalogSearch = rawCatalogSearch.toLowerCase();
  const catalogStatusFilter = String(draft.catalogStatusFilter || "ACTIVE").trim().toUpperCase();
  const catalogMasters = Array.isArray(state.catalogMasters) ? state.catalogMasters : [];
  const bambuCodeLookup =
    source === "bambu" ? buildBambuFilamentCodeLookup(catalogMasters, rawCatalogSearch) : null;
  const visibleCatalogMasters = sortCatalogMastersAlphabetically(
    catalogMasters.filter((master) => {
      if (!catalogMatchesSource(master, source)) {
        return false;
      }
      const codeMatchesMaster =
        source === "bambu" &&
        catalogMasterMatchesBambuFilamentCode(master, bambuCodeLookup?.code);
      const includeDiscontinuedCodeMatch =
        catalogStatusFilter === "ACTIVE" &&
        bambuCodeLookup?.status === "discontinued_only" &&
        codeMatchesMaster;
      if (catalogStatusFilter === "ACTIVE" && master.is_discontinued && !includeDiscontinuedCodeMatch) {
        return false;
      }
      if (catalogStatusFilter === "DISCONTINUED" && !master.is_discontinued) {
        return false;
      }
      if (!catalogSearch) {
        return true;
      }
      return `${master.material} ${master.filament_name} ${master.color_name} ${master.vendor}`
        .toLowerCase()
        .includes(catalogSearch) || codeMatchesMaster;
    }),
  );
  const selectedMasterId = String(draft.selectedMasterId || "").trim();
  const explicitSelectedMaster =
    source === "manual"
      ? null
      : visibleCatalogMasters.find((master) => master.id === selectedMasterId) || null;
  const bambuCodeRequiresExplicitSelection =
    source === "bambu" && bambuFilamentCodeLookupRequiresExplicitSelection(bambuCodeLookup);
  const selectedMaster =
    (source === "manual"
      ? null
      : explicitSelectedMaster ||
        (bambuCodeRequiresExplicitSelection ? null : visibleCatalogMasters[0] || null));
  const material =
    source === "manual"
      ? String(draft.material || "").trim()
      : String(selectedMaster?.material || "").trim();
  const filamentName =
    source === "manual"
      ? String(draft.filamentName || "").trim()
      : String(selectedMaster?.filament_name || "").trim();
  const colorName =
    source === "manual"
      ? String(draft.colorName || "").trim()
      : String(selectedMaster?.color_name || "").trim();
  const vendor =
    source === "manual"
      ? String(draft.manualVendor || "").trim() || "Generic"
      : String(selectedMaster?.vendor || "").trim();
  const previewHex =
    String(draft.hexColor || "").trim() ||
    selectedMaster?.hex_color ||
    suggestSwatchHex(colorName, filamentName, vendor, material);
  const wishlistItems = Array.isArray(state.wishlistItems) ? state.wishlistItems : [];
  const wishlistFilter = String(draft.wishlistFilter || "ALL").trim().toUpperCase();
  const visibleWishlistItems = wishlistItems.filter((item) =>
    wishlistFilter === "ALL" ? true : item.status === wishlistFilter,
  );

  return {
    draft,
    source,
    bambuCodeLookup,
    catalogStatusFilter,
    visibleCatalogMasters,
    selectedMaster,
    material,
    filamentName,
    colorName,
    vendor,
    previewHex,
    wishlistFilter,
    visibleWishlistItems,
    wishlistSummary: {
      all: wishlistItems.length,
      wishlist: wishlistItems.filter((item) => item.status === "WISHLIST").length,
      onOrder: wishlistItems.filter((item) => item.status === "ON_ORDER").length,
      received: wishlistItems.filter((item) => item.status === "RECEIVED").length,
    },
    requiresCatalogSelection: source !== "manual" && !selectedMaster,
  };
}

function renderSelectionHiddenInputs(selection, escapeHtml) {
  return `
    <input type="hidden" name="filament-source" value="${escapeHtml(selection.source)}" />
    <input type="hidden" name="filament-master-id" value="${escapeHtml(selection.selectedMaster?.id || "")}" />
    <input type="hidden" name="filament-material" value="${escapeHtml(selection.material)}" />
    <input type="hidden" name="filament-name" value="${escapeHtml(selection.filamentName)}" />
    <input type="hidden" name="filament-color-name" value="${escapeHtml(selection.colorName)}" />
    <input type="hidden" name="filament-vendor" value="${escapeHtml(selection.vendor)}" />
    <input type="hidden" name="filament-hex-color" value="${escapeHtml(selection.previewHex)}" />
  `;
}

export function renderAddFilamentTaskSheetBody(state, busy, escapeHtml) {
  const locale = state.locale || "en";
  const selection = resolveAddSheetState(state);
  const draft = selection.draft;
  const previewTitle = formatInventoryDisplayTitle(
    selection.material || t(locale, "storage.material", "Material"),
    selection.filamentName || t(locale, "storage.filament", "Filament"),
    selection.colorName || t(locale, "storage.color", "Color"),
  );
  const previewMeta = [
    selection.vendor || t(locale, "storage.vendor", "Vendor"),
    selection.selectedMaster?.default_weight ? `${selection.selectedMaster.default_weight} g` : "",
  ].filter(Boolean);
  const isBorrowedIn = isBorrowedInOwnership(draft.ownershipType);
  const catalogSelectionMissing = selection.requiresCatalogSelection;
  const selectionBadge = catalogSelectionMissing
    ? t(locale, "storage.chooseCatalogRow", "Choose a catalog row")
    : t(locale, "storage.selected", "Selected");
  const wishlistRows = selection.visibleWishlistItems
    .map((item) => {
      const linkedMaster = (Array.isArray(state.catalogMasters) ? state.catalogMasters : []).find(
        (master) => master.id === item.master_id,
      );
      const itemSwatch = linkedMaster?.hex_color || suggestSwatchHex(item.color_name, item.filament_name, item.vendor, item.material);
      const itemStyle = swatchCssStyle(itemSwatch);
      return `
        <div class="surface-card add-spool-wishlist-row swatch-surface" style="${escapeHtml(itemStyle)}">
          <div class="add-spool-wishlist-row-head">
            <div class="stack add-spool-wishlist-row-copy">
              <div class="list-title">${escapeHtml(
                formatInventoryDisplayTitle(item.material, item.filament_name, item.color_name),
              )}</div>
              <div class="list-subtitle">${escapeHtml(item.vendor || "Generic")} · ${escapeHtml(
                `${t(locale, "storage.quantity", "Qty")} ${item.quantity}`,
              )}</div>
            </div>
            <span class="pill">${escapeHtml(
              item.status === "ON_ORDER"
                ? t(locale, "storage.onOrder", "On order")
                : item.status === "RECEIVED"
                  ? t(locale, "storage.received", "Received")
                  : t(locale, "storage.wishlist", "Wishlist"),
            )}</span>
          </div>
          ${item.note ? `<div class="section-copy add-spool-wishlist-note">${escapeHtml(item.note)}</div>` : ""}
          <div class="pill-row add-spool-wishlist-actions">
            ${renderCompanionActionButton({
              variant: "ghost",
              disabled: busy || item.status === "WISHLIST",
              attributes: {
                "data-action": "wishlist-update-status",
                "data-wishlist-id": item.id,
                "data-wishlist-status": "WISHLIST",
              },
              escapeHtml,
              label: t(locale, "storage.wishlist", "Wishlist"),
            })}
            ${renderCompanionActionButton({
              variant: "ghost",
              disabled: busy || item.status === "ON_ORDER",
              attributes: {
                "data-action": "wishlist-update-status",
                "data-wishlist-id": item.id,
                "data-wishlist-status": "ON_ORDER",
              },
              escapeHtml,
              label: t(locale, "storage.onOrder", "On order"),
            })}
            ${renderCompanionActionButton({
              disabled: busy,
              swatch: true,
              attributes: {
                "data-action": "wishlist-stock-now",
                "data-wishlist-id": item.id,
              },
              escapeHtml,
              label: t(locale, "storage.stockNow", "Stock now"),
            })}
            ${renderCompanionActionButton({
              variant: "ghost",
              disabled: busy,
              attributes: {
                "data-action": "wishlist-delete",
                "data-wishlist-id": item.id,
              },
              escapeHtml,
              label: t(locale, "storage.remove", "Remove"),
            })}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="stack add-spool-sheet">
      <section class="surface-card add-spool-section">
        <div class="add-spool-source-head">
          <div class="segmented-control" data-columns="3">
            ${[
              ["bambu", t(locale, "storage.vendorBambu", "Bambu")],
              ["esun", t(locale, "storage.vendorEsun", "eSUN")],
              ["manual", t(locale, "storage.vendorGeneric", "Generic")],
            ]
              .map(
                ([sourceValue, label]) => `
                  <button
                    class="segment-button"
                    type="button"
                    data-action="set-filament-source"
                    data-filament-source="${escapeHtml(sourceValue)}"
                    data-active="${selection.source === sourceValue ? "true" : "false"}"
                  >
                    <span>${escapeHtml(label)}</span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>

        ${
          selection.source === "manual"
            ? `
              <div class="borrowed-in-grid add-spool-grid">
                <label class="stack detail-field">
                  <span class="muted">${escapeHtml(t(locale, "storage.vendor", "Vendor"))}</span>
                  <input
                    class="text-input"
                    name="filament-manual-vendor"
                    type="text"
                    value="${escapeHtml(String(draft.manualVendor || ""))}"
                    placeholder="${escapeHtml(t(locale, "storage.vendorPlaceholder", "Bambu, eSUN, Generic..."))}"
                  />
                </label>
                <label class="stack detail-field">
                  <span class="muted">${escapeHtml(t(locale, "storage.material", "Material"))}</span>
                  <input
                    class="text-input"
                    name="filament-material"
                    type="text"
                    value="${escapeHtml(String(draft.material || ""))}"
                    placeholder="${escapeHtml(t(locale, "storage.materialPlaceholder", "PLA, PETG, TPU..."))}"
                  />
                </label>
                <label class="stack detail-field">
                  <span class="muted">${escapeHtml(t(locale, "storage.filamentName", "Filament name"))}</span>
                  <input
                    class="text-input"
                    name="filament-name"
                    type="text"
                    value="${escapeHtml(String(draft.filamentName || ""))}"
                    placeholder="${escapeHtml(t(locale, "storage.filamentNamePlaceholder", "Basic, Matte, Prototype..."))}"
                  />
                </label>
                <label class="stack detail-field">
                  <span class="muted">${escapeHtml(t(locale, "storage.color", "Color"))}</span>
                  <input
                    class="text-input"
                    name="filament-color-name"
                    type="text"
                    value="${escapeHtml(String(draft.colorName || ""))}"
                    placeholder="${escapeHtml(t(locale, "storage.colorPlaceholder", "Blue, White, Carbon..."))}"
                  />
                </label>
                <label class="stack detail-field">
                  <span class="muted">${escapeHtml(t(locale, "storage.swatch", "Swatch"))}</span>
                  <input
                    class="swatch-input"
                    name="filament-hex-color"
                    type="color"
                    value="${escapeHtml(toSwatchColor(selection.previewHex))}"
                  />
                </label>
              </div>
            `
            : `
              <div class="stack add-spool-catalog-block">
                <input
                  class="search-input"
                  name="filament-catalog-search"
                  type="search"
                  value="${escapeHtml(String(draft.catalogSearch || ""))}"
                  placeholder="${escapeHtml(
                    selection.source === "bambu"
                      ? t(locale, "storage.catalogSearchBambu", "Search material, color, or filament code")
                      : t(locale, "storage.catalogSearch", "Search material, filament, color, or vendor"),
                  )}"
                  autocomplete="off"
                />
                <div class="dense-list add-spool-catalog-list">
                  ${
                    selection.visibleCatalogMasters.length > 0
                      ? selection.visibleCatalogMasters
                          .map((master) => {
                            const selected = selection.selectedMaster?.id === master.id;
                            const masterStyle = swatchCssStyle(master.hex_color);
                            return `
                              <button
                                class="list-row dense-list-row spool-list-row swatch-surface add-spool-catalog-row"
                                type="button"
                                data-action="select-master"
                                data-master-id="${escapeHtml(master.id)}"
                                data-active="${selected ? "true" : "false"}"
                                style="${escapeHtml(masterStyle)}"
                              >
                                <div class="dense-list-main">
                                  <div class="swatch-line spool-row-title">
                                    <span class="swatch-dot" style="background:${escapeHtml(
                                      toSwatchColor(master.hex_color),
                                    )};"></span>
                                    <span class="list-title">${escapeHtml(
                                      formatInventoryDisplayTitle(
                                        master.material,
                                        master.filament_name,
                                        master.color_name,
                                      ),
                                    )}</span>
                                  </div>
                                </div>
                                <div class="dense-list-side">
                                  ${
                                    selected
                                      ? `<span class="pill">${escapeHtml(t(locale, "storage.selected", "Selected"))}</span>`
                                      : ""
                                  }
                                  ${
                                    master.is_discontinued
                                      ? `<span class="pill">${escapeHtml(t(locale, "storage.discontinued", "Discontinued"))}</span>`
                                      : ""
                                  }
                                </div>
                              </button>
                            `;
                          })
                          .join("")
                      : `<div class="empty-card">${escapeHtml(
                          t(locale, "storage.noCatalogMatches", "No catalog entries match this vendor filter."),
                        )}</div>`
                  }
                </div>
              </div>
            `
        }
      </section>

      ${renderSwatchSelectionCard({
        badges: [selectionBadge],
        body: `
        <form class="stack add-spool-action-form" data-action="add-spool-form">
          ${renderSelectionHiddenInputs(selection, escapeHtml)}
          <input type="hidden" name="filament-ownership-type" value="${escapeHtml(
            isBorrowedIn ? "BORROWED_IN" : "OWNED",
          )}" />

          <div class="stack add-spool-section-head">
            <div class="list-title">${escapeHtml(t(locale, "storage.addSpool", "Add spool"))}</div>
          </div>

          <div class="segmented-control">
            ${[
              ["OWNED", t(locale, "storage.owned", "Owned")],
              ["BORROWED_IN", t(locale, "storage.borrowedInAction", "Borrowed-in")],
            ]
              .map(
                ([ownershipType, label]) => `
                  <button
                    class="segment-button"
                    type="button"
                    data-action="set-filament-ownership"
                    data-ownership-type="${escapeHtml(ownershipType)}"
                    data-active="${isBorrowedIn === (ownershipType === "BORROWED_IN") ? "true" : "false"}"
                  >
                    <span>${escapeHtml(label)}</span>
                  </button>
                `,
              )
              .join("")}
          </div>

          ${
            isBorrowedIn
              ? `
                <div class="borrowed-in-grid add-spool-grid">
                  <label class="stack detail-field">
                    <span class="muted">${escapeHtml(t(locale, "storage.borrowedFrom", "Borrowed from"))}</span>
                    <input
                      class="text-input"
                      name="filament-owner-name"
                      type="text"
                      autocomplete="name"
                      value="${escapeHtml(String(draft.ownerName || ""))}"
                      placeholder="${escapeHtml(
                        t(locale, "storage.borrowedFromPlaceholder", "Owner or counterparty name"),
                      )}"
                    />
                  </label>
                  <label class="stack detail-field">
                    <span class="muted">${escapeHtml(t(locale, "storage.ownerContactOptional", "Owner contact (optional)"))}</span>
                    <input
                      class="text-input"
                      name="filament-owner-contact"
                      type="text"
                      autocomplete="email"
                      value="${escapeHtml(String(draft.ownerContact || ""))}"
                      placeholder="${escapeHtml(
                        t(locale, "storage.ownerContactPlaceholder", "Phone, email, or handle"),
                      )}"
                    />
                  </label>
                </div>
              `
              : ""
          }

          <div class="borrowed-in-grid add-spool-grid">
            <label class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "storage.startingWeight", "Starting weight (grams)"))}</span>
              <input
                class="weight-input"
                name="filament-initial-weight"
                type="number"
                min="0"
                step="1"
                value="${escapeHtml(String(draft.initialWeight || selection.selectedMaster?.default_weight || 1000))}"
              />
            </label>
            <label class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "storage.homeLocationOptional", "Home location (optional)"))}</span>
              <input
                class="text-input"
                name="filament-location"
                type="text"
                value="${escapeHtml(String(draft.location || ""))}"
                placeholder="${escapeHtml(t(locale, "storage.homeLocationPlaceholder", "Shelf, bin, drawer, cart..."))}"
              />
            </label>
            ${
              isBorrowedIn
                ? `
                  <label class="stack detail-field borrowed-in-field-wide">
                    <span class="muted">${escapeHtml(t(locale, "storage.noteOptional", "Note (optional)"))}</span>
                    <textarea
                      class="detail-textarea borrowed-note-textarea"
                      name="filament-note"
                      rows="3"
                      placeholder="${escapeHtml(t(locale, "storage.notePlaceholder", "Return timing or other context"))}"
                    >${escapeHtml(String(draft.note || ""))}</textarea>
                  </label>
                `
                : ""
            }
          </div>

          <div class="detail-actions form-action-block utility-sheet-actions">
            ${renderCompanionActionButton({
              type: "submit",
              swatch: true,
              disabled: busy || catalogSelectionMissing,
              escapeHtml,
              label:
                isBorrowedIn
                  ? t(locale, "storage.registerBorrowedIn", "Register borrowed-in spool")
                  : t(locale, "storage.addSpoolToInventory", "Add spool to inventory"),
            })}
          </div>
        </form>

        <div class="add-spool-action-divider"></div>

        <form class="stack add-spool-action-form" data-action="wishlist-item-form">
          ${renderSelectionHiddenInputs(selection, escapeHtml)}

          <div class="stack add-spool-section-head">
            <div class="list-title">${escapeHtml(t(locale, "storage.addToWishlist", "Add to wishlist / order"))}</div>
          </div>

          <div class="borrowed-in-grid add-spool-grid">
            <label class="stack detail-field">
              <span class="muted">${escapeHtml(t(locale, "storage.quantity", "Qty"))}</span>
              <input
                class="weight-input"
                name="wishlist-quantity"
                type="number"
                min="1"
                step="1"
                value="${escapeHtml(String(draft.wishlistQuantity || "1"))}"
              />
            </label>
            <label class="stack detail-field borrowed-in-field-wide">
              <span class="muted">${escapeHtml(t(locale, "storage.noteOptional", "Note (optional)"))}</span>
              <input
                class="text-input"
                name="wishlist-note"
                type="text"
                value="${escapeHtml(String(draft.wishlistNote || ""))}"
                placeholder="${escapeHtml(t(locale, "storage.notePlaceholder", "Return timing or other context"))}"
              />
            </label>
          </div>

          <div class="detail-actions form-action-block utility-sheet-actions">
            ${renderCompanionActionButton({
              variant: "secondary",
              type: "submit",
              swatch: true,
              disabled: busy || catalogSelectionMissing,
              escapeHtml,
              label: t(locale, "storage.addCurrentSelectionToWishlist", "Add current selection to wishlist"),
            })}
          </div>
        </form>
        `,
        className: "add-spool-section add-spool-selection-card",
        escapeHtml,
        meta: previewMeta,
        swatch: selection.previewHex,
        title: previewTitle,
      })}

      <details class="surface-card add-spool-section detail-collapsible" data-collapsible="wishlist-queue">
        <summary class="detail-collapsible-summary">
          <span>${escapeHtml(t(locale, "storage.wishlistQueue", "Wishlist / order queue"))}</span>
          <span class="detail-history-summary">${escapeHtml(
            t(locale, "storage.wishlistQueueHelp", "Move items between wishlist, on-order, and received, or stock them directly now."),
          )}</span>
        </summary>

        <div class="detail-collapsible-body">
          <div class="pill-row add-spool-filter-row">
            ${[
              ["ALL", `${t(locale, "storage.allCatalog", "All")} ${selection.wishlistSummary.all}`],
              ["WISHLIST", `${t(locale, "storage.wishlist", "Wishlist")} ${selection.wishlistSummary.wishlist}`],
              ["ON_ORDER", `${t(locale, "storage.onOrder", "On order")} ${selection.wishlistSummary.onOrder}`],
              ["RECEIVED", `${t(locale, "storage.received", "Received")} ${selection.wishlistSummary.received}`],
            ]
              .map(
                ([filter, label]) => `
                  <button
                    class="${selection.wishlistFilter === filter ? "secondary-button" : "ghost-button"}"
                    type="button"
                    data-action="set-wishlist-filter"
                    data-wishlist-filter="${escapeHtml(filter)}"
                  >
                    ${escapeHtml(label)}
                  </button>
                `,
              )
              .join("")}
          </div>

          <div class="dense-list add-spool-wishlist-list">
            ${
              selection.visibleWishlistItems.length > 0
                ? wishlistRows
                : `<div class="empty-card">${escapeHtml(
                    selection.wishlistSummary.all > 0
                      ? t(locale, "storage.noWishlistMatch", "No wishlist items match this filter.")
                      : t(locale, "storage.noWishlistItems", "No wishlist items yet."),
                  )}</div>`
            }
          </div>
        </div>
      </details>
    </div>
  `;
}

function renderSelectedSpoolHiddenBanner(
  selectedSpool,
  hasLoanHistory,
  escapeHtml,
  formatGrams,
  formatPlacementLabel,
  locale = "en",
) {
  const displayTitle = formatInventoryDisplayTitle(
    selectedSpool.master.material,
    selectedSpool.master.filament_name,
    selectedSpool.master.color_name,
  );
  const homeLocationId = selectedSpool.spool.home_location_id || "";
  const summaryLine = [
    formatRollReference(selectedSpool.spool),
    formatGrams(selectedSpool.spool.remaining_g),
    selectedSpool.spool.location_id ? formatPlacementLabel(selectedSpool.spool.location_id, locale) : "",
    homeLocationId &&
    homeLocationId !== selectedSpool.spool.location_id
      ? `${t(locale, "storage.homeLocationShort", "Home")}: ${formatPlacementLabel(homeLocationId, locale)}`
      : "",
  ]
    .filter(Boolean)
    .map((value) => escapeHtml(value))
    .join(" · ");
  return `
    <div
      class="selection-banner selection-banner-muted compact-selection-banner storage-hidden-banner swatch-surface"
      style="${escapeHtml(swatchCssStyle(selectedSpool.master.hex_color))}"
    >
      <div class="selection-banner-copy">
        <div class="list-title">
          ${escapeHtml(t(locale, "storage.hiddenSelectedTitle", "Selected spool hidden"))}
        </div>
        <div class="section-copy">
          ${escapeHtml(
            t(locale, "storage.hiddenSelectedBody", "{title} stays selected for detail, slots, and loans.", {
              title: displayTitle,
            }),
          )}
        </div>
      </div>
      <div class="selection-banner-summary meta-line">${summaryLine}</div>
      <div class="selection-banner-actions">
        ${renderCompanionActionButton({
          variant: "secondary",
          swatch: true,
          attributes: { "data-action": "clear-inventory-search" },
          escapeHtml,
          label: t(locale, "storage.clearSearch", "Clear search"),
        })}
        ${
          hasLoanHistory
            ? renderCompanionActionButton({
                variant: "ghost",
                attributes: { "data-action": "set-root-flow", "data-root-flow": "loans" },
                escapeHtml,
                label: t(locale, "loans.title", "Loans"),
              })
            : ""
        }
        ${renderCompanionActionButton({
          variant: "ghost",
          attributes: { "data-action": "open-current-detail" },
          escapeHtml,
          label: t(locale, "detail.openDetail", "Detail"),
        })}
      </div>
    </div>
  `;
}

function renderSpoolRows(options) {
  const {
    state,
    spools,
    escapeHtml,
    formatGrams,
    formatPlacementLabel,
    ownershipLabel,
  } = options;
  const locale = state.locale || "en";

  if (spools.length <= 0) {
    return `<div class="empty-card">${escapeHtml(t(locale, "storage.noMatch", "No local spools matched the current search."))}</div>`;
  }

  return spools
    .map((row) => {
      const active = row.spool.id === state.selectedSpoolId;
      const swatch = row.master.hex_color || "#ced8e3";
      const displayTitle = formatInventoryDisplayTitle(
        row.master.material,
        row.master.filament_name,
        row.master.color_name,
      );
      const subtitleBits = [row.master.vendor || "Unknown vendor", formatRollReference(row.spool)]
        .filter(Boolean)
        .map((value) => escapeHtml(value))
        .join(" · ");
      const metaBits = [
        row.spool.location_id ? formatPlacementLabel(row.spool.location_id, locale) : "",
        row.spool.home_location_id && row.spool.home_location_id !== row.spool.location_id
          ? `${t(locale, "storage.homeLocationShort", "Home")}: ${formatPlacementLabel(row.spool.home_location_id, locale)}`
          : "",
        row.spool.owner_name
          ? t(locale, "loans.borrowedFrom", "Borrowed from {name}", { name: row.spool.owner_name })
          : "",
      ]
        .filter(Boolean)
        .map((value) => escapeHtml(value))
        .join(" · ");
      const rowBadges = [];
      const rowStatus = parseSpoolStatus(row.spool.status) || normalizeDomainToken(row.spool.status);
      if (rowStatus && rowStatus !== "IN_STOCK") {
        rowBadges.push(formatStatusLabel(rowStatus, locale));
      }
      if (isBorrowedInOwnership(row.spool.ownership_type)) {
        rowBadges.push(ownershipLabel(row.spool));
      }
      return `
        <button
          class="list-row dense-list-row spool-list-row swatch-surface"
          type="button"
          data-active="${active ? "true" : "false"}"
          data-action="select-spool"
          data-spool-id="${escapeHtml(row.spool.id)}"
          style="${escapeHtml(swatchCssStyle(swatch))}"
        >
          <div class="dense-list-main">
            <div class="swatch-line spool-row-title">
              <span class="swatch-dot" style="background:${escapeHtml(swatch)};"></span>
              <span class="list-title">${escapeHtml(displayTitle)}</span>
            </div>
            <div class="list-subtitle">${subtitleBits}</div>
            ${metaBits ? `<div class="meta-line spool-row-meta">${metaBits}</div>` : ""}
          </div>
          <div class="dense-list-side">
            <div class="spool-row-weight">${escapeHtml(formatGrams(row.spool.remaining_g))}</div>
            ${
              rowBadges.length > 0
                ? `
                  <div class="pill-row compact-pill-row">
                    ${rowBadges.map((label) => `<span class="pill">${escapeHtml(label)}</span>`).join("")}
                  </div>
                `
                : ""
            }
          </div>
        </button>
      `;
    })
    .join("");
}

export function renderStorageShell(options) {
  const {
    state,
    spools,
    selectedSpool,
    escapeHtml,
    formatGrams,
    formatPlacementLabel,
    ownershipLabel,
  } = options;
  const locale = state.locale || "en";

  const selectedSpoolVisible = selectedSpool
    ? spools.some((row) => row.spool.id === selectedSpool.spool.id)
    : false;
  const hasLoanHistory = Boolean(
    selectedSpool &&
      state.loanHistory.some((row) => row.loan.spool_id === selectedSpool.spool.id),
  );

  return `
    <section class="workflow-shell storage-shell">
      <div class="workflow-header">
        <div class="workflow-header-copy">
          <h2>${escapeHtml(t(locale, "storage.title", "Inventory"))}</h2>
          <p class="section-copy">
            ${escapeHtml(t(locale, "storage.subtitle", "Browse inventory and open the spool you need."))}
          </p>
        </div>
        <div class="workflow-header-side workflow-header-summary">
          ${escapeHtml(t(locale, "nav.visibleCount", "{count} visible", { count: spools.length }))}
        </div>
      </div>

      <div class="workflow-toolbar">
        <div class="toolbar-row">
          <input
            class="search-input toolbar-search"
            name="inventory-search"
            value="${escapeHtml(state.search)}"
            placeholder="${escapeHtml(t(locale, "storage.searchPlaceholder", "Search filament, color, owner, or placement"))}"
            autocomplete="off"
          />
          <div class="toolbar-actions">
            ${renderCompanionActionButton({
              disabled: state.busy,
              attributes: { "data-action": "toggle-add-spool-form" },
              escapeHtml,
              label: t(locale, "storage.addSpool", "Add spool"),
            })}
          </div>
        </div>
      </div>

      ${
        selectedSpool && state.search.trim() && !selectedSpoolVisible
          ? renderSelectedSpoolHiddenBanner(
              selectedSpool,
              hasLoanHistory,
              escapeHtml,
              formatGrams,
              formatPlacementLabel,
              locale,
            )
          : ""
      }

      <div class="workflow-body">
        <div class="dense-list">
          ${renderSpoolRows({
            state,
            spools,
            selectedSpool,
            escapeHtml,
            formatGrams,
            formatPlacementLabel,
            ownershipLabel,
          })}
        </div>
      </div>
    </section>
  `;
}
