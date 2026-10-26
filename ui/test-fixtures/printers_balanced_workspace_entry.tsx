/* eslint-disable react-refresh/only-export-components -- Production components in an isolated browser fixture. */
import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { PrinterOverviewCard } from "../src/components/printer_overview_card";
import { IncomingWeightModal } from "../src/components/incoming_weight_modal";
import { usePrinterSlotInteractions } from "../src/pages/use_printer_slot_interactions";
import { I18nProvider } from "../src/lib/i18n_provider";
import { loadLocaleDictionary, useI18n, type Locale } from "../src/lib/i18n";
import { initThemeMode, type ThemeMode } from "../src/lib/theme_mode";
import { normalizeSpoolWithMasterRows } from "../src/lib/spool_row_normalization";
import type { BambuLiveIntegrationSettings, PrinterOverviewRow, PrinterAmsSlotRow, SpoolWithMasterRow } from "../src/lib/tauri_client";
import "../src/index.css";

const yes = () => true;
const spool = (id:string,vendor:string,material:string,name:string,color:string,hex:string,grams:number,rfid:string|null=null):SpoolWithMasterRow => ({
  spool:{id,master_id:id+"-master",status:"IN_STOCK",ownership_type:"OWNED",remaining_g:grams,initial_weight_g:1000,spool_tare_weight_g:200,rfid_tag:rfid},
  master:{id:id+"-master",vendor,material,filament_name:name,color_name:color,hex_color:hex,default_weight:1000},low_stock_threshold_g:200,
});
const initialSpools=normalizeSpoolWithMasterRows([
 spool("spool_a44954","Bambu","ABS","ABS","Black (40101)","#000000",1000),
 spool("spool_3fc0da","Bambu","ABS","ABS","Black (40101)","#000000",1000),
 spool("spool_029379","Bambu","PLA Tough+","PLA Tough+","White (12107)","#FFFFFF",560,"WHITE-RFID"),
 spool("spool_053186","Bambu","ABS","ABS","Tangerine Yellow (40402)","#F8CF21",520,"YELLOW-RFID"),
 spool("spool_3737_1","Bambu","PLA Matte","PLA Matte","Charcoal (11101)","#161616",480,"CHARCOAL-RFID"),
 spool("spool_176333","Prima Select","PETG","PETG","Transparent Blue","#407EDB",165),
 spool("spool_a-full","eSUN","PLA","PLA+","Black","#161616",1000),
 spool("spool_z-used","eSUN","PLA","PLA+","Black","#161616",824),
]);
function slot(printer:string,index:number,row?:SpoolWithMasterRow):PrinterAmsSlotRow {
 return {slot_id:`${printer}-slot-${index}`,ams_id:index===0?`${printer}_ext`:`${printer}_ams_1`,slot_index:index||1,
   spool_id:row?.spool.id,spool_material:row?.master.material,spool_filament_name:row?.master.filament_name,
   spool_color_name:row?.master.color_name,spool_hex_color:row?.master.hex_color,spool_rfid_tag:row?.spool.rfid_tag,spool_remaining_g:row?.spool.remaining_g};
}
const printer=(id:string,name:string,model:string,slots:PrinterAmsSlotRow[],jobs:number,success:number,used:number):PrinterOverviewRow => ({printer:{id,name,model,created_at:"",updated_at:""},slots,usage:{total_jobs:jobs,successful_jobs:success,failed_jobs:jobs-success,total_used_g:used}});
function Workspace({theme,mode,client}:{theme:ThemeMode;mode:string;client:boolean}) {
 const {t,locale}=useI18n();
 const [spools]=useState(initialSpools);
 const [printers,setPrinters]=useState(()=>[
   printer("brutus","Brutus","Bambu Lab P1S",[slot("brutus",1,mode==="replace"?spools[7]:undefined),slot("brutus",2,spools[2]),slot("brutus",3,spools[3]),slot("brutus",4,spools[4]),slot("brutus",0)],77,66,6042),
   printer("prusan","Prusan","Prusa MK4S",[slot("prusan",1,spools[5]),...Array.from({length:4},(_,i)=>slot("prusan",i+2)),slot("prusan",0)],1,1,4),
 ]);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[info,setInfo]=useState<string|null>(null);
 const [observedAt]=useState(()=>new Date().toISOString());
 const integrations:Record<string,BambuLiveIntegrationSettings>={brutus:{enabled:true,observed_state:{online:true,mqtt_connected:true,gcode_state:"IDLE",nozzle_temp_c:28,bed_temp_c:27,ams_humidity_index:3,ams_temperature_c:32,last_seen_at:observedAt,trays:printers[0].slots.map((s,i)=>({tray_index:i===4?255:i,loaded:i<4,filament_type:i===0?(mode==="manual"?"PLA":"ABS"):s.spool_material,filament_name:i===0?(mode==="manual"?"eSUN PLA+":"ABS"):s.spool_filament_name,color_hex:i===0?(mode==="manual"?"#161616":"#000000"):s.spool_hex_color,tray_uuid:i===0?(mode==="manual"?null:"UNKNOWN-BAMBU"):s.spool_rfid_tag,match_status:i===0?(mode==="manual"?"possible_match":"unknown_rfid"):"clear_match",matched_inventory_mode:i>0&&i<4?"exact_rfid":null,matched_inventory_spool_id:i>0&&i<4?s.spool_id:null,last_identity_seen_at:observedAt}))}}};
 Object.assign(window,{__TAURI__:{invoke:async(command:string,payload:{input:Record<string,unknown>})=>{
   const state=window as unknown as {printerWrites?:unknown[]};
   (state.printerWrites??=[]).push({command,payload});
   const input=(payload.input.operation ?? payload.input) as Record<string,unknown>;
   if(command.includes("operate_")&&input) {
     const target=spools.find(row=>row.spool.id===input.target_spool_id);
     setPrinters(rows=>rows.map(p=>({...p,slots:p.slots.map(s=>s.slot_id===input.slot_id?{...slot(p.printer.id,s.ams_id.endsWith("_ext")?0:s.slot_index,target),slot_id:s.slot_id}:s)})));
   }
   return null;
 }}});
 const reload=useCallback(async()=>{},[]);
 const workflow=usePrinterSlotInteractions({bambuLiveIntegrations:integrations,busy,canUseClientHostWrite:yes,clientHostBaseUrl:client?"http://qa-host.local":null,clientLibraryId:client?"qa-library":null,clientPrinterSource:"LIVE",clientReadOnly:client,clientTargetGeneration:1,ensureLocalWriteAllowed:yes,librarySyncReady:true,locale,printers,reloadData:reload,setBusy,setError,setInfo,spools,tauri:true,t});
 return <main className="page-shell printers-balanced-page" style={{maxWidth:"none"}}>
   <nav aria-label={t("app.navigation","Navigation")} style={{display:"flex",gap:"1.4rem",flexWrap:"wrap",paddingBottom:"1rem",borderBottom:"1px solid var(--printer-line)",marginBottom:"1.4rem",fontSize:".85rem"}}><strong>Filament Manager</strong>{["dashboard","inventory","printers","statistics","settings"].map(key=><span key={key} style={{fontWeight:key==="printers"?700:400}}>{t(`nav.${key}`,key)}</span>)}</nav>
   <div className="page-header"><h1 className="page-title">{t("nav.printers","Printers")}</h1><button className="app-primary-action rounded-md px-4 py-2 text-sm" type="button">+ {t("settings.addPrinter","Add printer")}</button></div>
   {error&&!workflow.incomingWeightPrompt?<div role="alert">{error}</div>:null}{info?<div role="status">{info}</div>:null}
   <div className="content-section space-y-4">{printers.map(p=><PrinterOverviewCard key={p.printer.id} printer={p} defaultSlotsExpanded busy={busy} tauri clientReadOnly={client} clientPrinterSource="LIVE" resolvedTheme={theme==="light"?"light":"dark"} bambuLiveIntegrations={integrations} catalogMasters={[]} openDropdownSlotId={workflow.openDropdownSlotId} setOpenDropdownSlotId={workflow.setOpenDropdownSlotId} spools={spools} allowedSpoolsForSlot={workflow.allowedSpoolsForSlot} findAllowedSpoolForSlot={workflow.findAllowedSpoolForSlot} getSlotDraft={workflow.getSlotDraft} setSlotDraft={workflow.setSlotDraft} findSpoolById={workflow.findSpoolById} openIncomingWeightDialog={workflow.openIncomingWeightDialog} openEmptySlotWeightDialog={workflow.openEmptySlotWeightDialog} openRfidOverrideDialog={workflow.openRfidOverrideDialog} registerLiveRfidCandidate={workflow.registerLiveRfidCandidate} createLiveBambuCatalogSpool={workflow.createLiveBambuCatalogSpool} openWeightPromptForDraft={workflow.openWeightPromptForDraft}/>)}</div>
   {workflow.incomingWeightPrompt?<IncomingWeightModal amsEstimateAvailable={workflow.liveAmsWeightAvailable} busy={busy} error={error} prompt={workflow.incomingWeightPrompt} incomingWeightValue={workflow.incomingWeightValue} outgoingWeightValue={workflow.outgoingWeightValue} onIncomingWeightChange={workflow.setIncomingWeightValue} onOutgoingWeightChange={workflow.setOutgoingWeightValue} onCancel={workflow.cancelIncomingWeightDialog} onAcceptAmsEstimate={()=>void workflow.acceptIncomingAmsWeightEstimate()} onSave={()=>void workflow.confirmIncomingWeightDialog()}/>:null}
 </main>;
}
export async function mountPrintersWorkspace(locale:Locale,theme:ThemeMode="dark",mode="normal",client=true) {
 await loadLocaleDictionary(locale);localStorage.setItem("bfm-locale",locale);localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
 Object.assign(window,{printerWrites:[]});
 createRoot(document.getElementById("root")!).render(<I18nProvider><Workspace theme={theme} mode={mode} client={client}/></I18nProvider>);
}
