/* eslint-disable react-refresh/only-export-components -- Isolated production-component browser preview. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { InventorySpoolDetailModal } from "../src/components/inventory_spool_detail_modal";
import { I18nProvider } from "../src/lib/i18n_provider";
import { loadLocaleDictionary, useI18n, type Locale } from "../src/lib/i18n";
import { initThemeMode, type ThemeMode } from "../src/lib/theme_mode";
import { buildInventoryDetailVisualFixture } from "../src/lib/inventory_visual_fixture";
import type { InventorySpool, OwnershipType } from "../src/lib/inventory_list_model";
import type { PurchaseReceiptMetadataDraft } from "../src/lib/purchase_receipt_metadata";
import { buildBrandedFilamentQrDataUrl } from "../src/lib/filament_qr_branding";
import "../src/index.css";

const noop = () => {};
const target = "http://qa-host.local:4278/companion?spool_qr=v1%3Aspool_1775592053186";
const fixture = buildInventoryDetailVisualFixture(new Date("2026-10-25T16:00:00Z"));
function Preview({ qr }: { qr: string }) {
  const { t } = useI18n();
  const params = new URLSearchParams(window.location.search);
  const offline = params.has("offline");
  const loanedOut = params.has("loaned");
  const [busy, setBusy] = useState(false);
  const [spool,setSpool] = useState<InventorySpool>({...fixture.spools[0],id:"spool_1775592053186",remainingGrams:520,homeLocation:"Hylle 5",purchasePrice:339,purchaseCurrency:"NOK",purchaseDate:"2026-10-25",status:loanedOut?"LOANED_OUT":"ASSIGNED"});
  const [tare,setTare] = useState("250");
  const [homeLocationDraft,setHomeLocationDraft] = useState("Hylle 5");
  const [ownership,setOwnership] = useState<OwnershipType>("OWNED");
  const [owner,setOwner] = useState("");
  const [contact,setContact] = useState("");
  const [note,setNote] = useState("");
  const [purchase,setPurchase] = useState<PurchaseReceiptMetadataDraft>({pricePerRoll:"339",currency:"NOK",purchaseDate:"2026-10-25",batchCode:"",supplierReference:""});
  const [protectedPrice,setProtectedPrice] = useState(false);
  const [unlocked,setUnlocked] = useState(false);
  const [vendor,setVendor] = useState("Bambu");
  const [material,setMaterial] = useState("ABS");
  const [filament,setFilament] = useState("Tangerine Yellow");
  const [color,setColor] = useState("Tangerine Yellow");
  const [hex,setHex] = useState("#F2C94C");
  const [history,setHistory] = useState(false);
  const [confirmDelete,setConfirmDelete] = useState(false);
  const [confirmPurge,setConfirmPurge] = useState(false);
  const [discard,setDiscard] = useState(false);
  const [saved,setSaved] = useState(JSON.stringify([tare,homeLocationDraft,ownership,owner,contact,note,purchase,protectedPrice]));
  const dirty = saved !== JSON.stringify([tare,homeLocationDraft,ownership,owner,contact,note,purchase,protectedPrice]);
  const record = (action:string) => Object.assign(window,{lastFilamentAction:action});
  Object.assign(window,{setFilamentBusy:setBusy});
  const events = Array.from({length:80},(_,index)=>({id:`qa-history-${index}`,spool_id:spool.id,event_type:"WEIGHT_UPDATED",created_at:new Date(Date.parse("2026-10-21T20:03:29Z")-index*300_000).toISOString(),payload_json:{remaining_g:520+index*5,previous_remaining_g:530+index*5}}));
  return <InventorySpoolDetailModal open spool={spool} assignedSlot={{printerName:"Brutus",liveIsActive:true,liveMatchedInventorySpoolId:spool.id,livePrinterLastSeenAt:"2026-10-25T16:00:00Z"}}
    displayTitle="ABS Tangerine Yellow (40402)" ownershipLabel={t("inventory.ownedByUs","Owned")} ownershipTone="neutral" statusLabel={t("inventory.statusAssigned","Assigned")} statusTone="neutral"
    colorName={color} filamentName={filament} hexColor={hex} vendor={vendor} material={material} measuredTotal={(spool.remainingGrams??0)+(spool.spoolTareWeightGrams??250)}
    tareDraft={tare} locationDraft={homeLocationDraft} locationValue="Brutus" homeLocationLocked={loanedOut} manageBusy={busy} runtimeAvailable={!offline} detailUnavailable={offline}
    clientDataWarning={offline?t("errors.hostUnavailable","Host is unavailable."):null} error={null} infoMessage={null}
    hasCommonChanges={dirty} hasUnsavedChanges={dirty} masterEditUnlocked={unlocked} discardConfirmationOpen={discard}
    ownerNameDraft={owner} ownerContactDraft={contact} ownershipNoteDraft={note} ownershipTypeDraft={ownership}
    purchaseMetadataDraft={purchase} purchaseMetadataErrors={{}} purchasePriceBatchLockedDraft={protectedPrice}
    confirmDelete={confirmDelete} confirmPurge={confirmPurge} deterministicLabelPreferences
    qrCompanionAvailable={!offline} qrDataUrl={qr} qrLoading={false} qrTarget={target} supportsRfidCapture={!offline}
    rfidBindingMeta={{label:t("inventory.rfidRegistered","RFID registered"),hint:"",className:""}} resolvedTheme="dark"
    usageLoading={false} usagePoints={[{captured_at:"2026-09-15T18:00:00Z",grams:1000,source:"MEASURED"},{captured_at:"2026-10-21T20:03:29Z",grams:520,source:"MEASURED"}]}
    historyLoading={false} visibleHistoryRows={events} hasHiddenHistoryRows={false} showRollHistory={history}
    formatHistoryEventType={()=>t("inventory.historyEvent.weightUpdated","Weight updated")} formatHistoryEventDetails={event=>`${(event.payload_json as {remaining_g:number}).remaining_g} g`}
    canLoadInPrinter={false} canLoanOut={!loanedOut}
    onChangeColorName={setColor} onChangeFilamentName={setFilament} onChangeHexColor={setHex} onChangeLocation={setHomeLocationDraft} onChangeMaterial={setMaterial}
    onChangeOwnerContact={setContact} onChangeOwnerName={setOwner} onChangeOwnershipNote={setNote} onChangeOwnershipType={setOwnership} onChangePurchasePriceBatchLocked={setProtectedPrice} onChangePurchaseMetadata={setPurchase} onChangeTare={setTare} onChangeVendor={setVendor}
    onCancelDangerZoneConfirmation={()=>{setConfirmDelete(false);setConfirmPurge(false);}} onCancelDiscardConfirmation={()=>setDiscard(false)} onClose={()=>{if(dirty)setDiscard(true);else record("close");}} onConfirmDiscard={()=>{setDiscard(false);record("discard");}}
    onDelete={()=>{setConfirmDelete(true);record("delete-review");}} onMarkEmpty={()=>record("empty-confirmed")} onPurge={()=>{setConfirmPurge(true);record("purge-review");}} onRefill={()=>record("refill")}
    onLoadInPrinter={()=>record("load")} onOpenPrinters={()=>record("printers")} onLoanOut={()=>record("loan")}
    onPrintLabel={async()=>{record("export-label");}} onStartRfidCapture={()=>record("rfid")}
    onSaveCommonDetails={()=>{setSpool(current=>({...current,spoolTareWeightGrams:Number(tare)}));setSaved(JSON.stringify([tare,homeLocationDraft,ownership,owner,contact,note,purchase,protectedPrice]));record("save-properties");}}
    onSaveMasterMetadata={()=>record("save-catalog")} onSubmitWeight={grams=>{setSpool(current=>({...current,remainingGrams:Math.max(0,grams-(current.spoolTareWeightGrams??250))}));record("save-weight");}}
    onToggleEditUnlocked={()=>setUnlocked(v=>!v)} onToggleLostStatus={()=>record("lost")} onToggleRollHistory={()=>setHistory(v=>!v)} onRefreshData={noop}
  />;
}
export async function mountBalancedSpoolPreview(locale:Locale,theme:ThemeMode="dark") {
  await loadLocaleDictionary(locale);
  localStorage.setItem("bfm-locale",locale);localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
  const qr = await buildBrandedFilamentQrDataUrl(target,"color");
  createRoot(document.getElementById("root")!).render(<I18nProvider><Preview qr={qr}/></I18nProvider>);
}
