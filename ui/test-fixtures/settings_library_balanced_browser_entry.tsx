/* eslint-disable react-refresh/only-export-components -- Isolated browser-test entry exports its mount function, not a Fast Refresh module. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsLibraryTab, type SettingsLibraryTabProps } from "../src/pages/settings_library_tab";
import { buildLibrarySyncVisibilityState, type LibrarySyncMode } from "../src/pages/settings_library_sync_model";
import { buildTrustedLanCompanionModel } from "../src/pages/settings_companion_model";
import type { LibrarySyncSettings, LibrarySyncHostValidationResult, TrustedLanCompanionStatus } from "../src/lib/tauri_client";
import { SettingsPageLayout } from "../src/pages/settings_page_layout";
import { I18nProvider } from "../src/lib/i18n_provider";
import { loadLocaleDictionary, useI18n, type Locale } from "../src/lib/i18n";
import { AppUpdateContext } from "../src/lib/app_update_context";
import { initThemeMode, type ThemeMode } from "../src/lib/theme_mode";
import { useSettingsPageTabs } from "../src/pages/use_settings_page_tabs";
import type { SettingsTabKey } from "../src/pages/settings_page_model";
import "../src/index.css";

const noop = () => {};
function Preview() {
  const {locale, t} = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("LIBRARY");
  const {settingsTabButtons} = useSettingsPageTabs(activeTab,t);
  const params=new URLSearchParams(location.search);
  const mode=(params.get("mode")||"CLIENT") as LibrarySyncMode;
  const [name,setName]=useState("QA Client");const [savedName,setSavedName]=useState(name);
  const [paired,setPaired]=useState(!params.has("unpaired"));const [draft,setDraft]=useState("");
  const [advanced,setAdvanced]=useState(false);const [network,setNetwork]=useState(false);const [networkEditor,setNetworkEditor]=useState(false);
  const [enabled,setEnabled]=useState(true);const offline=params.has("offline");
  const record=(action:string)=>Object.assign(window,{lastLibraryAction:action});
  const settings:LibrarySyncSettings={mode,target_generation:1,device_name:name,library_id:"qa-library",host_base_url:"http://qa-host.local:4278",host_device_name:"QA Host",client_auth_paired:paired};
  const validation:LibrarySyncHostValidationResult={base_url:settings.host_base_url!,reachable:!offline,ok:!offline,matches_library_id:!offline,pairing_checked:true,pairing_valid:paired,target_generation:1,app_version:"0.34.0",api_version:"v1",library_id:"qa-library",device_name:"QA Host",sync_mode:"HOST",message:offline?"":"OK"};
  const visibility=buildLibrarySyncVisibilityState({draftMode:mode,trustedLanEnabledDraft:enabled,trustedLanStatusEnabled:enabled,showTrustedLanNetworkEditor:networkEditor,hasTrustedLanPairingLink:false,pairedBrowserCount:0,lastCheckedAt:null,lastReachableAt:null,lastValidationMessage:null,hasSnapshot:false});
  const status:TrustedLanCompanionStatus={enabled,running:enabled,shell_reachable:enabled,local_name_running:enabled,advertised_hostname:"qa-host.local",direct_base_url:"http://qa-host.local:4278",base_url:"http://qa-host.local:4278",shell_url:"http://qa-host.local:4278/companion",listen_port:4278,api_version:"1",auth_mode:"pairing-session"};
  const props:SettingsLibraryTabProps={title:t("settings.tabLibrary","Library & web app"),showClientPanel:mode==="CLIENT",showHostPanels:mode!=="CLIENT"&&enabled,showServerPanel:mode!=="CLIENT"&&enabled,
    libraryRolePanel:{librarySyncBusy:false,librarySyncDeviceNameDirty:name!==savedName,librarySyncDeviceNameDraft:name,librarySyncDeviceNameSaveBusy:false,librarySyncModeDraft:mode,librarySyncRoleOptions:[{mode:"STANDALONE",label:t("settings.librarySyncStandalone","Standalone")},{mode:"HOST",label:t("settings.librarySyncHost","Host")},{mode:"CLIENT",label:t("settings.librarySyncClient","Client")}],librarySyncSettings:settings,libraryVisibility:visibility,tauri:true,t,onDeviceNameChange:setName,onRequestLibraryRoleChange:m=>record("role:"+m),onSaveDeviceName:()=>setSavedName(name)},
    webappControl:{librarySyncModeDraft:mode,tauri:true,trustedLanActionBusy:false,trustedLanEnabledDraft:enabled,trustedLanHasPrivateInterfaces:true,trustedLanStatus:status,t,onToggleTrustedLanEnabled:setEnabled},
    clientPanel:{appVersion:"0.34.0",librarySyncBusy:false,librarySyncDeviceNameDirty:name!==savedName,librarySyncDeviceNameDraft:name,librarySyncDeviceNameSaveBusy:false,librarySyncHostBaseUrlDraft:settings.host_base_url!,librarySyncPairingDraft:draft,librarySyncSettings:settings,librarySyncSnapshot:null,librarySyncSnapshotBusy:false,librarySyncValidation:paired?validation:null,librarySyncValidationBusy:false,libraryVisibility:visibility,locale,settingsClientHostBaseUrl:settings.host_base_url!,settingsClientHostNeedsRepair:false,settingsClientHostPairingValid:paired,settingsClientHostWritePaired:paired,showLibraryClientAdvanced:advanced,tauri:true,t,onClearClientAuth:()=>{record("unpair");setPaired(false);},onDeviceNameChange:setName,onFetchSnapshot:()=>record("refresh"),onPairHost:()=>{record("pair");setPaired(true);},onPairingDraftChange:setDraft,onRenewClientAuth:()=>record("renew"),onSaveDeviceName:()=>{record("save-name");setSavedName(name);},onToggleAdvanced:()=>setAdvanced(v=>!v)},
    serverPanel:{actionBusy:false,companionModel:buildTrustedLanCompanionModel({trustedLanStatus:status,statusLoading:false,actionBusy:false,t}),interfaceAddressDraft:"127.0.0.1",interfaces:[],networkDirty:false,portDraft:"4278",showNetworkEditor:networkEditor,showNetworkSummary:network,tauri:true,t,onInterfaceAddressChange:noop,onPortChange:noop,onSaveNetwork:()=>record("network"),onToggleNetworkEditor:()=>setNetworkEditor(v=>!v),onToggleNetworkSummary:()=>setNetwork(v=>!v)},
    pairingPanel:{actionBusy:false,browserLabelDraft:"QA Browser",locale,pairActionDisabled:false,pairingExpiresAtMs:null,pairingLabel:null,pairingLink:null,pairingQrBusy:false,pairingQrDataUrl:null,pairingQrUnavailable:false,t,onBrowserLabelChange:noop,onCopyPairingLink:()=>record("copy-pairing"),onCreatePairingLink:()=>record("create-pairing")},
    browsersPanel:{activeBrowsers:[],actionBusy:false,revokedBrowsers:[],showRevokedBrowsers:false,t,totalBrowserCount:0,onRevokeAllBrowsers:()=>record("revoke-all"),onRevokeBrowser:()=>record("revoke"),onToggleRevokedBrowsers:noop},
  };
  const general=<AppUpdateContext.Provider value={{automaticChecksEnabled:true,setAutomaticChecksEnabled:noop,state:{status:"IDLE"},checkManually:async()=>{record("updates");return null;},dismissAvailableUpdate:noop,showUpdateNotification:false}}><SettingsLibraryTab {...props}/></AppUpdateContext.Provider>;
  return <SettingsPageLayout activeTab={activeTab} onTabChange={setActiveTab} tabButtons={settingsTabButtons}
    title={t("nav.settings","Settings")} subtitle="" error={null} info={null} tauri={true} desktopOnlyMessage=""
    routes={{GENERAL:<div />,FILAMENT_DEFAULTS:<div />,LIBRARY:general,PRINTERS:<div />,CATALOG:<div />,MAINTENANCE:<div />}}
    roleModal={{modal:{busy:false,lastFullBackupExportedAt:null,lastFullBackupImportedAt:null,lastFullBackupValidatedAt:null,libraryRoleConfirmArmed:false,librarySyncBusy:false,librarySyncSettings:null,locale,tauri:true,t,onClose:noop,onConfirm:noop,onExportFullBackup:noop,onOpenBackupValidate:noop,onOpenDataImport:noop,roleChangeState:{target:null,fromClient:false,toHost:false,toClient:false,toStandalone:false,roleActuallyChanges:false,leavingClient:false,requiresExport:false,requiresValidate:false,requiresImport:false,validateDone:false,ready:false}}}}
  />;
}
export async function mountLibrarySettingsPreview(locale:Locale,theme:ThemeMode="dark") {
  await loadLocaleDictionary(locale);
  localStorage.setItem("bfm-locale",locale); localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
  createRoot(document.getElementById("root")!).render(<I18nProvider><Preview /></I18nProvider>);
}
