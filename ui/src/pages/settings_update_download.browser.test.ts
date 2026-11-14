import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { SOURCE_LOCALES } from "../../../src-tauri/companion_browser/supported_locales.js";
import { createVisualQaFixture } from "../../../scripts/create-visual-qa-fixture.mjs";
import { createUiViteServer, installTauriFixtureBridge } from "../../../scripts/run-data-backed-accessibility.mjs";
import { buildUiBrowserPerformanceFixture, resolveUiBrowserPerformanceInvoke } from "../../../scripts/ui-browser-performance-probe.mjs";
import { cleanupVisualQaDatabase } from "../../../scripts/visual-qa-db.mjs";
import { APP_UPDATE_PREFERENCES_STORAGE_KEY } from "../lib/app_update_preferences";
import { loadLocaleDictionary, type Locale } from "../lib/i18n";
import type { AppUpdateCheckResult, AppUpdateInstaller } from "../lib/tauri_maintenance_client";

const releasePage = "https://github.com/bliatun-code/Filament-Manager/releases/latest";
const downloadBase = "https://github.com/bliatun-code/Filament-Manager/releases/download/v0.36.1/Filament-Manager_0.36.1";
const installers = [
  { installer: { platform: "macos", url: `${downloadBase}_universal.dmg` }, label: "Download for macOS" },
  { installer: { platform: "windows_x64", url: `${downloadBase}_x64-setup.exe` }, label: "Download for Windows x64" },
] satisfies { installer: AppUpdateInstaller; label: string }[];

test("Settings and the update banner open the installer for this device and keep the release page fallback", { timeout: 120_000 }, async () => {
  const generated = createVisualQaFixture();
  const fixture = buildUiBrowserPerformanceFixture(generated.outputPath);
  const server = await createUiViteServer({
    configFile: resolve("ui/vite.config.ts"),
    root: resolve("ui"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== "string");
    browser = await chromium.launch();

    for (const { installer, label } of installers) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        const navigation = page.getByRole("navigation", { name: "Navigation", exact: true });
        const calls: { command: string; payload: unknown }[] = [];
        let response: AppUpdateCheckResult = {
          current_version: "0.36.0",
          latest_version: "0.36.1",
          latest_tag: "v0.36.1",
          release_url: releasePage,
          installer,
          status: "UPDATE_AVAILABLE",
          update_channel: "PUBLIC_METADATA",
        };
        await page.addInitScript((storageKey) => localStorage.setItem(storageKey, JSON.stringify({
          automaticChecksEnabled: true,
          dismissedUntil: null,
          dismissedVersion: null,
          lastAutomaticCheckAt: Date.now(),
        })), APP_UPDATE_PREFERENCES_STORAGE_KEY);
        await installTauriFixtureBridge(page, fixture, calls, (data, command, payload) => {
          if (command === "check_for_app_update") return response;
          if (command === "open_external_url") return null;
          return resolveUiBrowserPerformanceInvoke(data, command, payload);
        });
        await page.goto(`http://127.0.0.1:${address.port}/?bfm_locale=en`);
        await navigation.getByRole("button", { name: "Settings", exact: true }).click();
        const settings = page.locator("#settings-update-check");
        const banner = page.getByRole("complementary", { name: "Updates", exact: true });
        const check = settings.getByRole("button", { name: "Check for updates", exact: true });
        const settingsDownload = settings.getByRole("link", { name: label, exact: true });
        const bannerDownload = banner.getByRole("link", { name: label, exact: true });
        const viewRelease = settings.getByRole("button", { name: "View release", exact: true });
        const openedUrls = () => calls.filter(({ command }) => command === "open_external_url")
          .map(({ payload }) => payload);

        await check.click();
        await settings.getByRole("status").getByText("Version 0.36.1 is available.", { exact: true }).waitFor();
        await settingsDownload.waitFor();
        await bannerDownload.waitFor();
        assert.equal(await settingsDownload.getAttribute("href"), installer.url);
        assert.equal(await bannerDownload.getAttribute("href"), installer.url);
        assert.deepEqual(openedUrls(), []);
        await settingsDownload.click();
        await bannerDownload.click();
        await viewRelease.click();
        assert.deepEqual(openedUrls(), [{ url: installer.url }, { url: installer.url }, { url: releasePage }]);

        response = { ...response, installer: null };
        await check.click();
        await viewRelease.waitFor();
        assert.equal(await settingsDownload.count(), 0);
        assert.equal(await bannerDownload.count(), 0);

        response = { ...response, current_version: "0.36.1", status: "UP_TO_DATE" };
        await check.click();
        await settings.getByRole("status").getByText("Version 0.36.1 is the latest published release.", { exact: true }).waitFor();
        assert.equal(await viewRelease.count(), 0);
        assert.equal(await banner.count(), 0);

        response = {
          ...response,
          latest_tag: null,
          latest_version: null,
          status: "RELEASE_INFO_UNAVAILABLE",
        };
        await check.click();
        await settings.getByRole("status").getByText("Release information is not available right now. Try again later.", { exact: true }).waitFor();
        assert.equal(await viewRelease.count(), 0);
        assert.equal(await banner.count(), 0);
      } finally {
        await context.close();
      }
    }

    const localePage = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await localePage.addInitScript((storageKey) => localStorage.removeItem(storageKey), APP_UPDATE_PREFERENCES_STORAGE_KEY);
    await installTauriFixtureBridge(localePage, fixture, [], (data, command, payload) => {
      if (command === "check_for_app_update") {
        return {
          current_version: "0.36.0",
          latest_version: "0.36.1",
          latest_tag: "v0.36.1",
          release_url: releasePage,
          installer: installers[1].installer,
          status: "UPDATE_AVAILABLE",
          update_channel: "PUBLIC_METADATA",
        } satisfies AppUpdateCheckResult;
      }
      return resolveUiBrowserPerformanceInvoke(data, command, payload);
    });
    for (const { id, intlLocale } of SOURCE_LOCALES) {
      const dictionary = await loadLocaleDictionary(id as Locale);
      assert.ok(typeof dictionary !== "string", id);
      const { settings, nav } = dictionary;
      assert.ok(typeof settings !== "string" && typeof nav !== "string", id);
      assert.ok(typeof nav.settings === "string" && typeof settings.checkForUpdates === "string" &&
        typeof settings.downloadInstaller === "string", id);
      const expected = formatMessage(settings.downloadInstaller, { platform: "Windows x64" }, intlLocale);

      await localePage.goto(`http://127.0.0.1:${address.port}/?bfm_locale=${id}`);
      await localePage.locator("nav.app-nav").getByRole("button", { name: nav.settings, exact: true }).click();
      const updateSection = localePage.locator("#settings-update-check");
      await updateSection.getByRole("button", { name: settings.checkForUpdates, exact: true }).click();
      const download = updateSection.getByRole("link", { name: expected, exact: true });
      await download.waitFor();
      assert.equal(await download.getAttribute("href"), installers[1].installer.url, id);
      const clipped = await download.evaluate((link) => link.scrollWidth > link.clientWidth + 2 ||
        link.getBoundingClientRect().right > innerWidth + 2);
      assert.equal(clipped, false, `${id}: download link fits at 390px`);
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
    cleanupVisualQaDatabase(generated.outputPath);
  }
});
