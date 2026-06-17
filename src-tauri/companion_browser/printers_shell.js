import { t } from "./companion_i18n.js";
import { printerBrandCssVars, styleObjectToString } from "./companion_theme.js";
import { renderPrinterBoard, renderPrinterRoster } from "./printer_workspace.js";

export function renderPrintersShell(options) {
  const { state, activePrinter, escapeHtml, formatGrams, printerSpoolOptions = [] } = options;
  const locale = state.locale || "en";
  const printerCount = Array.isArray(state.printers) ? state.printers.length : 0;
  const showPrinterRoster = printerCount > 1;
  const activePrinterToneStyle = styleObjectToString(
    printerBrandCssVars(activePrinter?.printer?.model || ""),
  );

  return `
    <section class="workflow-shell printers-shell">
      <div class="workflow-header">
        <div class="workflow-header-copy">
          <h2>${escapeHtml(t(locale, "printers.title", "Printers"))}</h2>
          <p class="section-copy">${escapeHtml(t(locale, "printers.subtitle", "Pick a printer and load empty slots."))}</p>
        </div>
      </div>

      <div class="printers-workspace${showPrinterRoster ? " printers-workspace--with-roster" : " printers-workspace--single"}">
        ${
          showPrinterRoster
            ? `
        <div class="surface-panel printer-roster">
          <div class="stack">
            ${renderPrinterRoster(state.printers, state.activePrinterId, escapeHtml, locale)}
          </div>
        </div>
        `
            : ""
        }

        <div class="surface-panel printer-board${activePrinterToneStyle ? " printer-brand-surface" : ""}" ${activePrinterToneStyle ? `style="${escapeHtml(activePrinterToneStyle)}"` : ""}>
          ${renderPrinterBoard({
            state,
            activePrinter,
            printerSpoolOptions,
            escapeHtml,
            formatGrams,
          })}
        </div>
      </div>
    </section>
  `;
}
