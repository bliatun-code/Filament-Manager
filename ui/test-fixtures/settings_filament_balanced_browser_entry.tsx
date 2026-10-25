/* eslint-disable react-refresh/only-export-components -- Isolated browser-test entry exports its mount function, not a Fast Refresh module. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsFilamentDefaultsTab } from "../src/components/settings_filament_defaults_tab";
import type { FilamentDefaultsSpoolRow } from "../src/lib/settings_filament_defaults_model";
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
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("FILAMENT_DEFAULTS");
  const {settingsTabButtons} = useSettingsPageTabs(activeTab,t);
  const [readOnly] = useState(() => new URLSearchParams(location.search).get("writable") !== "true");
  const [currency,setCurrency] = useState("NOK");
  const [policy,setPolicy] = useState({default_threshold_g:200,material_overrides:[]});
  Object.assign(window,{refreshLowStockPolicy:()=>setPolicy(current=>({...current}))});
  const rows:FilamentDefaultsSpoolRow[] = [];
  for (const [vendor, material, filamentName, count] of [["Bambu Lab","PLA","PLA Basic",16],["Bambu Lab","PLA","PLA Matte",7],["Bambu Lab","ABS","ABS",4],["eSUN","PLA","PLA+HS",3]] as const) {
    for(let i=0;i<count;i++) rows.push({spoolId:`qa-${vendor}-${filamentName}-${i}`,masterId:`qa-master-${filamentName}-${i}`,groupKey:`v1:${JSON.stringify([vendor.toUpperCase(),material,filamentName.toUpperCase(),1000])}`,vendor,material,filamentName,colorName:["Black","White","Green","Yellow"][i%4],nominalWeightG:1000,purchasePrice:i===0?null:295,purchaseCurrency:i===0?null:"NOK",purchasePriceSource:i===0?null:"MANUAL",batchPriceLocked:i>12,ownershipType:"OWNED",status:i>12?"EMPTY":"IN_STOCK"});
  }
  const general = <SettingsFilamentDefaultsTab busy={false} hostUnsupported={false} hostTargetMissing={false} loadFailed={false} readOnly={readOnly} locale={locale} t={t} defaultCurrency={currency} persistedGroupPrices={[{groupKey:'v1:["BAMBU LAB","PLA","PLA BASIC",1000]',price:295,currency:"NOK"}]} spoolRows={rows}
    lowStock={{busy:false,materialOptions:["PLA","ABS"],policy,policyValid:true,readOnly,onSave:setPolicy}}
    onSaveDefaultCurrency={setCurrency} onSaveGroupPrice={request=>{Object.assign(window,{lastGroupSave:request});}} onApplyBatch={request=>{throw new Error(`Batch writes are not part of this preview: ${request.groupKey}`);}} onOpenSpoolDetail={noop} onReload={noop}
  />;
  return <SettingsPageLayout activeTab={activeTab} onTabChange={setActiveTab} tabButtons={settingsTabButtons}
    title={t("nav.settings","Settings")} subtitle="" error={null} info={null} tauri={true} desktopOnlyMessage=""
    routes={{GENERAL:<div />,FILAMENT_DEFAULTS:general,LIBRARY:<div />,PRINTERS:<div />,CATALOG:<div />,MAINTENANCE:<div />}}
    roleModal={{modal:{busy:false,lastFullBackupExportedAt:null,lastFullBackupImportedAt:null,lastFullBackupValidatedAt:null,libraryRoleConfirmArmed:false,librarySyncBusy:false,librarySyncSettings:null,locale,tauri:true,t,onClose:noop,onConfirm:noop,onExportFullBackup:noop,onOpenBackupValidate:noop,onOpenDataImport:noop,roleChangeState:{target:null,fromClient:false,toHost:false,toClient:false,toStandalone:false,roleActuallyChanges:false,leavingClient:false,requiresExport:false,requiresValidate:false,requiresImport:false,validateDone:false,ready:false}}}}
  />;
}
export async function mountFilamentSettingsPreview(locale:Locale,theme:ThemeMode="dark") {
  await loadLocaleDictionary(locale);
  localStorage.setItem("bfm-locale",locale); localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
  createRoot(document.getElementById("root")!).render(<I18nProvider><Preview /></I18nProvider>);
}
