/* eslint-disable react-refresh/only-export-components -- Isolated browser-test entry exports its mount function, not a Fast Refresh module. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsPrinterCard } from "../src/components/settings_printer_card";
import { resolvePrinterModelProfile } from "../src/lib/printer_profiles";
import { buildSettingsBambuLiveDiagnosticsModel } from "../src/pages/settings_bambu_live_diagnostics_model";
import type { BambuLiveIntegrationSettings } from "../src/lib/tauri_client";
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
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("PRINTERS");
  const {settingsTabButtons} = useSettingsPageTabs(activeTab,t);
  const [expanded,setExpanded]=useState<string|null>(null);const [editId,setEditId]=useState<string|null>(null);const [confirmId,setConfirmId]=useState<string|null>(null);
  const [capture,setCapture]=useState(false);const [name,setName]=useState("QA Brutus");
  const record=(action:string)=>Object.assign(window,{lastPrinterAction:action});
  const live:BambuLiveIntegrationSettings={enabled:true,host:"qa-printer.local",printer_serial:"QA-SERIAL",observed_state:{mqtt_connected:true,online:true,job_state_code:4,last_seen_at:"2026-10-25T08:00:00Z",raw_payload_json:{nozzle_temper:28,bed_temper:27,gcode_state:"IDLE"},trays:[]}};
  const model=buildSettingsBambuLiveDiagnosticsModel({diagnosticFilter:"all",diagnosticSession:null,diagnosticSort:"path",formatDateTime:v=>v,liveConfig:live,spoolRows:[],t,locale});
  const editDraft={bambuLiveAccessCode:"",bambuLiveAccessCodeAction:"KEEP" as const,bambuLiveAccessCodeConfigured:true,bambuLiveEnabled:true,bambuLiveHost:"qa-printer.local",bambuLivePrinterSerial:"QA-SERIAL",bambuLiveTlsCertificateFingerprint:null,bambuLiveTlsSpkiFingerprint:null,bambuLiveTlsTrustAction:"KEEP" as const,bambuLiveTlsTrustState:"TRUSTED" as const,bambuDiscoveryCandidates:[],bambuDiscoveryHasScanned:false,bambuDiscoveryInterfaceAddress:"",bambuDiscoveryScanning:false,model:"Bambu Lab P1S",modelProfile:resolvePrinterModelProfile("Bambu Lab P1S"),name,slotsPerUnit:"4",units:"1",trustedLanInterfaces:[]};
  const general=<div className="settings-printers-balanced"><div className="space-y-4">{[{id:"qa-bambu",name:"QA Brutus",model:"Bambu Lab P1S",created_at:"",updated_at:""},{id:"qa-prusa",name:"QA Prusan",model:"Prusa MK4S",created_at:"",updated_at:""}].map((printer,index)=><SettingsPrinterCard key={printer.id}
    actionsLocked={editId!==null} confirmDelete={confirmId===printer.id} editDirty={name!=="QA Brutus"} expanded={expanded===printer.id} isEditing={editId===printer.id} editDraft={editDraft} printer={printer} printerSlots={Array.from({length:index===0?4:5},(_,i)=>({slot_id:`qa-slot-${index}-${i}`,ams_id:"1",slot_index:i+1}))} settingsClientReadOnly={true} busy={false} tauri={true}
    onRemove={()=>{record(confirmId===printer.id?"remove-confirmed":"remove-request");setConfirmId(printer.id);}}
    editActions={{onBambuLiveAccessCodeChange:noop,onBambuLiveAccessCodeActionChange:noop,onBambuLiveEnabledChange:noop,onBambuLiveHostChange:noop,onBambuLiveIdentityCheck:noop,onBambuLivePrinterSerialChange:noop,onBambuLiveTlsTrustActionChange:noop,onBambuDiscoveryInterfaceAddressChange:noop,onFindBambuPrinters:noop,onRecoverBambuLiveAddress:noop,onUseDiscoveredBambuPrinter:noop,onCancel:()=>setEditId(null),onModelChange:noop,onNameChange:setName,onSave:()=>record("save"),onSlotsPerUnitChange:noop,onStart:()=>{record("edit");setEditId(printer.id);},onUnitsChange:noop}}
    liveDiagnostics={{captureActive:capture,diagnosticFilter:"all",diagnosticSession:null,diagnosticSort:"path",liveConfig:index===0?live:null,model}}
    liveDiagnosticsActions={{onCopyError:noop,onCopySuccess:noop,onDiagnosticFilterChange:noop,onDiagnosticSortChange:noop,onSelectedChartFieldChange:noop,onToggleCapture:()=>setCapture(v=>!v),onToggleDetails:()=>setExpanded(v=>v===printer.id?null:printer.id)}}
  />)}</div></div>;
  return <SettingsPageLayout activeTab={activeTab} onTabChange={setActiveTab} tabButtons={settingsTabButtons}
    title={t("nav.settings","Settings")} subtitle="" error={null} info={null} tauri={true} desktopOnlyMessage=""
    routes={{GENERAL:<div />,FILAMENT_DEFAULTS:<div />,LIBRARY:<div />,PRINTERS:general,CATALOG:<div />,MAINTENANCE:<div />}}
    roleModal={{modal:{busy:false,lastFullBackupExportedAt:null,lastFullBackupImportedAt:null,lastFullBackupValidatedAt:null,libraryRoleConfirmArmed:false,librarySyncBusy:false,librarySyncSettings:null,locale,tauri:true,t,onClose:noop,onConfirm:noop,onExportFullBackup:noop,onOpenBackupValidate:noop,onOpenDataImport:noop,roleChangeState:{target:null,fromClient:false,toHost:false,toClient:false,toStandalone:false,roleActuallyChanges:false,leavingClient:false,requiresExport:false,requiresValidate:false,requiresImport:false,validateDone:false,ready:false}}}}
  />;
}
export async function mountPrintersSettingsPreview(locale:Locale,theme:ThemeMode="dark") {
  await loadLocaleDictionary(locale);
  localStorage.setItem("bfm-locale",locale); localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
  createRoot(document.getElementById("root")!).render(<I18nProvider><Preview /></I18nProvider>);
}
