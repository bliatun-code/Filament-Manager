/* eslint-disable react-refresh/only-export-components -- Isolated browser-test entry exports its mount function, not a Fast Refresh module. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsCatalogTab, type SettingsCatalogTabProps } from "../src/pages/settings_catalog_tab";
import type { SettingsCatalogVendor } from "../src/pages/settings_catalog_model";
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
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("CATALOG");
  const {settingsTabButtons} = useSettingsPageTabs(activeTab,t);
  const params=new URLSearchParams(location.search);const unavailable=params.has("unavailable");
  const [vendor,setVendor]=useState<SettingsCatalogVendor>("Bambu");const [material,setMaterial]=useState<string|null>(null);
  const [job,setJob]=useState({busy:false,phase:"IDLE",kind:"AUDIT" as "AUDIT"|"REFRESH"});
  const [log,setLog]=useState(false);const [missing,setMissing]=useState(params.has("missing"));const [filter,setFilter]=useState("ALL");const [draft,setDraft]=useState("#FFFFFF");const [confirm,setConfirm]=useState(false);
  const record=(action:string)=>Object.assign(window,{lastCatalogAction:action});
  Object.assign(window,{completeCatalogJob:()=>setJob(old=>({...old,busy:false,phase:"SUCCEEDED"})),failCatalogJob:()=>setJob(old=>({...old,busy:false,phase:"FAILED"}))});
  const row={id:"qa-swatch",vendor:"Bambu",material:"PLA",filament_name:"PLA Basic",color_name:"White",default_weight:1000,hex_color:null,is_discontinued:false};
  const materials=vendor==="Bambu"?["ABS","ASA","PA6","PAHT","PC","PET","PETG","PLA","PPA","PPS","PVA","Support for PLA","Support for PLA/PETG","TPU"]:["ABS","PETG","PLA","TPU"];
  const props:SettingsCatalogTabProps={helpText:t("settings.catalogTabClientHelp","This client shows the host catalog. Swatch fixes and vendor catalog refreshes are saved on the host."),
    refreshPanel:{activeCatalogMasterCount:vendor==="Bambu"?392:181,activeCatalogMaterialOptions:materials,activeCatalogRefreshMaterial:material,busy:false,catalogCount:2537,catalogRowsAvailable:!unavailable,catalogRowsUnavailable:unavailable,catalogRefreshBusy:job.busy,catalogRefreshElapsedSeconds:3,catalogRefreshLog:"QA catalog log",catalogRefreshPhase:job.phase,catalogRefreshKind:job.kind,catalogRefreshUnavailable:false,catalogRefreshMaterial:material,catalogRefreshSummary:null,catalogSourceAuditSummary:null,catalogRefreshVendor:vendor,catalogVendor:vendor,showCatalogRefreshLog:log,settingsClientReadOnly:true,swatchBusy:false,tauri:true,t,onAuditVendorCatalog:()=>{record("audit");setJob({busy:true,phase:"DISCOVER",kind:"AUDIT"});},onRefreshVendorCatalog:()=>{record("refresh");setJob({busy:true,phase:"FETCH",kind:"REFRESH"});},onSetCatalogVendor:v=>{setVendor(v);setMaterial(null);},onToggleCatalogRefreshLog:()=>setLog(v=>!v),onSelectCatalogRefreshMaterial:(_v,m)=>setMaterial(m)},
    missingSwatchesPanel:{busy:false,catalogRowsAvailable:!unavailable,catalogRowsUnavailable:unavailable,catalogRefreshBusy:job.busy,confirmBulkSwatch:confirm,missingSwatchCount:missing?1:0,swatchBusy:false,swatchDraftById:{"qa-swatch":draft},swatchVendorFilter:filter,swatchVendorOptions:["ALL","Bambu","eSUN"],tauri:true,t,visibleMissingSwatchMasters:missing&&filter!=="eSUN"?[row]:[],visibleMissingSwatchVendorCount:missing&&filter!=="eSUN"?1:0,onBulkAutoFill:()=>{record(confirm?"bulk-confirm":"bulk-review");if(confirm){setMissing(false);setConfirm(false);}else setConfirm(true);},onCancelBulkAutoFill:()=>setConfirm(false),onRefresh:()=>record("swatch-refresh"),onSaveMissingSwatch:()=>{record("swatch-save");setMissing(false);},onSwatchDraftChange:(_id,v)=>setDraft(v),onVendorFilterChange:setFilter},
  };
  const general=<SettingsCatalogTab {...props}/>;
  return <SettingsPageLayout activeTab={activeTab} onTabChange={setActiveTab} tabButtons={settingsTabButtons}
    title={t("nav.settings","Settings")} subtitle="" error={null} info={null} tauri={true} desktopOnlyMessage=""
    routes={{GENERAL:<div />,FILAMENT_DEFAULTS:<div />,LIBRARY:<div />,PRINTERS:<div />,CATALOG:general,MAINTENANCE:<div />}}
    roleModal={{modal:{busy:false,lastFullBackupExportedAt:null,lastFullBackupImportedAt:null,lastFullBackupValidatedAt:null,libraryRoleConfirmArmed:false,librarySyncBusy:false,librarySyncSettings:null,locale,tauri:true,t,onClose:noop,onConfirm:noop,onExportFullBackup:noop,onOpenBackupValidate:noop,onOpenDataImport:noop,roleChangeState:{target:null,fromClient:false,toHost:false,toClient:false,toStandalone:false,roleActuallyChanges:false,leavingClient:false,requiresExport:false,requiresValidate:false,requiresImport:false,validateDone:false,ready:false}}}}
  />;
}
export async function mountCatalogSettingsPreview(locale:Locale,theme:ThemeMode="dark") {
  await loadLocaleDictionary(locale);
  localStorage.setItem("bfm-locale",locale); localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
  createRoot(document.getElementById("root")!).render(<I18nProvider><Preview /></I18nProvider>);
}
