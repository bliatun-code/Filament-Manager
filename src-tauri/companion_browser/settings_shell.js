import { t } from "./companion_i18n.js";
import { renderSegmentedControl } from "./shell_chrome.js";

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
  const themeSummary =
    themeMode === "auto"
      ? `${t(locale, "settings.followDevice", "Following device")} · ${t(locale, `settings.${resolvedTheme}`, resolvedTheme)}`
      : t(locale, "settings.modeSummary", "{mode} mode · {resolved}", {
          mode: t(locale, `settings.${themeMode}`, themeMode),
          resolved: t(locale, `settings.${resolvedTheme}`, resolvedTheme),
        });
  const countLabel = (count, singular, plural) =>
    `${count} ${count === 1 ? singular : plural}`;
  const connectionSummary =
    connectionSummaryOption ||
    [
      state.apiReady
        ? t(locale, "settings.trustedLanConnected", "Trusted-LAN connected")
        : t(locale, "settings.disconnected", "Disconnected"),
      countLabel(state.spools.length, locale === "nb" ? "spole" : "spool", locale === "nb" ? "spoler" : "spools"),
      countLabel(state.printers.length, locale === "nb" ? "printer" : "printer", locale === "nb" ? "printere" : "printers"),
      countLabel(
        state.activeLoans.length,
        locale === "nb" ? "aktivt utlån" : "active loan",
        locale === "nb" ? "aktive utlån" : "active loans",
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
              columns: 3,
              escapeHtml,
              items: [
                { value: "auto", label: t(locale, "settings.auto", "Auto"), meta: t(locale, "settings.autoHelp", "Follow device") },
                { value: "light", label: t(locale, "settings.light", "Light"), meta: t(locale, "settings.lightHelp", "Bright surfaces") },
                { value: "dark", label: t(locale, "settings.dark", "Dark"), meta: t(locale, "settings.darkHelp", "Low-light friendly") },
              ],
              valueAttribute: "data-theme-mode",
            })}
            <div class="meta-line">${escapeHtml(themeSummary)}</div>
            <div class="stack settings-language-block">
              <div>
                <div class="list-title">${escapeHtml(t(locale, "settings.language", "Language"))}</div>
              </div>
              ${renderSegmentedControl({
                action: "set-locale",
                activeValue: locale,
                ariaLabel: t(locale, "settings.language", "Language"),
                columns: 2,
                escapeHtml,
                items: [
                  { value: "nb", label: t(locale, "settings.norwegian", "Norwegian") },
                  { value: "en", label: t(locale, "settings.english", "English") },
                ],
                valueAttribute: "data-locale",
              })}
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
            <div class="detail-actions">
              <button class="primary-button" type="button" data-action="refresh" ${busy ? "disabled" : ""}>
                ${escapeHtml(t(locale, "shell.refreshCompanionData", "Refresh data"))}
              </button>
            </div>
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
              <a class="ghost-button companion-link-button" href="${escapeHtml(APP_SOURCE_URL)}" target="_blank" rel="noreferrer">
                ${escapeHtml(t(locale, "settings.sourceCode", "Source code"))}
              </a>
              <a class="ghost-button companion-link-button" href="${escapeHtml(APP_LICENSE_URL)}" target="_blank" rel="noreferrer">
                ${escapeHtml(t(locale, "settings.viewLicense", "View license"))}
              </a>
              <a class="ghost-button companion-link-button" href="${escapeHtml(APP_NOTICE_URL)}" target="_blank" rel="noreferrer">
                ${escapeHtml(t(locale, "settings.viewNotices", "Notices"))}
              </a>
            </div>
          </div>
        </section>
      </div>
    </section>
  `;
}
