/* eslint-disable react-refresh/only-export-components -- Isolated browser-test entry exports its mount function, not a Fast Refresh module. */
import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { SettingsMaintenanceTab, type SettingsMaintenanceTabProps } from "../src/components/settings_maintenance_tab";
import type { ApplicationDiagnostics } from "../src/lib/tauri_client";
import type { SettingsBackupValidation } from "../src/pages/settings_backup_model";
import { SettingsPageLayout } from "../src/pages/settings_page_layout";
import { I18nProvider } from "../src/lib/i18n_provider";
import { loadLocaleDictionary, useI18n, type Locale } from "../src/lib/i18n";
import { initThemeMode, type ThemeMode } from "../src/lib/theme_mode";
import { useSettingsPageTabs } from "../src/pages/use_settings_page_tabs";
import type { SettingsTabKey } from "../src/pages/settings_page_model";
import "../src/index.css";

const noop = () => {};
function Preview() {
  const {locale, t} = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("MAINTENANCE");
  const {settingsTabButtons} = useSettingsPageTabs(activeTab,t);
  const params=new URLSearchParams(location.search);const readOnly=!params.has("host");const busy=params.has("busy");
  const [confirm,setConfirm]=useState<"APP"|"CATALOG"|null>(null);const [validation,setValidation]=useState<SettingsBackupValidation|null>(null);
  const importRef=useRef<HTMLInputElement>(null),validateRef=useRef<HTMLInputElement>(null);
  const record=(action:string)=>Object.assign(window,{lastMaintenanceAction:action});
  const diagnostics:ApplicationDiagnostics={generated_at_ms:1792870000000,app_version:"0.34.0",database:{available:!params.has("unavailable"),schema_version:7,supported_schema_version:7,quick_check:params.has("issues")?"issues_found":"ok",foreign_key_check:"ok",journal_mode:"delete",size_bytes:7864320,local_db_path:"qa-database.db"}};
  const reset=(action:"APP"|"CATALOG")=>{record(confirm===action?"confirm-"+action:"review-"+action);setConfirm(confirm===action?null:action);};
  const props:SettingsMaintenanceTabProps={applicationDiagnostics:diagnostics,applicationDiagnosticsError:params.has("error")?"QA diagnostic refresh failed":null,applicationDiagnosticsStatus:params.has("error")?"error":"success",backupImportInputRef:importRef,backupValidateInputRef:validateRef,backupValidationHasExtraTables:false,backupValidationHasMissingTables:false,backupValidationHasWarnings:false,busy,catalogCount:2537,confirmResetAction:confirm,lastBackupValidation:validation,lastCatalogReset:null,latestFullBackupExportedAt:"2026-07-31T21:28:00Z",locale,missingSwatchCount:0,printerCount:2,settingsClientHostWritePaired:!params.has("unpaired"),settingsClientReadOnly:readOnly,supportBundleError:null,supportBundleStatus:"idle",tauri:true,t,
    onExportFullBackup:()=>record("export-full"),onDownloadSanitizedSupportBundle:()=>record("support"),onExportInventoryCsv:()=>record("export-csv"),onExportInventoryJson:()=>record("export-json"),onImportDataFile:()=>record("import-file"),onCancelReset:()=>{record("cancel-reset");setConfirm(null);},onOpenBackupValidate:()=>{record("validate");setValidation({format:"FULL_BACKUP",expected_tables:8,present_tables:8,total_rows:42,missing_tables:[],extra_tables:[]});},onOpenDataImport:()=>record("open-import"),onResetAppData:()=>reset("APP"),onResetCatalogs:()=>reset("CATALOG"),onRefreshApplicationDiagnostics:()=>record("diagnostics"),onValidateBackupFile:()=>record("validate-file")};
  const general=<SettingsMaintenanceTab {...props}/>;
  return <SettingsPageLayout activeTab={activeTab} onTabChange={setActiveTab} tabButtons={settingsTabButtons}
    title={t("nav.settings","Settings")} subtitle="" error={null} info={null} tauri={true} desktopOnlyMessage=""
    routes={{GENERAL:<div />,FILAMENT_DEFAULTS:<div />,LIBRARY:<div />,PRINTERS:<div />,CATALOG:<div />,MAINTENANCE:general}}
    roleModal={{modal:{busy:false,lastFullBackupExportedAt:null,lastFullBackupImportedAt:null,lastFullBackupValidatedAt:null,libraryRoleConfirmArmed:false,librarySyncBusy:false,librarySyncSettings:null,locale,tauri:true,t,onClose:noop,onConfirm:noop,onExportFullBackup:noop,onOpenBackupValidate:noop,onOpenDataImport:noop,roleChangeState:{target:null,fromClient:false,toHost:false,toClient:false,toStandalone:false,roleActuallyChanges:false,leavingClient:false,requiresExport:false,requiresValidate:false,requiresImport:false,validateDone:false,ready:false}}}}
  />;
}
export async function mountMaintenanceSettingsPreview(locale:Locale,theme:ThemeMode="dark") {
  await loadLocaleDictionary(locale);
  localStorage.setItem("bfm-locale",locale); localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
  createRoot(document.getElementById("root")!).render(<I18nProvider><Preview /></I18nProvider>);
}
