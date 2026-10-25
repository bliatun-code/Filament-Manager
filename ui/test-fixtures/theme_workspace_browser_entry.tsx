/* eslint-disable react-refresh/only-export-components -- Production components in an isolated visual QA harness. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PrinterModelPicker } from "../src/components/printer_model_picker";
import { PrinterModelPreview } from "../src/components/printer_model_preview";
import { I18nProvider } from "../src/lib/i18n_provider";
import { loadLocaleDictionary, useI18n, type Locale } from "../src/lib/i18n";
import { initThemeMode, getThemeMode, type ThemeMode } from "../src/lib/theme_mode";
import { resolvePrinterModelProfile } from "../src/lib/printer_profiles";
import "../src/index.css";

export { mountInventoryWorkspacePreview } from "./inventory_balanced_workspace_entry";
export { mountPrintersWorkspace } from "./printers_balanced_workspace_entry";
export { mountSettingsPreview } from "./settings_balanced_browser_entry";
export { mountPrintersSettingsPreview } from "./settings_printers_balanced_browser_entry";
export { mountBalancedSpoolPreview } from "./inventory_spool_balanced_browser_entry";
export { getThemeMode };

function PickerPreview() {
  const { t } = useI18n();
  const [model, setModel] = useState("Bambu Lab P1S");
  const [saved, setSaved] = useState("");
  const profile = resolvePrinterModelProfile(model);
  return <main className="page-shell" style={{ maxWidth: "70rem" }}>
    <h1 className="page-title">{t("settings.addPrinter", "Add printer")}</h1>
    <form className="surface-card space-y-4 mt-5" onSubmit={(event) => { event.preventDefault(); setSaved(model); }}>
      <h2>{t("settings.printerModel", "Printer model")}</h2>
      <PrinterModelPicker id="qa-printer-model" value={model} onChange={setModel} allowCustom />
      <div className="surface-subtle flex items-center gap-5 p-4"><PrinterModelPreview model={model} hasMultiMaterial={profile.defaultUnits > 0} />
        <div><strong>{model}</strong><p className="text-slate-500">{profile.systemKind} · {profile.defaultSlotsPerUnit}</p></div>
      </div>
      <button type="submit" className="app-primary-action rounded-md px-4 py-2">{t("common.save", "Save")}</button>
      <output>{saved}</output>
    </form>
  </main>;
}

export async function mountPrinterPickerPreview(locale: Locale = "nb", theme: ThemeMode = "dark") {
  await loadLocaleDictionary(locale);
  localStorage.setItem("bfm-locale", locale);
  localStorage.setItem("bfm-theme-mode", theme);
  initThemeMode();
  createRoot(document.getElementById("root")!).render(<I18nProvider><PickerPreview /></I18nProvider>);
}
