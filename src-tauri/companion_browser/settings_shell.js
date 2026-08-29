import { t } from "./companion_i18n.js";
import { SELECTABLE_LOCALES } from "./supported_locales.js";
import { COMPANION_THEME_OPTIONS } from "./companion_theme.js";
import {
  renderCompanionActionButton,
  renderCompanionActionLink,
  renderFormActionBlock,
  renderSegmentedControl,
} from "./shell_chrome.js";

const APP_LICENSE_ID = "AGPL-3.0-or-later";
const APP_LICENSE_URL = "https://github.com/bliatun-code/Filament-Manager/blob/main/LICENSE";
const APP_NOTICE_URL = "https://github.com/bliatun-code/Filament-Manager/blob/main/NOTICE.md";
const APP_SOURCE_URL = "https://github.com/bliatun-code/Filament-Manager";

export function renderSettingsShell(options) {
  const { state, escapeHtml, connectionSummary: connectionSummaryOption = "" } = options;
  const busy = state.busy || state.detailBusy;
  const locale = state.locale || "en";
  const themeMode = String(state.themeMode || "auto").trim().toLowerCase();
  const resolvedTheme = String(state.resolvedTheme || "light").trim().toLowerCase();
  const selectedTheme =
    COMPANION_THEME_OPTIONS.find(({ id }) => id === themeMode) ?? COMPANION_THEME_OPTIONS[0];
  const selectedThemeLabel = t(
    locale,
    selectedTheme.labelKey,
    selectedTheme.labelFallback,
  );
  const themeSummary =
    themeMode === "auto"
      ? `${t(locale, "settings.followDevice", "Following device")} · ${t(locale, `settings.${resolvedTheme}`, resolvedTheme)}`
      : t(locale, "settings.modeSummary", "{mode} mode", {
          mode: selectedThemeLabel,
        });
  const connectionSummary =
    connectionSummaryOption ||
    [
      state.apiReady
        ? t(locale, "settings.trustedLanConnected", "Trusted-LAN connected")
        : t(locale, "settings.disconnected", "Disconnected"),
      t(locale, "settings.spoolCount", "{count, plural, one {# spool} other {# spools}}", {
        count: state.spools.length,
      }),
      t(locale, "settings.printerCount", "{count, plural, one {# printer} other {# printers}}", {
        count: state.printers.length,
      }),
      t(
        locale,
        "settings.activeLoanCount",
        "{count, plural, one {# active loan} other {# active loans}}",
        { count: state.activeLoans.length },
      ),
    ].join(" · ");
  return `
    <section class="workflow-shell settings-shell">
      <div class="workflow-header">
        <div class="workflow-header-copy">
          <h2>${escapeHtml(t(locale, "settings.title", "Settings"))}</h2>
          <p class="section-copy">${escapeHtml(t(locale, "settings.subtitle", "Appearance, language, and session status."))}</p>
        </div>
      </div>

      <div class="settings-shell-grid">
        <section class="surface-panel settings-card">
          <div class="section-header">
            <div>
              <h3>${escapeHtml(t(locale, "settings.appearance", "Appearance"))}</h3>
              <p class="section-copy">${escapeHtml(t(locale, "settings.appearanceHelp", "Choose theme and language."))}</p>
            </div>
          </div>
          <div class="stack">
            ${renderSegmentedControl({
              action: "set-theme-mode",
              activeValue: themeMode,
              ariaLabel: t(locale, "settings.themeMode", "Theme mode"),
              className: "settings-theme-control",
              columns: COMPANION_THEME_OPTIONS.length,
              escapeHtml,
              items: COMPANION_THEME_OPTIONS.map((theme) => ({
                value: theme.id,
                label: t(locale, theme.labelKey, theme.labelFallback),
                meta: t(locale, theme.helpKey, theme.helpFallback),
              })),
              valueAttribute: "data-theme-mode",
            })}
            <div class="meta-line">${escapeHtml(themeSummary)}</div>
            <div class="stack settings-language-block">
              <div>
                <div class="list-title">${escapeHtml(t(locale, "settings.language", "Language"))}</div>
              </div>
              <label class="settings-locale-field">
                <span class="sr-only">${escapeHtml(t(locale, "settings.language", "Language"))}</span>
                <select
                  class="settings-locale-select"
                  name="app-locale"
                  aria-label="${escapeHtml(t(locale, "settings.language", "Language"))}"
                >
                  ${SELECTABLE_LOCALES.map(
                    ({ id, nativeLabel }) =>
                      `<option value="${escapeHtml(id)}"${id === locale ? " selected" : ""}>${escapeHtml(nativeLabel)}</option>`,
                  ).join("")}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section class="surface-panel settings-card">
          <div class="section-header">
            <div>
              <h3>${escapeHtml(t(locale, "settings.connection", "Connection"))}</h3>
              <p class="section-copy">${escapeHtml(t(locale, "settings.connectionHelp", "Connection and data refresh."))}</p>
            </div>
          </div>
          <div class="stack">
            <div class="meta-line">${escapeHtml(connectionSummary)}</div>
            ${renderFormActionBlock({
              actions: renderCompanionActionButton({
                attributes: { "data-action": "refresh" },
                disabled: busy,
                escapeHtml,
                label: t(locale, "shell.refreshCompanionData", "Refresh data"),
              }),
              escapeHtml,
            })}
          </div>
        </section>

        <section class="surface-panel settings-card">
          <div class="section-header">
            <div>
              <h3>${escapeHtml(t(locale, "settings.license", "License"))}</h3>
              <p class="section-copy">${escapeHtml(t(locale, "settings.licenseHelp", "Open source terms for this browser companion."))}</p>
            </div>
          </div>
          <div class="stack">
            <div class="meta-line">
              <strong>${escapeHtml(APP_LICENSE_ID)}</strong>
            </div>
            <div class="detail-actions settings-license-links">
              ${renderCompanionActionLink({
                attributes: { target: "_blank", rel: "noreferrer" },
                className: "companion-link-button",
                escapeHtml,
                href: APP_SOURCE_URL,
                label: t(locale, "settings.sourceCode", "Source code"),
              })}
              ${renderCompanionActionLink({
                attributes: { target: "_blank", rel: "noreferrer" },
                className: "companion-link-button",
                escapeHtml,
                href: APP_LICENSE_URL,
                label: t(locale, "settings.viewLicense", "View license"),
              })}
              ${renderCompanionActionLink({
                attributes: { target: "_blank", rel: "noreferrer" },
                className: "companion-link-button",
                escapeHtml,
                href: APP_NOTICE_URL,
                label: t(locale, "settings.viewNotices", "Notices"),
              })}
            </div>
          </div>
        </section>
      </div>
    </section>
  `;
}
