/* eslint-disable react-refresh/only-export-components -- Isolated browser-test entry exports its mount function, not a Fast Refresh module. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsGeneralTab } from "../src/components/settings_general_tab";
import { SettingsPageLayout } from "../src/pages/settings_page_layout";
import { I18nProvider } from "../src/lib/i18n_provider";
import { loadLocaleDictionary, useI18n, type Locale } from "../src/lib/i18n";
import { AppUpdateContext } from "../src/lib/app_update_context";
import { initThemeMode, setThemeMode, type ThemeMode } from "../src/lib/theme_mode";
import { useSettingsPageTabs } from "../src/pages/use_settings_page_tabs";
import type { SettingsTabKey } from "../src/pages/settings_page_model";
import "../src/index.css";

const noop = () => {};
function Preview() {
  const {locale, setLocale, t} = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("GENERAL");
  const {settingsTabButtons} = useSettingsPageTabs(activeTab,t);
  const [theme, updateTheme] = useState<ThemeMode>(document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [automatic, setAutomatic] = useState(true);
  const [lifecycle, setLifecycle] = useState({continue_in_background:true,launch_at_login:true,launch_at_login_available:true,tray_available:true});
  const general = <AppUpdateContext.Provider value={{automaticChecksEnabled:automatic,setAutomaticChecksEnabled:setAutomatic,state:{status:"IDLE"},checkManually:async()=>null,dismissAvailableUpdate:noop,showUpdateNotification:false}}><SettingsGeneralTab
    appVersion="0.34.0" busy={false} tauri={true} locale={locale} t={t} themeMode={theme}
    onThemeSelection={mode=>{setThemeMode(mode);updateTheme(mode);}} onLocaleSelection={setLocale}
    desktopLifecycleSettings={lifecycle} desktopLifecycleLoading={false} desktopLifecycleUpdating={false}
    desktopLifecycleLoadError={null} desktopLifecycleUpdateError={null} onRetryDesktopLifecycleLoad={noop}
    onContinueInBackground={value=>setLifecycle(old=>({...old,continue_in_background:value}))}
    onLaunchAtLogin={value=>setLifecycle(old=>({...old,launch_at_login:value}))}
  /></AppUpdateContext.Provider>;
  return <SettingsPageLayout activeTab={activeTab} onTabChange={setActiveTab} tabButtons={settingsTabButtons}
    title={t("nav.settings","Settings")} subtitle="" error={null} info={null} tauri={true} desktopOnlyMessage=""
    routes={{GENERAL:general,FILAMENT_DEFAULTS:<div />,LIBRARY:<div />,PRINTERS:<div />,CATALOG:<div />,MAINTENANCE:<div />}}
    roleModal={{modal:{busy:false,lastFullBackupExportedAt:null,lastFullBackupImportedAt:null,lastFullBackupValidatedAt:null,libraryRoleConfirmArmed:false,librarySyncBusy:false,librarySyncSettings:null,locale,tauri:true,t,onClose:noop,onConfirm:noop,onExportFullBackup:noop,onOpenBackupValidate:noop,onOpenDataImport:noop,roleChangeState:{target:null,fromClient:false,toHost:false,toClient:false,toStandalone:false,roleActuallyChanges:false,leavingClient:false,requiresExport:false,requiresValidate:false,requiresImport:false,validateDone:false,ready:false}}}}
  />;
}
export async function mountSettingsPreview(locale:Locale,theme:ThemeMode="dark") {
  await loadLocaleDictionary(locale);
  localStorage.setItem("bfm-locale",locale); localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
  createRoot(document.getElementById("root")!).render(<I18nProvider><Preview /></I18nProvider>);
}
