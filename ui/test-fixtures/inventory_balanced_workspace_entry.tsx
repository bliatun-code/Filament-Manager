/* eslint-disable react-refresh/only-export-components -- Isolated preview of production inventory components. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../src/lib/i18n_provider";
import { loadLocaleDictionary, type Locale, useI18n } from "../src/lib/i18n";
import { initThemeMode, type ThemeMode } from "../src/lib/theme_mode";
import { InventoryWorkspaceNavigation, type InventoryWorkspaceView } from "../src/components/inventory_workspace_navigation";
import { InventoryControlsPanel, InventoryStockFilters } from "../src/components/inventory_controls_panel";
import { InventorySpoolCollection } from "../src/components/inventory_spool_collection";
import { useInventoryFilters } from "../src/lib/use_inventory_filters";
import { FilamentSpoolVisual } from "../src/components/filament_spool_visual";
import { LoanHistoryTable } from "../src/components/loan_history_table";
import { LoanReturnModal } from "../src/components/loan_return_modal";
import type { InventorySpool } from "../src/lib/inventory_list_model";
import type { NormalizedLoanDetailsRow } from "../src/lib/loan_data_source";
import "../src/index.css";

const samples = [
 ["a44954","Bambu","ABS","ABS","ABS Black (40101)","#000000",1000,"Ikke tildelt"],
 ["3fc0da","Bambu","ABS","ABS","ABS Black (40101)","#000000",1000,"Ikke tildelt"],
 ["053186","Bambu","ABS","ABS","ABS Tangerine Yellow (40402)","#FFC72C",520,"Brutus · AMS 1 · Spor 3"],
 ["248216","Print With Smile","ABS","ABS","Matte Black","#222222",630,"Ikke tildelt"],
 ["051301","filamentum","CPE","CPE HG100","Vertigo Grey","#454545",260,"Hylle 4"],
 ["683884","eSUN","PETG","PETG","Black","#161616",826,"Ikke tildelt"],
 ["176333","Prima Select","PETG","PETG","Transparent Blue","#407EDB",165,"Prusan · MMU3 · Kanal 1"],
 ["953984","Bambu","PETG","PETG Basic","Black (65103)","#101010",240,"Ikke tildelt"],
 ["249521","Bambu","PETG","PETG Basic","Black (65103)","#101010",70,"Ikke tildelt"],
 ["321751","Bambu","PETG","PETG Basic","Gray (30107)","#8B8D8E",670,"Ikke tildelt"],
 ["312270","Bambu","PETG","PETG Basic","Red (30201)","#DA281F",630,"Hylle 4"],
 ["219651","Bambu","PLA","PLA Basic","Cyan (10603)","#00B1CC",1000,"Loaned to: Håkon"],
] as const;
const spools:InventorySpool[] = samples.map(([id,vendor,material,filamentName,colorName,hexColor,remainingGrams,location])=>({id:`spool_${id}`,masterId:filamentName,vendor,material,filamentName,colorName,hexColor,remainingGrams,location,initialWeightGrams:1000,ownershipType:"OWNED",status:id==="219651"?"BORROWED":id==="053186"||id==="176333"?"ASSIGNED":"IN_STOCK"}));
const loans:NormalizedLoanDetailsRow[] = [
 ["812496","PLA Matte","Matte Ash Gray (11102)","Erik","#999999","2026-05-20T12:47:00Z"],
 ["633469","PLA Matte","Matte Ivory White (11100)","Erik","#FFFFED","2026-04-06T18:08:00Z"],
 ["219651","PLA Basic","Cyan (10603)","Håkon","#00B1CC","2026-04-06T18:05:00Z"],
 ["255318","PLA Basic","Magenta (10202)","Håkon","#EC008C","2026-04-06T18:00:00Z"],
 ["440436","PLA-Silk","Purple","Håkon","#7938A3","2026-04-06T17:59:00Z"],
].map(([id,filament_name,color_name,person,hex_color,lent_at])=>({loan:{id:`loan_${id}`,spool_id:`spool_${id}`,borrower_name:person,grams_out:1000,lent_at,loan_status:"ACTIVE",loan_direction:"OUTBOUND"},spool_status:"BORROWED",spool_tare_weight_g:250,material:"PLA",filament_name,color_name,vendor:id==="440436"?"eSUN":"Bambu",hex_color}));

function Preview({theme}:{theme:ThemeMode}) {
 const {t}=useI18n(); const f=useInventoryFilters(spools,{deterministicPagePreferences:true});
 const [view,setView]=useState<InventoryWorkspaceView>("STOCK");const [bulk,setBulk]=useState(false);const [selected,setSelected]=useState(new Set<string>());const [roll,setRoll]=useState("");
 const [returnLoan,setReturnLoan]=useState<NormalizedLoanDetailsRow|null>(null);const [grams,setGrams]=useState("1250");const [note,setNote]=useState("");
 const header={lowStockOnly:f.lowStockOnly,onAddSpool:()=>{},onCreateLabelSheet:()=>{},onLowStockOnlyChange:f.setLowStockOnly,onSearchChange:f.setSearch,onStatusFilterChange:f.setStatusFilter,primaryActionsDisabled:false,labelSheetDisabled:false,search:f.search,showStockFilters:true,statusFilter:f.statusFilter};
 const gallery=new URLSearchParams(location.search).has("gallery");
 return <><nav className="app-nav" aria-label={t("app.navigation","Navigation")}><div className="app-nav-inner"><div className="app-nav-brand"><strong>Filament Manager</strong></div><div className="app-nav-list">{["dashboard","inventory","printers","statistics","settings"].map(key=><button key={key} className={`app-nav-button ${key==="inventory"?"app-nav-button-active":"app-nav-button-idle"}`}>{t(`nav.${key}`,key)}</button>)}</div></div></nav>
 <main className="page-shell inventory-balanced-page">
 {gallery?<div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:24,padding:24}}>{["#000000","#FFFFFF","#FFC72C","#407EDB","#DA281F","#00B1CC","#454545","#7938A3","multi(#E6005C,#2266FF)","gradient(#21B66D,#5CE6E6)"].map(color=><div key={color} style={{textAlign:"center"}}><FilamentSpoolVisual color={color} className="w-full"/><code>{color}</code></div>)}</div>:<>
 <div className="page-header"><h1 className="page-title">{t("nav.inventory","Inventory")}</h1><div className="page-header-actions flex flex-wrap gap-2"><button className="app-primary-action rounded-lg px-4 py-2">{t("inventory.addSpoolAction","Add spool")}</button><button className="app-soft-control rounded-lg px-4 py-2">{t("inventory.labelsAction","Labels")}</button></div></div>
 <InventoryWorkspaceNavigation activeView={view} inventoryCount={59} locationCount={6} purchaseCount={18} loanCount={5} onViewChange={setView}/>
 <div id="inventory-stock-panel" role="region" aria-labelledby="inventory-stock-tab" hidden={view!=="STOCK"}/>
 <div id="inventory-loans-panel" role="region" aria-labelledby="inventory-loans-tab" hidden={view!=="LOANS"}/>
 <div id="inventory-locations-panel" hidden={view!=="LOCATIONS"}/>
 <div id="inventory-purchases-panel" hidden={view!=="PURCHASES"}/>
 {view==="STOCK"?<><InventoryControlsPanel {...f} advancedFiltersOpen={f.advancedFiltersOpen} onAdvancedFiltersOpenChange={f.setAdvancedFiltersOpen} onInventoryViewChange={f.setInventoryView} onLocationFilterClear={f.clearLocationFilter} onMaterialFilterChange={f.setMaterialFilter} onOwnershipFilterChange={f.setOwnershipFilter} onResetFilters={f.resetFilters} onVendorFilterChange={f.setVendorFilter} bulkSelectionActive={bulk} bulkSelectionDisabled={false} onBulkSelectionActiveChange={setBulk} filters={<InventoryStockFilters {...header}/>}/>
 <InventorySpoolCollection addSpoolDisabled={false} bulkSelectionActive={bulk} bulkSelectionDisabled={false} filteredSpools={f.filteredSpools} groupedSpools={f.groupedSpools} inventoryView={f.inventoryView} loading={false} onAddSpool={()=>{}} onBulkSelectionChange={(id,checked)=>setSelected(old=>{const next=new Set(old);if(checked)next.add(id);else next.delete(id);return next;})} onResetFilters={f.resetFilters} onSelectRoll={setRoll} recentlyAddedSpoolId={null} resolvedTheme={theme==="light"?"light":"dark"} selectedSpoolId={roll} selectedBulkSpoolIds={selected} totalSpoolCount={59}/></>:view==="LOANS"?<section style={{marginTop:24}}><div className="inventory-loan-summary"><span>{t("loans.history","Loan history")}</span><span>5</span></div><LoanHistoryTable loans={loans} busy={false} onReturn={setReturnLoan}/></section>:<p>{view}</p>}
 </>}
 <LoanReturnModal busy={false} error={null} loan={returnLoan} grams={grams} note={note} onClose={()=>setReturnLoan(null)} onConfirm={()=>Object.assign(window,{returnConfirmed:true})} onGramsChange={setGrams} onNoteChange={setNote}/>
 <output className="sr-only" data-selection={selected.size} data-selected-roll={roll}/>
 </main></>;
}
export async function mountInventoryWorkspacePreview(locale:Locale="nb",theme:ThemeMode="dark") {
 await loadLocaleDictionary(locale);localStorage.setItem("bfm-locale",locale);localStorage.setItem("bfm-theme-mode",theme);initThemeMode();
 createRoot(document.getElementById("root")!).render(<I18nProvider><Preview theme={theme}/></I18nProvider>);
}
