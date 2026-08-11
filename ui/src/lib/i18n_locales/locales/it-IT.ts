import type { DictionaryNode } from "../../i18n_types";

export const itITDictionary: DictionaryNode = {
  app: {
    iconAlt: "Icona Filament Manager",
    loadingPage: "Caricamento pagina...",
    navigation: "Navigazione",
    skipToMainContent: "Passa al contenuto principale",
    title: "Filament Manager",
  },
  chart: {
    at: "A",
    consumed: "Consumato sul grafico",
    latest: "Ultimo",
    noSamples: "Nessun campione di peso ancora.",
    range: "Allineare",
    rollUsageAria: "tabella di utilizzo della bobina",
    totalConsumed: "totale consumato",
  },
  common: {
    active: "Attivo",
    add: "Aggiungere",
    all: "Tutto",
    cancel: "Annulla",
    close: "Vicino",
    back: "Indietro",
    continue: "Continua",
    copied: "Copiato",
    copyFailed: "Copia non riuscita",
    daysAgo: "{count} giorni fa",
    daysShort: "D",
    discontinued: "Fuori produzione",
    exportCsv: "Esporta CSV",
    exportJson: "Esporta JSON",
    hide: "Nascondere",
    hoursAgo: "{count} ore fa",
    hoursShort: "H",
    justNow: "proprio adesso",
    loading: "Caricamento...",
    loadingPrinters: "Caricamento stampanti...",
    minutes: "min",
    minutesAgo: "{count} minuti fa",
    off: "Spento",
    on: "SU",
    refresh: "Aggiorna",
    remove: "Rimuovere",
    save: "Salva",
    selected: "Selezionato",
    show: "Spettacolo",
    unknown: "Sconosciuto",
  },
  dashboard: {
    bambuLiveAttentionTitle: "Bambu Live richiede attenzione",
    bambuLiveAttentionBody:
      "{name} non sarà più Live finché non verifichi e approvi l’identità della stampante.",
    openBambuLiveSettings: "Apri impostazioni Live",
    onboardingInventoryBody:
      "Inizia con una bobina oppure importa un inventario o un backup esistente.",
    onboardingInventoryTitle: "Aggiungi o importa l’inventario",
    onboardingPrinterBody:
      "Aggiungi una stampante supportata. Bambu Live può essere attivato quando disponibile.",
    onboardingPrinterTitle: "Configura una stampante",
    onboardingCompanionBody:
      "Abilita l’accesso dal browser su una rete attendibile oppure associa questo computer a un host.",
    onboardingCompanionTitle: "Configura l’accesso dal browser",
    onboardingBackupBody:
      "Crea un backup completo quando la libreria è pronta.",
    onboardingEyebrow: "Per iniziare",
    onboardingTitle: "Completa la configurazione",
    onboardingDescription:
      "Segui i passaggi adatti alla tua configurazione. La stampante e l’accesso dal browser sono facoltativi.",
    onboardingProgress: "{completed} di {total} completati",
    onboardingDismiss: "Chiudi l’elenco",
    onboardingComplete: "Completato",
    onboardingOptional: "Facoltativo",
    onboardingPending: "Da fare",
    achievements: "Obiettivi di progresso",
    achievementsHint:
      "Obiettivi in ​​tempo reale basati sull'inventario corrente e sull'attività della stampante.",
    active: "Attivo",
    activePrinters: "Stampanti attive",
    activityEmptyHint:
      "Prestiti, lavori di stampa e altre attività monitorate verranno visualizzati qui.",
    activityHint:
      "I prestiti aperti e l'utilizzo recente della stampante vengono visualizzati qui per primi.",
    addRollsForHealth:
      "Aggiungi rulli per avviare il monitoraggio della salute.",
    amsLoaded: "slots caricato",
    amsOnline: "Slots in linea",
    assigned: "assegnate",
    backup: "Backup",
    backupText:
      "Esporta istantanee dell'inventario su JSON o CSV per l'archiviazione.",
    badgeActiveSpoolsPlaced: "rulli attivi posizionati",
    badgeJobLogging: "Registrazione dei lavori",
    badgeJobLoggingDesc:
      "Registra i lavori collegati alla stampante in modo che il consumo rimanga basato sull'utilizzo reale.",
    badgeJobsLogged: "lavori registrati",
    badgeLocationCoverage: "Copertura della posizione",
    badgeLocationCoverageDesc:
      "Mantieni ogni bobina attiva assegnata a uno scaffale, un prestito o una stampante slot.",
    badgeNoActiveSpools: "Nessun rullo attivo ancora.",
    badgeNoPrinterSlots: "Nessuna stampante slots ancora configurata.",
    badgeSlotReadiness: "Prontezza Slot",
    badgeSlotReadinessDesc:
      "Mantieni AMS/MMU slots pronto quando configurato; le stampanti monomateriale contano EXT.",
    badgeSlotsLoaded: "slots caricato",
    below20: "Sotto il 20%",
    below200: "Sotto i 200 g",
    borrowedInLowStock: "Preso in prestito in stock bassi",
    borrowedInOnHand: "Preso in prestito a portata di mano",
    checkHostConnection: "Controlla la connessione a",
    clientSnapshotActiveLoans: "Prestiti attivi",
    clientSnapshotCapturedAt: "Istantanea catturata",
    clientSnapshotCardHint:
      "Questo dispositivo è connesso come client. Per ora mostra il riepilogo host e mantiene i flussi di lavoro pesanti in scrittura sullo host.",
    clientSnapshotCardTitle: "Anteprima host di sola lettura",
    clientSnapshotHealthHint:
      "Questo client mostra solo il riepilogo host. Per il momento lo stato dettagliato dell'inventario rimane sullo host.",
    clientSnapshotHostOnline: "Host ha segnalato l'attività della stampante",
    clientSnapshotHostPrinters: "Sullo host",
    clientSnapshotLibraryId: "Identificativo della biblioteca",
    clientSnapshotNeedsAttention: "La libreria Host richiede attenzione",
    clientSnapshotSubtitle: "Istantanea host di sola lettura",
    clientSnapshotSynced: "Istantanea Host",
    clientSnapshotSyncedCached: "Istantanea host memorizzata nella cache",
    clientSnapshotSyncedLive: "Istantanea host dal vivo",
    companionCheck: "Controllo dell'app Web",
    companionLive: "Applicazione Web in esecuzione",
    companionOff: "Applicazione Web disattivata",
    configured: "configurate",
    connectedToHost: "Connesso a",
    consumption: "Consumo di filamenti",
    consumptionCaption:
      "L'utilizzo viene aggregato dai processi di stampa collegati alla stampante.",
    gramsPerDay: "{count} g/giorno",
    healthBalanceHint:
      "Guarda insieme le scorte in esaurimento, i prestiti, gli ordini e il slots caricato.",
    healthMonitor: "Monitorare il rifornimento",
    healthRestock: "Consigliato rifornimento",
    healthStable: "Fornitura stabile",
    hostCompanionOff: "Host disconnesso",
    hostFallbackName: "host",
    inUse: "in uso",
    inventoryHealth: "Stato dell'inventario",
    last30: "Ultimi 30 giorni",
    last12Months: "Ultimi 12 mesi",
    annualUsageUnavailable: "Aggiorna l'host per mostrare la cronologia degli ultimi 12 mesi.",
    loaned: "prestato",
    loanedTo: "Prestito a",
    lowest: "più basso",
    lowStock: "Scorte basse",
    lowStockShort: "scorte basse",
    monthlyUsage: "Utilizzo mensile",
    noActivePrinter: "Nessuna stampante attiva selezionata",
    noAlerts: "Nessun avviso",
    noBorrowedInStock: "Nessun titolo preso in prestito",
    noInventoryData: "Dati insufficienti",
    noPrintersConfigured: "Nessuna stampante configurata",
    noRecentActivity: "Nessuna attività recente ancora.",
    noUsageTrendYet: "Nessuna tendenza di utilizzo ancora",
    onOrder: "su ordinazione",
    openCompanionSettings: "Apri le impostazioni companion",
    ownedLowStock: "Possesso di scorte basse",
    ownedOnHand: "Di proprietà",
    ownershipSnapshot: "Istantanea della proprietà",
    ownershipSnapshotHint:
      "Tieni traccia delle azioni possedute e prese in prestito separatamente senza modificare i totali del titolo sopra.",
    ownershipSplitNote:
      "I totali dei titoli sopra riportati combinano ancora tutti i rulli fisici mentre le regole di riepilogo specifiche della proprietà continuano ad evolversi.",
    recentActivity: "Attività recente",
    subtitle:
      "Segui lo stato dell'inventario, l'utilizzo corrente e l'attività della stampante da un'unica panoramica.",
    synced: "Sincronizzato",
    syncedFromDb: "Sincronizzato dal DB locale",
    totalSpools: "Bobine totali",
    totalSpoolsSubtitle: "In tutte le località",
  },
  errors: {
    downloadsUnavailable: "La cartella Download non è disponibile.",
    exportInvalidPayload: "L'esportazione generata non è valida.",
    exportWriteFailed: "Impossibile salvare l'esportazione.",
    forbidden: "Questa azione non è consentita.",
    internal: "Qualcosa è andato storto. Riprova.",
    invalidRequest: "Impossibile completare la richiesta.",
    loadedSpoolEditBlocked:
      "Utilizzare le azioni stampante-slot per modificare una bobina caricata.",
    loanedSpoolEditBlocked:
      "Restituisci il prestito prima di modificare lo stato o la posizione di questa bobina.",
    notFound: "Il record richiesto non è stato trovato.",
    requestFailed: "Impossibile completare la richiesta.",
    spoolActiveLoan:
      "Restituisci il prestito attivo prima di rimuovere questa bobina.",
    spoolStatusEditLimited:
      "Le modifiche del browser sono limitate ai rulli disponibili, vuoti o persi.",
    unauthorized: "È richiesta l'autenticazione.",
  },
  inventory: {
    activeFilters: "attivo",
    addCurrentSelectionToWishlist:
      "Aggiungi la selezione corrente alla lista dei desideri",
    addDirectlyToStock: "Aggiungi direttamente allo stock",
    addedFromWishlist: "Aggiunto dalla lista dei desideri",
    addedToInventory: "Aggiunto all'inventario",
    addFilament: "Aggiungi filamento",
    addFilamentSubtitle:
      "Aggiungi direttamente allo stock o mantieni la lista dei desideri → in ordine → flusso di lavoro dello stock.",
    addMovedPrefix: "Il flusso di aggiunta/ordine viene spostato in alto",
    addMovedSuffix: "scheda.",
    addSpool: "Aggiungi bobina all'inventario",
    addSpoolAction: "Aggiungi bobina",
    addToWishlist: "Aggiungi alla lista dei desideri / ordine",
    addToWishlistHelp:
      "Utilizza la selezione corrente per mantenere la lista dei desideri → in ordine → flusso di lavoro in stock.",
    adjustWeight: "Regolare il peso",
    assignAmsSlot: "Assegna alla stampante slot",
    assignBeforeUsage:
      "Assegna questa bobina a una stampante slot per registrare l'utilizzo.",
    assigned: "Assegnato",
    assignedSlotLabel: "Assegnato slot",
    assignmentManagedOnPrinters:
      "Il posizionamento del filamento e l'assegnazione di slot vengono gestiti nella pagina Stampanti.",
    availableToLoan: "Disponibile al prestito",
    bambuBatchAdded: "Aggiunto batch di codici Bambu",
    bambuBatchAddReady: "Aggiungi partite già pronte",
    bambuBatchAllReady: "Tutti i codici incollati sono pronti.",
    bambuBatchAmbiguous: "Scegli manualmente",
    bambuBatchAppendScan: "Aggiungi al batch",
    bambuBatchBorrowedOwnerRequired:
      "Inserisci da chi vengono presi in prestito i rulli prima di creare questo batch preso in prestito.",
    bambuBatchCameraAction: "Usa la webcam",
    bambuBatchCameraAdded: "Aggiunto",
    bambuBatchCameraAddedCodeValues: "Aggiunto {codes}.",
    bambuBatchCameraAddedMixedValues:
      "Aggiunto {codes}; Valore/i del codice a barre {reviewCount} da rivedere.",
    bambuBatchCameraAddedReviewValues: "Aggiunto per la revisione: {values}.",
    bambuBatchCameraAlreadyAdded:
      "Già aggiunto. Allontanare l'etichetta prima di eseguire la scansione di un'altra copia.",
    bambuBatchCameraBarcodeUnsupported:
      "Il rilevamento dei codici a barre in tempo reale non è disponibile qui. Utilizza l'importazione di immagini o digita invece il codice.",
    bambuBatchCameraDuplicate: "Già aggiunto",
    bambuBatchCameraError: "Impossibile avviare la fotocamera.",
    bambuBatchCameraErrorShort: "Errore della fotocamera",
    bambuBatchCameraIgnored: "Ignorato",
    bambuBatchCameraIgnoredQr:
      "Ignorata un'istruzione Bambu QR. Continua a mostrare l'etichetta del codice filamento.",
    bambuBatchCameraNoBarcodeYet:
      "Cornici di scansione; nessuna corrispondenza del codice a barre ancora. Avvicinarsi o allontanarsi finché le barre non diventano affilate.",
    bambuBatchCameraPermissionDenied:
      "Il permesso della telecamera è stato negato. Consenti l'accesso alla fotocamera e riprova.",
    bambuBatchCameraPreviewError:
      "Impossibile avviare l'anteprima della fotocamera.",
    bambuBatchCameraPreviewIdle:
      "Avvia la webcam per scansionare le etichette delle scatole Bambu.",
    bambuBatchCameraReadError:
      "La scansione della fotocamera si è interrotta dopo un errore di lettura.",
    bambuBatchCameraReadRetry:
      "La fotocamera è ancora attiva, ma il lettore ha saltato un fotogramma. Mantieni ferma l'etichetta.",
    bambuBatchCameraReview: "Revisione",
    bambuBatchCameraScanning: "Scansione",
    bambuBatchCameraShowLabel:
      "Tenere il codice del filamento o il codice a barre piatto nella guida, abbastanza lontano da mantenere le barre affilate.",
    bambuBatchCameraStarting: "Avvio della fotocamera",
    bambuBatchCameraStartingAction: "Avvio della fotocamera...",
    bambuBatchCameraStartingMessage: "Avvio della fotocamera...",
    bambuBatchCameraStop: "Arresta la webcam",
    bambuBatchCameraUnavailable: "Fotocamera non disponibile",
    bambuBatchCameraUnsupported:
      "L'accesso alla fotocamera non è disponibile qui. Utilizza l'importazione di immagini o digita invece il codice.",
    bambuBatchChooseMatch: "Scegli la riga del catalogo",
    bambuBatchHeaderAction: "Aggiunta in batch dalle scatole",
    bambuBatchHeaderActionShort: "Lotto",
    bambuBatchHelp:
      "Incolla uno o più codici a cinque cifre. Le corrispondenze pronte utilizzano i dettagli dello stock da Aggiungi filamento.",
    bambuBatchImageAction: "Aggiungi dall'immagine",
    bambuBatchImageAddedCodes:
      "Codice/i filamento/i {count} aggiunto/i al lotto.",
    bambuBatchImageAddedMixed:
      "Al lotto sono stati aggiunti i codici dei filamenti {codeCount} e i valori dei codici a barre {reviewCount} per la revisione.",
    bambuBatchImageAddedReview:
      "Valore/i del codice a barre {count} aggiunto/i per la revisione.",
    bambuBatchImageError: "Impossibile leggere quell'immagine.",
    bambuBatchImageIgnored:
      "Ignorati i valori dell'istruzione {count} Bambu QR.",
    bambuBatchImageNoBarcode:
      "Nell'immagine non è stato trovato alcun codice a barre.",
    bambuBatchImageScanning: "Lettura dell'immagine...",
    bambuBatchImageUnsupported:
      "Il rilevamento del codice a barre delle immagini non è disponibile qui. Incolla o digita invece il codice.",
    bambuBatchInputLabel: "Codici in questo lotto",
    bambuBatchModalEyebrow: "Scatole Bambu",
    bambuBatchModalSubtitle:
      "Aggiungi diverse bobine Bambu dalla scatola Codici Filamento senza spostare la normale ricerca nel catalogo fuori dalla vista.",
    bambuBatchModalTitle: "Aggiunta in batch dalle scatole",
    bambuBatchMoreRows: "Di più",
    bambuBatchNeedsReview: "revisione",
    bambuBatchNoCode: "Nessun codice",
    bambuBatchNoMatch: "Nessuna corrispondenza",
    bambuBatchNoneReady:
      "Nessuna riga è ancora pronta. Scegli corrispondenze ambigue o interrotte oppure rivedi manualmente i codici mancanti.",
    bambuBatchNoRowsYet:
      "I codici scansionati e digitati verranno visualizzati qui.",
    bambuBatchPartialReady:
      "Verranno aggiunte solo le righe già pronte; le righe di revisione vengono saltate.",
    bambuBatchPlaceholder: "53400\n53600\n65103",
    bambuBatchReady: "Pronto",
    bambuBatchReadyShort: "pronto",
    bambuBatchScanHelp:
      "Utilizza la webcam, l'importazione di immagini o digita un codice alla volta.",
    bambuBatchScanLabel: "Scansiona o digita un codice",
    bambuBatchScanPlaceholder: "Scansiona o digita un codice",
    bambuBatchScanTitle: "Scansiona o inserisci i codici",
    bambuBatchTitle: "Codici dei filamenti batch",
    bambuCodeBoxLabelHint: "Trova questo campo sull'etichetta della scatola.",
    bambuCodeBoxLabelTitle: "Etichetta della scatola",
    bambuCodeDiscontinuedOnly:
      "Solo le voci del catalogo Bambu fuori produzione utilizzano questo codice.",
    bambuCodeEnterExample:
      "Digita il codice nel campo di ricerca, ad esempio 53400.",
    bambuCodeHelp:
      "Utilizzare il codice a cinque cifre stampato come codice filamento sull'etichetta della scatola Bambu.",
    bambuCodeLabel: "Codice filamento",
    bambuCodeMoreMatches: "Di più",
    bambuCodeMultipleMatches:
      "Questo codice viene utilizzato da diverse voci del catalogo Bambu attive. Scegli la riga corretta.",
    bambuCodeNoMatch:
      "Nessuna voce del catalogo Bambu utilizza ancora questo codice filamento.",
    bambuCodeSingleMatch:
      "Una voce di catalogo Bambu attiva corrisponde ed è selezionata.",
    bambuCodeTryCatalogSearch:
      "Puoi comunque cercare per materiale, serie o nome del colore.",
    borrowedFrom: "Preso in prestito da",
    borrowedIn: "Ricevuta in prestito",
    borrowedInBatchRegistered: "Lotto preso in prestito registrato",
    borrowedInHelp:
      "Registra questa bobina come presa in prestito da qualcun altro. Può ancora essere utilizzato nelle stampanti, ma non apparirà nei candidati al prestito.",
    borrowedInNoteOptional: "Banconota presa in prestito (facoltativo)",
    borrowedInRegistered: "Bobina presa in prestito registrata",
    borrowedRolls: "Bobine in prestito",
    borrowerName: "Nome del mutuatario",
    catalogDetails: "Dettagli del catalogo",
    catalogManagedInSettings:
      "Gli aggiornamenti del catalogo e l'avanzamento dell'aggiornamento sono gestiti in Impostazioni → Catalogo filamenti.",
    catalogManagedInSettingsHelp:
      "Utilizza il catalogo locale qui sotto per aggiungere bobine direttamente allo stock, alla lista dei desideri o alle code degli ordini.",
    catalogMatchCount:
      "{count, plural, one {# corrispondenza} other {# corrispondenze}}",
    catalogMatchCountPlural: "{count} corrisponde",
    catalogMatchCountSingular: "Corrispondenza {count}",
    catalogRefreshFilter: "Aggiornamento e filtro del catalogo",
    catalogSelection: "Selezione del catalogo",
    changes: "Cambiamenti",
    chooseRollToLoan: "Scegli una bobina da prestare.",
    clientHostUnavailable:
      "Mancano i dettagli di connessione Host per questo dispositivo client.",
    clientLoanOutPairedHint:
      "Le bobine disponibili vengono caricate dallo host e lì viene creato il prestito.",
    clientLoanOutUnpairedHint:
      "Associa questo client desktop allo host prima di creare un prestito da questo dispositivo.",
    clientReadOnlyAction:
      "Questo dispositivo è connesso come client. Utilizzare host per le modifiche all'inventario.",
    clientReadOnlyBanner:
      "Questo dispositivo è collegato come client. Per il momento le modifiche all'inventario rimangono su host.",
    clientReadOnlyBannerPaired:
      "Questo dispositivo è connesso come client. Gli aggiornamenti dell'inventario vengono inviati allo host abbinato, mentre lo host rimane ancora l'autorità della biblioteca.",
    clientReadOnlyCached:
      "Host non è disponibile. Visualizzazione dell'ultima istantanea dell'inventario memorizzata nella cache.",
    clientReadOnlyHost: "Host",
    clientReadOnlyLive: "Visualizzazione dell'inventario host in tempo reale.",
    clientReadOnlyManage:
      "Questo dispositivo è connesso come client. Puoi rivedere la bobina qui e le azioni host accoppiate rimarranno limitate ed esplicite.",
    clientReadOnlyOffline:
      "Host non è disponibile e non è ancora disponibile alcuno snapshot dell'inventario memorizzato nella cache.",
    clientReadOnlyUpdated: "Aggiornato",
    clientTareWeightUpdated:
      "Peso bobina vuota aggiornato sulla libreria host.",
    clientWeightUpdated: "Peso aggiornato sulla libreria host.",
    clientWriteRequiresPairing:
      "Associa questo client desktop a host prima di eseguire azioni di sincronizzazione protette.",
    confirmDelete: "Fare di nuovo clic per confermare l'eliminazione",
    confirmDeleteAction: "Elimina dall'inventario attivo",
    confirmMarkEmptyAction: "Contrassegna la bobina come vuota",
    confirmPurge: "Fare di nuovo clic per confermare l'eliminazione permanente",
    confirmPurgeAction: "Spurgare la bobina in modo permanente",
    current: "attuale",
    currentStatus: "Stato attuale",
    dangerZone: "Zona pericolosa",
    dangerZoneHint:
      "Aprire solo quando è necessario svuotare, rimuovere o spurgare permanentemente questa bobina.",
    deleteConfirmHint:
      "La bobina scompare dall'inventario attivo, mentre la cronologia registrata viene conservata.",
    deleteConfirmTitle: "Eliminare questa bobina dall'inventario attivo?",
    deleteRoll: "Elimina la bobina dall'inventario attivo",
    discontinued: "Fuori produzione",
    editHomeLocation: "Posizione abituale",
    editLocation: "Modifica posizione",
    editOwnership: "Proprietà",
    emptySpoolWeight: "Peso bobina vuota (g)",
    emptySpoolWeightHelp:
      "Utilizzato per sottrarre la tara della bobina dal totale misurato in modo che il filamento rimanente rimanga accurato.",
    error: {
      add: "Impossibile aggiungere il filamento.",
      assignFirst: "Assegnare prima la bobina a una stampante slot.",
      bambuBatchEmpty:
        "Incolla almeno un codice filamento Bambu con una corrispondenza già pronta nel catalogo.",
      bambuBatchWrongMode:
        "Passa alla sorgente Bambu prima di creare un batch di codici filamento.",
      borrowedInNeedsOwner:
        "La registrazione di prestito richiede un nome da cui viene presa in prestito la bobina.",
      borrowerRequired: "Il nome del mutuatario è obbligatorio.",
      createBambuBatch:
        "Impossibile creare il batch di codici Bambu. Controlla l'unicità e i valori di QR.",
      createSpool:
        "Impossibile creare la bobina. Controlla l'unicità e i valori di QR.",
      deleteRoll: "Impossibile eliminare la bobina.",
      esunDetail: "Impossibile caricare i dettagli del prodotto eSUN.",
      esunLookup: "Ricerca eSUN non riuscita. Riprova.",
      esunQueryShort: "Digitare almeno 2 caratteri per la ricerca eSUN.",
      incomingWeightRequired:
        "Inserisci il peso della bobina in entrata prima di salvare le modifiche slot.",
      invalidHex:
        "Colore campione non valido. Utilizza #RRGGBB, multi(#RRGGBB,#RRGGBB) o gradiente(#RRGGBB,#RRGGBB).",
      invalidWeight: "Il valore del peso non è valido.",
      loadInventory: "Impossibile caricare l'inventario.",
      loadSpools: "Impossibile caricare le bobine di inventario.",
      loanAlreadyActive: "Questo mulinello ha già un prestito attivo.",
      loanBorrowedIn:
        "Le bobine prese in prestito non possono essere nuovamente prestate.",
      loanGrams: "I grammi del prestito devono essere pari a zero o superiori.",
      loanOut: "Impossibile prestare la bobina.",
      manualNeedsFields:
        "La creazione manuale richiede il nome e il colore del filamento.",
      markEmpty: "Impossibile contrassegnare la bobina come vuota.",
      masterFieldsRequired:
        "Per salvare i metadati sono necessari fornitore, materiale, nome del filamento e colore.",
      outgoingWeightRequired:
        "Immettere il peso della bobina in uscita prima di sostituire questo slot.",
      outgoingWeightRequiredForUnassign:
        "Immettere il peso della bobina in uscita prima di rimuovere la bobina da slot.",
      ownerNameRequired:
        "Le bobine prese in prestito necessitano di un nome del proprietario o della controparte.",
      printLabel: "Impossibile generare l'etichetta.",
      purgeRoll: "Impossibile eliminare la bobina.",
      recordUsage: "Impossibile registrare l'utilizzo della stampante.",
      refill: "Impossibile riattivare la bobina.",
      refillRequiresWeight:
        "Impostare il peso totale misurato sopra il peso della bobina vuota prima di riattivare.",
      requireAmsForInUse:
        "Scegliere una stampante slot prima di impostare ASSIGNED.",
      returnedGrams:
        "I grammi restituiti devono essere pari a zero o superiori.",
      returnLoan: "Impossibile restituire la bobina prestata.",
      saveRfid: "Impossibile salvare il tag RFID.",
      saveRollChanges: "Impossibile salvare le modifiche alla bobina.",
      selectBambuFirst: "Seleziona prima un filamento Bambu.",
      selectEsunFirst: "Esegui la ricerca eSUN e seleziona un prodotto.",
      stockFromWishlist:
        "Impossibile immagazzinare la bobina dall'articolo della lista dei desideri.",
      toggleLost: "Impossibile aggiornare lo stato perso.",
      unlockMetadataFirst:
        "Sblocca i metadati prima di modificare i dettagli del catalogo.",
      updateHomeLocation: "Impossibile salvare la posizione dell'abitazione.",
      updateLocation: "Impossibile aggiornare la posizione.",
      updateMetadata: "Impossibile aggiornare i metadati della bobina.",
      updateOwnership: "Impossibile aggiornare la proprietà della bobina.",
      updateTareWeight: "Impossibile aggiornare il peso della bobina vuota.",
      updateWeight: "Impossibile aggiornare il peso.",
    },
    field: "Campo",
    fields: "campi",
    filters: "Filtri",
    hideAdvancedFilters: "Nascondi dettagli",
    historyEvent: {
      addedToLibrary: "Aggiunto alla libreria",
      addedToLibraryDetail: "Filamento è stato aggiunto alla libreria.",
      assignedToAms: "Assegnato alla stampante slot",
      borrowedInRegistered: "Preso in prestito in registrato",
      borrowedInReturned: "Preso in prestito e restituito",
      correction: "Correzione",
      deleted: "Eliminato",
      detailsUpdated: "Dettagli aggiornati",
      loanedOut: "Prestito",
      loanReturned: "Prestito restituito",
      locationUpdated: "Posizione aggiornata",
      printJobRecorded: "Utilizzo della stampa registrato",
      rfidSaved: "RFID salvato",
      rfidSavedDetail: "L'identità RFID è stata salvata dall'acquisizione AMS.",
      statusUpdated: "Stato aggiornato",
      usedUp: "Contrassegnato come vuoto",
      weightCorrected: "Peso corretto",
      weightUpdated: "Peso aggiornato",
    },
    historyEventCount: "{count, plural, one {# evento} other {# eventi}}",
    historyEventCountMany: "eventi",
    historyEventCountOne: "evento",
    historyFilteredHint:
      "Le assegnazioni della stampante slot sono mostrate sopra in modo che questa cronologia rimanga focalizzata sull'attività della bobina.",
    homeLocationHintWhileAssigned:
      "Il posizionamento corrente viene gestito nella pagina Stampanti. La posizione iniziale è dove la bobina ritorna quando non è più caricata.",
    homeLocationLabel: "Posizione abituale",
    homeLocationOptional: "Posizione abituale (facoltativa)",
    homeLocationSaved: "Posizione casa salvata.",
    imported: "Importato",
    incomingWeight: "In arrivo g",
    initialWeight: "Peso iniziale (g)",
    inUseRequiresAms: "ASSIGNED richiede l'assegnazione a una stampante slot.",
    keepUnassignedOption: "No slot (mantieni non assegnato)",
    labelBuilderSubtitle:
      "Scegli una dimensione fisica, controlla l'anteprima e salva un PNG pronto per la stampa.",
    labelBuilderTitle: "Crea l'immagine dell'etichetta",
    labelImageHint:
      "Il PNG viene visualizzato a 300 DPI per un dimensionamento fisico prevedibile.",
    labelPreview: "Anteprima dell'etichetta",
    labelPreviewUnavailable: "Anteprima dell'etichetta non disponibile",
    labelProfile: {
      compact: "Compatto",
      expanded: "Espanso",
      "ptouch-24": "P-Touch 24 mm",
      standard: "Standard",
    },
    labelPtouchHint:
      "Progettato per nastri da 24 mm con QR a tutta altezza e testo leggibile.",
    labelRendering: "Etichetta di rendering...",
    labelSaved: "Etichetta PNG salvata in Download.",
    labelSaveDownloads: "Salva PNG nei download",
    labelSaving: "Salvataggio PNG...",
    labelSheetHint:
      "Hai bisogno di etichette per più bobine? Crea un foglio di etichette per l'inventario in Impostazioni → Generale.",
    labelSize: "Dimensioni dell'etichetta",
    lastAmsIdentitySeen: "Ultimo avvistamento AMS",
    lastAmsSightingLiveActivity: "Dal vivo slot",
    lastUpdated: "Ultimo aggiornamento",
    loading: "Caricamento bobine...",
    loadingHistory: "Caricamento cronologia...",
    loanCandidateCount: "{count, plural, one {# bobina} other {# bobine}}",
    loanCandidateMany: "bobine",
    loanCandidateOne: "bobina",
    loanCreated: "Prestito creato.",
    loanDetails: "Dettagli del prestito",
    loanDetailsHelp:
      "Confermare il mutuatario e il peso in uscita prima di salvare il prestito.",
    loanNoteOptional: "Nota di prestito (facoltativa)",
    loanOutRoll: "Presta bobina",
    loanSearchFilteredCount: "{visible} di {total} {unit}",
    loanSearchFilteredCountIcu:
      "{visible} di {total, plural, one {# bobina} other {# bobine}}",
    loanSearchLabel: "Cerca i rulli disponibili",
    loanSearchPlaceholder:
      "Cerca materiale, colore, fornitore, posizione o riferimento",
    loanSelectionHelp:
      "Scegli una bobina in stock, quindi conferma chi la prenderà e quanto uscirà.",
    loanTracking: "Monitoraggio del prestito",
    loanTrackingHint:
      "I resi e la pesatura al reso vengono gestiti dalla pagina Prestiti.",
    loanTrackingSubtitle:
      "Prestito di una bobina dall'inventario. I resi vengono gestiti dalla pagina Prestiti.",
    location: "Posizione",
    locationOptional: "Posizione (facoltativo)",
    locationSaved: "Posizione aggiornata.",
    lockMetadata: "Blocca i metadati",
    lostStatus: "Stato perduto",
    lowStockActiveBadge: "Filtro scorte basse attivo",
    lowStockOnly: "Scorte limitate (1-200 g)",
    manageInventory: "Gestire l'inventario",
    manualDetails: "Dettagli del manuale",
    manualDetailsHelp:
      "Utilizzalo quando manca un filamento dal catalogo del fornitore o desideri un inserimento completamente manuale.",
    markedFound: "bobina ripristinata in stock.",
    markedLost: "bobina contrassegnata come persa.",
    markEmpty: "Segna come esaurito (vuoto)",
    markEmptyConfirmHint:
      "Il peso rimanente verrà impostato su 0 g. Se la bobina è caricata in una stampante slot, verrà rimossa da quella slot.",
    markEmptyConfirmTitle: "Contrassegnare questa bobina come vuota?",
    markFound: "Segna come trovato (in stock)",
    markLost: "Segna come perso",
    material: "Materiale",
    materialGroup: "Materiale",
    maxAvailable: "Massimo disponibile",
    measuredTotalWeight: "Peso totale misurato (g)",
    metadataAppliesToFamily:
      "Le modifiche aggiornano la voce del catalogo dei filamenti condivisi per tutte le bobine di questa famiglia di filamenti.",
    moreRolls: "più bobine",
    noActiveLoans: "Nessun prestito attivo.",
    noCatalogMatches:
      "Nessuna voce del catalogo corrisponde ai filtri del fornitore corrente.",
    noHistory: "Nessun evento storico ancora.",
    noLoanableRolls: "Nessun rullo è attualmente disponibile per il prestito.",
    noLoanSearchResults:
      "Nessun rullo disponibile corrisponde alla tua ricerca.",
    noMatch: "Nessun rullo corrisponde ai filtri attuali.",
    noMatchHint:
      "Prova a modificare i filtri di ricerca, stato, materiale o proprietà.",
    noSelectionPreview:
      "Scegli una riga del catalogo o inserisci i dettagli manuali prima di salvare.",
    noVisibleHistory:
      "Nessuna cronologia delle bobine oltre alle assegnazioni della stampante slot.",
    out: "Fuori",
    outG: "Fuori g",
    outgoingWeight: "In uscita g",
    outgoingWeightPromptTitle: "Imposta il peso della bobina in uscita",
    ownedByUs: "Propria",
    ownedByUsDetail: "Di nostra proprietà",
    ownedOwnershipHelp:
      "I rulli di tua proprietà rimangono nel tuo inventario e possono essere prestati in seguito.",
    ownerContactOptional: "Contatto del proprietario (facoltativo)",
    ownerNameRequired: "Nome del proprietario (richiesto)",
    ownership: "Proprietà",
    ownershipAll: "Tutto",
    ownershipGroup: "Proprietà",
    ownershipNoteOptional: "Nota (facoltativa)",
    ownershipType: "Tipo di proprietà",
    ownershipUpdated: "proprietà della bobina aggiornata.",
    placement: "Posizionamento",
    printerUsage: "Utilizzo della stampante",
    printQr: "Crea etichetta QR",
    purgeConfirmHint:
      "Questa operazione non può essere annullata. La bobina e ogni evento storico registrato verranno eliminati.",
    purgeConfirmTitle:
      "Eliminare definitivamente questa bobina e tutta la cronologia?",
    purgeRoll: "Elimina bobina e tutta la cronologia in modo permanente",
    qrCode: "Codice QR",
    qrCompanionLinkLabel: "Collegamento Companion",
    qrCompanionUnavailable:
      "I link QR di Companion richiedono l'indirizzo locale stabile. Rendilo disponibile sull'host attivo prima di creare un'etichetta.",
    qrLabel: "QR",
    qrTarget: "Obiettivo QR",
    qrTargetCompanionHint:
      "Questo QR apre direttamente il browser companion finché lo URL di destinazione è ancora raggiungibile.",
    quickActions: "Azioni rapide",
    reactivated: "Riattivato",
    reference: "Riferimento",
    refill: "Ricarica/Riattiva la bobina",
    refilled: "mulinello riattivato e pronto all'uso.",
    refilledAuto: "bobina riattivata dal nuovo peso misurato.",
    registerBorrowedIn: "Registra la bobina presa in prestito",
    remaining: "Rimanente",
    remainingWeight: "Peso rimanente (g)",
    removeFromSlotOption: "slot vuoto (rimuovere dall'attuale slot)",
    replacingRoll: "Sostituzione",
    resetFilters: "Reimposta i filtri",
    returnToInventory: "Ritorna all'inventario",
    rfidActiveSource: "Sorgente attiva",
    rfidAmsBambuBits: "Punte AMS Bambu",
    rfidAmsExistBits: "AMS slot bit presenti",
    rfidAmsReadDone: "AMS lettura dei bit completati",
    rfidAmsSlotMissing: "Non fisicamente presente",
    rfidAmsSlotPresence: "Presenza slot selezionata",
    rfidAmsSlotPresent: "Fisicamente presente",
    rfidAmsStatus: "Stato AMS RFID",
    rfidBambuUnregistered: "RFID non ancora registrato",
    rfidBambuUnregisteredHint:
      "Le bobine Bambu possono essere collegate automaticamente caricando la bobina in AMS e salvando l'identità RFID osservata.",
    rfidButton: "RFID",
    rfidCapturedFields: "Campi slot catturati",
    rfidCapturedFieldsCollapsed: "Mostra i campi slot acquisiti",
    rfidCaptureFailed:
      "Impossibile aggiornare l'acquisizione RFID dalla stampante.",
    rfidCaptureNoPayload:
      "Nessun payload attivo è ancora disponibile per questa stampante. Attiva un aggiornamento AMS in Bambu Studio o attendi il successivo burst di stato.",
    rfidCaptureNoSlotData:
      "Per questa origine slot non sono ancora disponibili campi AMS specifici per slot.",
    rfidCaptureNothingToSave:
      "Nessuna identità RFID è ancora disponibile per la sorgente selezionata slot.",
    rfidCaptureStatus: "Cattura lo stato",
    rfidCaptureTitle: "Cattura RFID",
    rfidCaptureUnavailable:
      "Per questo slot non sono ancora arrivati ​​campi AMS specifici per slot.",
    rfidCaptureUsingLastKnown:
      "In attesa di nuovi dati AMS slot. I valori acquisiti in precedenza rimangono visibili fino all'arrivo di dati più recenti.",
    rfidCaptureWaiting:
      "In attesa di nuovi dati AMS slot. Mantenere questa finestra aperta mentre la stampante segnala gli aggiornamenti del vassoio.",
    rfidConnected: "Collegato",
    rfidCurrentTag: "Salvato RFID",
    rfidDisconnected: "Non connesso",
    rfidHintNeedsLive:
      "L'acquisizione RFID richiede una stampante con lo stato Live Bambu abilitato e almeno un AMS slot disponibile.",
    rfidHintReady:
      "Acquisisci i dati sull'identità AMS/RFID, rivedili e salva l'identità RFID osservata quando sembra corretta.",
    rfidIdentityCandidates: "Segnali di identità RFID",
    rfidIdentitySignals: "Segnali di identità RFID",
    rfidLastSeen: "Visto l'ultima volta",
    rfidLastSlotData: "Ultimi dati slot",
    rfidMatchExact: "Esatto",
    rfidMatchExactHint: "Il materiale e il campione HEX corrispondono.",
    rfidMatchPartial: "Parziale",
    rfidMatchPartialHint:
      "Il materiale corrisponde e il colore osservato è vicino al campione del catalogo.",
    rfidNoCaptureSource: "Nessun AMS slot live disponibile",
    rfidObservedColor: "Colore osservato",
    rfidObservedMaterial: "Filamento osservato",
    rfidObservedTag: "Osservato RFID",
    rfidPresetName: "Nome preimpostato/materiale",
    rfidPresetSignal: "Impostazioni del filamento preimpostate",
    rfidPrinterLive: "Stampante in funzione",
    rfidRegistered: "RFID registrato",
    rfidSaved: "Tag RFID salvato sulla bobina selezionata.",
    rfidSlotActive: "Attivo",
    rfidSlotEmpty: "Vuoto",
    rfidSlotIdentitySeen: "RFID visto",
    rfidSlotLive: "Vivere",
    rfidSlotLiveSeen: "Visto dal vivo",
    rfidSlotLoaded: "Caricato",
    rfidSourceSlot: "RFID sorgente slot",
    rfidTechnicalDetails: "Dettagli tecnici",
    rfidTechnicalDetailsHint:
      "Segnali di identità RFID grezzi, stato di acquisizione e campi slot acquisiti.",
    rfidUnsupportedVendor: "AMS RFID non disponibile",
    rfidUnsupportedVendorHint:
      "L'identità AMS RFID è attualmente esposta solo per i rulli Bambu. Tieni invece traccia di questa bobina con QR, peso, posizione e assegnazione della stampante.",
    rollHistory: "Cronologia bobina",
    rollHistoryCollapsed:
      "la cronologia dei rulli è compressa per impostazione predefinita. Espandilo per visualizzare gli eventi.",
    rollMetadata: "metadati della bobina",
    rolls: "bobine",
    rollSetup: "configurazione della bobina",
    saveMetadata: "Salva metadati",
    saveOwnership: "Salva la proprietà",
    saveRfid: "Salva RFID",
    saveRollChanges: "Salva le modifiche alla bobina",
    searchPlaceholder:
      "Cerca per materiale, colore, proprietario, posizione o QR",
    searchVendorCatalog: "Cerca materiale, filamento o colore {{vendor}}",
    selectedRoll: "Bobina selezionata",
    selectionPreview: "Anteprima della selezione",
    selectRollForHistory:
      "Seleziona una bobina per mostrare la cronologia del ciclo di vita.",
    selectRollForUsage:
      "Seleziona una bobina per mostrare l'andamento del peso.",
    selectRollPrompt:
      "Seleziona una bobina da una carta raggruppata per gestirla.",
    showAdvancedFilters: "Più filtri",
    showAllRolls: "Mostra tutto",
    showFewerRolls: "Mostra meno",
    showLessHistory: "Mostra meno",
    showMoreHistory: "Mostra di più",
    slot: "slot",
    slotAssignment: "Assegnazione Slot",
    slotWeightPromptTitle: "Imposta i pesi di modifica slot",
    spoolResult: "bobina",
    spoolResults: "bobine",
    status: "Stato",
    statusAssigned: "Assegnato",
    statusBorrowed: "Prestito",
    statusDeleted: "Eliminato",
    statusEmpty: "Vuoto",
    statusInStock: "In magazzino",
    statusInUse: "In uso",
    statusLost: "Perduto",
    statusMissing: "Mancante",
    stockDetails: "Dettagli di magazzino",
    stockEntry: "Inserimento in magazzino",
    stockEntryHelp:
      "Scegli un flusso del fornitore, scegli un filamento, quindi conferma i dettagli dello stock di seguito.",
    stockRollNow: "Aggiungi ora allo stock",
    subtitle: "Gestisci stock, prestiti e peso delle bobine in un unico posto.",
    swapWeightHint:
      "Durante lo scambio delle bobine, il peso in uscita registra l'utilizzo collegato alla stampante prima della riassegnazione. Il peso in entrata è facoltativo.",
    swatchColorCode: "Codice colore del campione",
    swatchColorPicker: "Selettore colore campione",
    tareWeightUpdated: "Aggiornato il peso della bobina vuota.",
    title: "Bobine",
    to: "A",
    total: "Totale",
    typeAll: "Tutto",
    unassigned: "Non assegnato",
    unknownCollection: "collezione sconosciuta",
    unlockMetadata: "Sblocca i metadati",
    updatingRoll: "Aggiornamento della bobina selezionata...",
    usageDiagram: "Diagramma di utilizzo",
    value: "Valore",
    vendorAll: "Tutto",
    vendorGroup: "Venditore",
    vendorSource: "Origine del venditore",
    viewCards: "Visualizzazione della scheda",
    viewGroup: "Visualizzazione",
    viewList: "Visualizzazione elenco",
    visualFixtureLoaded: "Dispositivo dei dettagli dell'inventario caricato.",
    weightLabel: "Peso attuale (g)",
    weightValue: "Valore del peso (g)",
    wishlistOrders: "Lista dei desideri e ordini",
    wishlistQueueHelp:
      "Conserva qui gli acquisti pianificati, spostali in ordine e poi immagazzinali quando arrivano.",
    wishlistWorkflow: "Flusso di lavoro della lista dei desideri",
    workspace: "Spazio di lavoro",
  },
  loans: {
    activeBorrowedIn: "Ricevute attive",
    activeLoans: "Prestiti attivi",
    activeRecords: "Record attivi",
    back: "Indietro",
    borrowedGrams: "Preso in prestito",
    borrowedInAt: "Ricevuta il",
    borrower: "Mutuatario",
    clientHostUnavailable:
      "Mancano i dettagli di connessione Host per questo dispositivo client.",
    clientReadOnlyAction:
      "Questo dispositivo è connesso come client. Utilizzare host per le modifiche del prestito.",
    clientReadOnlyBanner:
      "Questo dispositivo è collegato come client. Per ora le modifiche al prestito rimangono sullo host.",
    clientReadOnlyBannerPaired:
      "Questo dispositivo è connesso come client. I resi e le restituzioni possono essere inviati allo host, mentre la creazione di nuovi prestiti rimane lì.",
    clientReadOnlyCached:
      "Host non è disponibile. Mostra l'ultima istantanea del prestito memorizzata nella cache.",
    clientReadOnlyHost: "Host",
    clientReadOnlyLive: "Visualizzazione dei prestiti host in tempo reale.",
    clientReadOnlyOffline:
      "Host non è disponibile e non è ancora disponibile alcuno snapshot del prestito memorizzato nella cache.",
    clientReadOnlyUpdated: "Aggiornato",
    clientWriteRequiresPairing:
      "Associa questo client desktop a host prima di eseguire azioni di prestito protetto.",
    confirmHandBackAction: "Conferma restituzione",
    confirmReturnAction: "Conferma il reso",
    consumed: "Consumato",
    csvExported: "CSV dei prestiti esportato.",
    desktopOnly:
      "Il monitoraggio del prestito è disponibile nella build dell'app desktop.",
    direction: "Direzione",
    directionInbound: "Ricevute in prestito",
    directionOutbound: "Prestate",
    error: {
      export: "Impossibile esportare prestiti CSV.",
      handBack: "Impossibile restituire la bobina presa in prestito.",
      invalidReturned:
        "I grammi restituiti devono essere pari a zero o superiori.",
      load: "Impossibile caricare i dati del prestito.",
      return: "Impossibile restituire il prestito.",
    },
    estimatedUsedGrams: "Utilizzo stimato",
    exportCsv: "Esporta prestiti (CSV)",
    handBackAction: "Restituisci",
    handBackDialogHint:
      "Restituirlo rimuoverà la bobina presa in prestito dall'inventario attivo ma manterrà la cronologia del prestito.",
    handBackDialogSubtitle:
      "Pesalo nuovamente, aggiungi una nota se necessario, quindi rimuovilo dall'inventario attivo.",
    handBackDialogTitle: "Restituisci la bobina ricevuta in prestito",
    handBackDialogWeightLabel: "Peso totale restituito incl. bobina (g)",
    handedBack: "Restituito",
    handedBackAt: "Restituito",
    handedBackFilamentGrams: "Restituito",
    history: "Cronologia prestiti",
    historyHint:
      "Registra qui la restituzione al cliente o al proprietario. I record completati restano disponibili per la consultazione.",
    in: "Entrata",
    lent: "Prestata il",
    loading: "Caricamento prestiti...",
    loanedGrams: "Prestito",
    markedHandedBackTo:
      "Bobina contrassegnata come presa in prestito come restituita a",
    markedReturnedFor: "Prestito contrassegnato come restituito",
    noMatch: "Nessun prestito corrisponde al filtro attuale.",
    noUsageByPerson: "Nessun dato personale sull'utilizzo ancora.",
    out: "Uscita",
    resultCount: "{count, plural, one {# prestito} other {# prestiti}}",
    resultCountMany: "prestiti",
    resultCountOne: "prestito",
    returnAction: "Restituisci",
    returnDialogSubtitle: "Ripesalo e aggiungi una nota se necessario.",
    returnDialogTitle: "Restituire la bobina prestata",
    returnDialogWeightLabel: "Peso totale restituito incl. bobina (g)",
    returned: "Restituito",
    returnedFilamentGrams: "Restituito",
    returnedG: "Restituito g",
    returnedGrams: "Grammi restituiti",
    returnedLoans: "Prestiti restituiti",
    returnedRecords: "Registri restituiti",
    returnNoteOptional: "Nota di reso (facoltativa)",
    returnSummaryLabel: "Riepilogo del reso",
    searchPlaceholder: "Cerca ID persona/materiale/bobina",
    spool: "bobina",
    spoolId: "ID della bobina",
    startWeight: "Inizio",
    subtitle:
      "Tieni traccia dei prestiti attivi, delle bobine prese in prestito e dei resi in un unico posto.",
    totalConsumed: "Totale consumato",
    usageByPerson: "Utilizzo da parte di persona",
    usageHint:
      "Scopri chi ha attualmente prestiti in uscita attivi e quanto materiale ha utilizzato ciascuna persona.",
  },
  nav: {
    dashboard: "Dashboard",
    inventory: "Inventario",
    loans: "Prestiti",
    printers: "Stampanti",
    settings: "Impostazioni",
    statistics: "Statistiche",
  },
  printers: {
    addBorrowedCatalogRollAndSaveRfid:
      "Aggiungi preso in prestito + salva RFID",
    addCatalogRollAndSaveRfid: "Aggiungi + salva RFID",
    amsSlot: "AMS Slot",
    applyRollChange: "Applicare il cambio bobina",
    availableRollsForSlot: "Bobine disponibili per",
    channel: "Canale",
    chooseRollForSlot: "Scegli la bobina per slot",
    clearSlotOptionHint: "Rimuovere la bobina corrente da questo slot",
    clientHostUnavailable:
      "Mancano i dettagli di connessione Host per questo dispositivo client.",
    clientReadOnlyAction:
      "Questo dispositivo è connesso come client. Utilizzare host per le modifiche alla stampante.",
    clientReadOnlyBanner:
      "Questo dispositivo è collegato come client. Per il momento le modifiche all'assegnazione della stampante rimangono su host.",
    clientReadOnlyBannerPaired:
      "Questo dispositivo è connesso come client. Le modifiche all'assegnazione di Slot possono essere inviate a host, mentre la configurazione della stampante rimane lì.",
    clientReadOnlyCached:
      "Host non è disponibile. Mostra l'ultima istantanea della stampante memorizzata nella cache.",
    clientReadOnlyHost: "Host",
    clientReadOnlyOffline:
      "Host non è disponibile e non è ancora disponibile alcuna istantanea della stampante memorizzata nella cache.",
    clientReadOnlyUpdated: "Aggiornato",
    clientWriteRequiresPairing:
      "Associare questo client desktop con host prima di eseguire azioni della stampante protetta.",
    configuredPrinters: "Stampanti configurate",
    currentRoll: "Bobina attuale",
    desktopOnly:
      "La panoramica della stampante è disponibile nella build dell'app desktop.",
    emptySlot: "slot vuoto",
    error: {
      candidateAlreadyHasRfid:
        "In questa bobina di inventario è già salvata un'identità RFID.",
      candidateUnavailableForRfid:
        "Aggiorna i dati della stampante; questa bobina non è più disponibile come candidato Bambu RFID dal vivo.",
      createFromCatalogRequiresEmptySlot:
        "Cancella o scambia la bobina corrente attraverso il normale flusso slot prima di creare una nuova bobina del catalogo qui.",
      invalidUsage: "I grammi di utilizzo devono essere maggiori di zero.",
      liveRfidChangedBeforeSave:
        "L'identità live AMS è cambiata prima del salvataggio. Riapri l'azione slot e conferma la bobina corrente.",
      liveSlotUnloadedBeforeSave:
        "AMS non segnala più una bobina carica in questo slot. Aggiorna e conferma la bobina corrente prima di salvare RFID.",
      load: "Impossibile caricare la panoramica della stampante.",
      outgoingWeightRequired:
        "Immettere il peso della bobina in uscita prima di scambiare le bobine.",
      recordUsage: "Impossibile registrare l'utilizzo della stampa.",
      selectCandidateBeforeRfid:
        "Selezionare prima questa bobina nello slot, in modo che l'eventuale peso della bobina in uscita venga gestito prima di salvare RFID.",
      selectRollBeforeWeight:
        "Selezionare una bobina target prima di aggiornare il peso.",
      updateSlot: "Impossibile aggiornare la stampante slot.",
    },
    extSlot: "EST Slot",
    failed: "Falliti",
    grams: "grammi",
    hideSlots: "Nascondi slot",
    incomingWeight: "Pesata in entrata (g, opzionale)",
    incomingWeightPromptLabel: "Peso misurato (g)",
    incomingWeightPromptTitle: "Imposta il peso della bobina in entrata",
    jobOptional: "Nome del lavoro (facoltativo)",
    jobs: "Lavori",
    lastKnownLive: "Ultimo conosciuto dal vivo",
    liveCandidateCount:
      "Le bobine di inventario {count} corrispondono al segnale materiale/colore in tempo reale.",
    liveCandidateCurrent: "attuale",
    liveCandidateCurrentMatches:
      "L'assegnazione attuale corrisponde al segnale materiale/colore dal vivo.",
    liveCandidateHasRfid: "RFID salvato",
    liveCandidateMore: "Esistono più candidati nell'inventario.",
    liveCandidateSelectBeforeRfid: "seleziona prima",
    liveCandidateSingle:
      "Una bobina di inventario corrisponde al segnale materiale/colore dal vivo.",
    liveCandidateSummary:
      "{count, plural, one {Una bobina dell'inventario corrisponde al segnale live di materiale/colore.} other {# bobine dell'inventario corrispondono al segnale live di materiale/colore.}}",
    liveCandidateUnavailable: "non disponibile",
    liveCatalogCandidateCount:
      "{count} voci del catalogo Bambu sembrano corrispondere a questa bobina live.",
    liveCatalogCandidateMore:
      "Sono disponibili altri candidati al catalogo Bambu.",
    liveCatalogCandidateSingle:
      "Il catalogo Bambu ha una probabile corrispondenza. Aggiungilo qui per salvare il RFID live.",
    liveCatalogCandidateSummary:
      "{count, plural, one {Il catalogo Bambu contiene una probabile corrispondenza. Aggiungila qui per salvare l'RFID live.} other {# voci del catalogo Bambu sembrano corrispondere a questa bobina live.}}",
    liveCatalogCreatedAndAssigned:
      "{label} è stato aggiunto, RFID è stato salvato e la bobina è stata assegnata a questo slot.",
    liveCatalogRequiresEmptySlot: "cancellare prima slot",
    liveCatalogRequiresLoadedSlot: "caricare prima la bobina",
    liveCatalogRequiresRfid: "attendere RFID",
    liveConnectionConnected: "Connesso in diretta",
    liveConnectionIdle: "Live · inattiva",
    liveConnectionWaiting: "Vivere l'attesa",
    liveHumidityDry: "Asciutto",
    liveHumidityMiddle: "Metà",
    liveHumidityWet: "Bagnato",
    liveRfid: "Dal vivo RFID",
    liveRfidCandidateCount:
      "I rulli di inventario {count} assomigliano a questo rullo Bambu dal vivo.",
    liveRfidCandidateCurrentMatches:
      "L'assegnazione attuale assomiglia a questa bobina Bambu dal vivo. Salva RFID per vincolarlo in modo permanente.",
    liveRfidCandidateSelectCorrect:
      "Seleziona la bobina corretta prima di salvare RFID.",
    liveRfidCandidateSelectFirst:
      "Una bobina dell'inventario assomiglia a questa bobina Bambu dal vivo. Selezionalo prima di salvare RFID.",
    liveRfidCandidateSelectionSummary:
      "{count, plural, one {Una bobina dell'inventario sembra essere questa bobina Bambu live. Selezionala prima di salvare l'RFID.} other {# bobine dell'inventario sembrano essere questa bobina Bambu live. Seleziona la bobina corretta prima di salvare l'RFID.}}",
    liveRfidCandidateSingle:
      "Una bobina dell'inventario assomiglia a questa bobina Bambu dal vivo. Salva RFID per vincolarlo in modo permanente.",
    liveRfidCandidateSummary:
      "{count, plural, one {Una bobina dell'inventario sembra essere questa bobina Bambu live. Salva l'RFID per associarla definitivamente.} other {# bobine dell'inventario sembrano essere questa bobina Bambu live.}}",
    liveRfidRegisteredAndAssigned:
      "RFID salvato e la bobina suggerita è stata assegnata a questo slot.",
    liveTelemetryActive: "Attivo",
    liveTelemetryAmsHumidity: "AMS umidità",
    liveTelemetryAmsHumidityShort: "AMS",
    liveTelemetryBed: "Piano",
    liveTelemetryIdle: "Oziare",
    liveTelemetryNozzle: "Ugello",
    liveTelemetryPaused: "In pausa",
    liveTelemetryPreparing: "Preparazione",
    liveTelemetryPrinting: "Stampa",
    liveTelemetryState: "Stato della stampante",
    loadedSlots: "Caricato slots",
    logUse: "Registra l'utilizzo",
    manualAssignment: "Manuale",
    noAms: "Nessun AMS",
    noMmu: "Nessun MMU3",
    noMultiMaterial: "Nessun multimateriale",
    noPendingChanges: "Nessuna modifica slot in sospeso.",
    noPrinters:
      "Nessuna stampante ancora configurata. Utilizzare Aggiungi stampante per crearne una.",
    noSlots: "Questa stampante non ha slots configurato.",
    noSpoolAssigned: "Nessuna bobina assegnata.",
    outgoingWeight: "Peso in uscita (g)",
    outgoingWeightPromptTitle: "Imposta il peso della bobina in uscita",
    previewSingleMaterial: "{model} monomateriale",
    previewWithMultiMaterial: "{model} con multimateriale",
    registerLiveRfid: "Salva RFID",
    rfidOverridden: "RFID sovrascritto",
    rfidOverriddenHint:
      "Questo slot viene assegnato manualmente mentre la stessa identità RFID non registrata è ancora attiva.",
    rfidOverrideDialogHint:
      "Questo slot viene assegnato manualmente mentre AMS riporta ancora la stessa identità RFID non registrata. Salvalo sulla bobina selezionata quando sei pronto.",
    rfidOverrideNothingToSave:
      "Nessuna identità RFID non vuota è disponibile da salvare per questo slot.",
    rollResultCount: "{count, plural, one {# bobina} other {# bobine}}",
    rollResultMany: "bobine",
    rollResultOne: "bobina",
    searchAvailableRolls: "Cerca i rulli disponibili",
    searchRolls: "Cerca bobine per nome/venditore",
    showSlots: "Mostra slot",
    singleMaterialOnly: "Solo monomateriale",
    singleToolhead: "Testa utensile singola",
    slot: "Slot",
    slotCount: "{count, plural, one {# slot} other {# slot}}",
    slotCountMany: "slots",
    slotCountOne: "slot",
    slotOnboarding: "AMS onboarding",
    slotOnboardingLiveIdentityChanged:
      "L'identità live AMS è cambiata prima del salvataggio. Riapri l'azione slot e conferma la bobina corrente.",
    slotOnboardingLiveSlotUnloaded:
      "AMS non segnala più una bobina carica in questo slot. Riapri l'azione slot quando la bobina è caricata.",
    slotOnboardingNeedsBorrowedOwner:
      "Inserisci da chi è stata presa in prestito la bobina prima di registrarla come presa in prestito.",
    slotOnboardingNeedsRfid:
      "Attendi un'identità RFID non vuota dal segnale AMS live prima di aggiungere e legare questa bobina.",
    slotOnboardingOccupied:
      "A questo slot è già assegnata una bobina. Cancellalo o scambialo attraverso il normale flusso slot prima di creare una nuova bobina dal segnale AMS live.",
    slotOnboardingOccupiedBeforeSave:
      "A questo slot ora è assegnata una bobina. Cancellalo o scambialo attraverso il normale flusso slot prima di aggiungere una nuova bobina da AMS.",
    slotUpdated: "Stampante slot aggiornata.",
    subtitle:
      "Gestisci slots e l'utilizzo del materiale collegato alla stampante.",
    success: "Riusciti",
    swapNoteOptional: "Scambia nota (facoltativo)",
    targetEmpty: "Obiettivo: slot vuoto",
    targetRoll: "Bobina bersaglio",
    toolhead: "Testina",
    unknownLiveRfid: "RFID non è registrato",
    unknownLiveRfidHint:
      "AMS ha segnalato un'identità RFID/AMS non registrata nell'inventario.",
    updateWeight: "Aggiorna il peso",
    usageRecorded: "Utilizzo della stampa registrato.",
    used: "Consumo",
    waitingForLiveIdentity:
      "Mostra l'ultimo incarico slot salvato fino all'arrivo di un'identità live più forte.",
    withAms: "Con AMS",
    withMmu: "Con MMU3",
    withMultiMaterial: "Multimateriale abilitato",
    withToolheads: "Testa multiutensile",
  },
  settings: {
    "bambuDiscoveryTitle": "Trova stampante Bambu",
    "bambuDiscoveryHint": "Ascolta brevemente gli annunci locali delle stampanti Bambu. Non viene inviato alcun codice di accesso.",
    "bambuDiscoveryFind": "Trova stampanti Bambu",
    "bambuDiscoveryScanning": "Ricerca stampanti...",
    "bambuDiscoveryListeningHint": "L’operazione può richiedere fino a 10 secondi mentre la stampante si annuncia.",
    "bambuDiscoveryEmpty": "Nessuna stampante Bambu si è annunciata su questa interfaccia. Riattiva la stampante e riprova.",
    "bambuDiscoveryUseForSetup": "Usa per la configurazione",
    "bambuDiscoveryRecoverSavedAddress": "Recupera indirizzo salvato",
    "bambuDiscoveryUnsavedChangesHint": "Salva o annulla le altre modifiche prima di recuperare un indirizzo stampante salvato.",
    "bambuDiscoveryRecoveryHint": "L’indirizzo salvato può essere recuperato dopo che l’identità di questa stampante è stata considerata attendibile.",
    "bambuDiscoveryDifferentPrinter": "Questa non è la stampante salvata. Puoi usarla solo per una nuova configurazione.",
    "bambuDiscoveryRecovered": "L’indirizzo salvato della stampante live è stato recuperato.",
    "bambuDiscoveryFailed": "Non è stato possibile trovare stampanti Bambu su questa rete.",
    "bambuLiveRecoveryFailed": "Non è stato possibile recuperare l’indirizzo salvato della stampante live.",
    updates: "Aggiornamenti",
    updateCheckHint:
      "Se attivato, controlla automaticamente GitHub al massimo una volta al giorno. Il download e l’installazione restano manuali.",
    automaticUpdateChecks: "Controlla automaticamente",
    remindMeLater: "Più tardi",
    checkForUpdates: "Controlla aggiornamenti",
    checkingForUpdates: "Controllo in corso…",
    updateAvailable: "È disponibile la versione {version}.",
    updateUpToDate: "La versione {version} è l’ultima pubblicata.",
    updateDevelopmentBuild:
      "Questa build è più recente dell’ultima versione pubblicata ({version}).",
    updateCheckFailed:
      "Impossibile controllare gli aggiornamenti. Riprova più tardi.",
    updateInfoUnavailable:
      "Le informazioni sulla versione non sono disponibili al momento. Riprova più tardi.",
    updateChannelDisabled:
      "Questa build non dispone di un canale di aggiornamento pubblico. Cerca versioni più recenti nel luogo da cui hai scaricato l’app.",
    viewRelease: "Vedi versione",
    activeCleared: "Stampante attiva cancellata.",
    activePrinter: "Stampante attiva",
    activeUpdated: "Stampante attiva aggiornata.",
    addedPrinter: "Stampante aggiunta",
    addNewPrinter: "Aggiungi nuova stampante",
    addPrinter: "Aggiungi stampante",
    amsUnits: "Unità AMS",
    appearance: "Aspetto",
    auto: "Automatico (sistema)",
    autofillVisibleSwatches:
      "Compila automaticamente i campioni mancanti visibili",
    autoHint: "Auto segue la preferenza chiaro/scuro del tuo sistema.",
    backupDescription:
      "Esporta un backup JSON completo con inventario, cronologia e stampanti configurate.",
    backupExported:
      "Backup completo esportato (inventario, cronologia e stampanti).",
    backupExportGroup: "Backup ed esportazione",
    backupImported: "Backup completo importato correttamente.",
    backupImportGroup: "Importazione e convalida",
    backupTitle: "Backup",
    latestFullBackupExportOnDevice: "Ultima esportazione del backup completo su questo dispositivo",
    noFullBackupExportRecordedOnDevice: "Nessuna esportazione del backup completo è ancora registrata su questo dispositivo",
    backupValidationDone: "Convalida del backup completata.",
    backupValidationSummary: "Riepilogo della convalida del backup",
    bambuLiveAccessCode: "Codice di accesso",
    bambuLiveAmsLabel: "AMS",
    bambuLiveAmsReading:
      "AMS aggiornamento in corso. RFID e la corrispondenza dei vassoi possono sembrare temporaneamente incerti fino al termine della lettura.",
    bambuLiveAmsWeightBasis: "Base per bobina AMS",
    bambuLiveAmsWeightEstimate: "Stima AMS",
    bambuLiveBadge: "Vivere",
    bambuLiveCandidateCount: "candidati",
    bambuLiveCandidateNoRfidSaved: "Nessun RFID salvato",
    bambuLiveCandidateRfidSaved: "RFID salvato",
    bambuLiveCapturedFieldCount: "Campi acquisiti in questa sessione",
    bambuLiveCapturedGroupCaption: "Campi vivi catturati",
    bambuLiveCapturedTable: "Campi vivi catturati",
    bambuLiveCaptureLastUpdate: "Ultimo catturato",
    bambuLiveCapturePaused: "La cattura è in pausa",
    bambuLiveCapturePausedHint:
      "La sessione corrente viene bloccata finché non si avvia nuovamente l'acquisizione.",
    bambuLiveCaptureRunning: "La cattura è in esecuzione",
    bambuLiveCaptureRunningHint:
      "I burst live in arrivo vengono ora raccolti in questa sessione.",
    bambuLiveCaptureSeededFrom: "Seminato dallo stato vivo",
    bambuLiveCaptureStarted: "La cattura è iniziata",
    bambuLiveCaptureWaiting:
      "In attesa di aggiornamenti dal vivo sul campo. Avvia una stampa o lascia che la stampante riporti più dati mentre questo pannello è aperto.",
    bambuLiveCatalogCandidate: "Catalogo Bambu",
    bambuLiveCatalogCandidateCount: "voci di catalogo",
    bambuLiveCatalogLikelyMatch:
      "Singola probabile corrispondenza del catalogo Bambu in termini di materiale e colore dal vivo.",
    bambuLiveCatalogMultipleMatches:
      "Più voci del catalogo Bambu potrebbero corrispondere a questo filamento.",
    bambuLiveChangedFields: "Campi modificati",
    bambuLiveChartFieldLabel: "Campo grafico",
    bambuLiveChartHint:
      "Scegli un campo numerico per tracciare solo i valori acquisiti in questa sessione.",
    bambuLiveChartLatest: "Ultimo",
    bambuLiveChartNoFields:
      "Nessun campo numerico pronto per il grafico ancora",
    bambuLiveChartNoSamples:
      "Nessun campione numerico ancora per il campo selezionato.",
    bambuLiveChartRange: "Allineare",
    bambuLiveChartTitle: "Cattura grafico",
    bambuLiveChartWindow: "Campioni nella finestra di acquisizione",
    bambuLiveConfiguredHost: "host configurato",
    bambuLiveConfiguredSerial: "Seriale della stampante configurata",
    bambuLiveConnected: "Collegato",
    bambuLiveCopyRawPayload: "Copia il carico utile",
    bambuLiveCredentialsNote:
      "I codici di accesso vengono archiviati nel deposito sicuro delle credenziali del sistema operativo.",
    bambuLiveDiagnostics: "Diagnostica",
    bambuLiveDisabledNote:
      "Lasciare disabilitato per mantenere invariato il flusso corrente della stampante.",
    bambuLiveDisconnected: "Non connesso",
    bambuLiveExportCsv: "Esporta CSV",
    bambuLiveExternalSlotLabel: "Esterno slot",
    bambuLiveFieldCadence: "Intervallo medio visto",
    bambuLiveFieldChangeCadence: "Intervallo di modifica medio",
    bambuLiveFieldChanges: "Cambiamenti",
    bambuLiveFieldCount: "Campi di primo livello osservati",
    bambuLiveFieldPath: "Campo",
    bambuLiveFieldRecentValues: "Valori recenti",
    bambuLiveFieldResultCount: "{count, plural, one {# campo} other {# campi}}",
    bambuLiveFieldResultMany: "campi",
    bambuLiveFieldResultOne: "campo",
    bambuLiveFieldUpdated: "Visto l'ultima volta",
    bambuLiveFieldValue: "Valore",
    bambuLiveFilterAll: "Filtra: Tutto",
    bambuLiveFilterChanged: "Filtro: campi modificati",
    bambuLiveFilterFrequent: "Filtro: alta frequenza",
    bambuLiveFilterLabel: "Filtra i campi acquisiti",
    bambuLiveFilterRecent: "Filtro: Visto all'ultimo minuto",
    bambuLiveGroupAms: "AMS",
    bambuLiveGroupOther: "Altro",
    bambuLiveGroupPrint: "Stampa e stato",
    bambuLiveGroupTray: "Vassoio e patatine",
    bambuLiveHint:
      "Integrazione locale opzionale di sola lettura per osservare lo stato della stampante e di AMS.",
    bambuLiveHost: "Stampante host / IP",
    bambuLiveIdentitySignals: "Segnali di identità",
    bambuLiveInventoryLikelyMatch:
      "Singola probabile corrispondenza dell'inventario in base al materiale e al colore attivo.",
    bambuLiveInventoryMultipleMatches:
      "Più bobine di inventario potrebbero corrispondere a questo filamento.",
    bambuLiveInventoryNoMatch:
      "Nessuna corrispondenza chiara dell'inventario ancora.",
    bambuLiveInventoryNoRfidMatch:
      "L'identità RFID/AMS osservata non corrisponde a nulla nell'inventario.",
    bambuLiveInventoryRfidMatch:
      "Corrispondenza esatta dell'identità RFID/AMS con l'inventario.",
    bambuLiveLastSeen: "Visto l'ultima volta",
    bambuLiveMatchNoteConfiguredMismatch:
      "L'ultima identità RFID/AMS conosciuta non viene mappata in modo corretto al rullo attualmente configurato.",
    bambuLiveMatchNoteDuplicateIdentity:
      "Più bobine di inventario condividono questa identità RFID/AMS salvata.",
    bambuLiveMatchNoteDuplicateTrayIndex:
      "Più slots configurati condividono questo indice del vassoio.",
    bambuLiveMatchNoteExact:
      "Corrispondenza esatta dell'identità RFID/AMS con l'inventario.",
    bambuLiveMatchNoteLastKnownGood:
      "Mostra l'ultima identità RFID/AMS valida conosciuta fino all'arrivo di un aggiornamento più potente.",
    bambuLiveMatchNoteMultipleStoredMatch:
      "Più bobine memorizzate potrebbero corrispondere a questo vassoio live.",
    bambuLiveMatchNoteNoStoredMatch:
      "Nessuna bobina memorizzata chiara corrisponde a quest'ultima identità RFID/AMS conosciuta.",
    bambuLiveMatchNoteOneStoredMatch:
      "Una probabile bobina memorizzata corrisponde a quest'ultima identità RFID/AMS conosciuta.",
    bambuLiveMatchNotePresetSignal:
      "Impostazioni del filamento preimpostate: {preset}. Questo è un suggerimento su materiali/ambientazioni, non l'identità di un rullo.",
    bambuLiveMatchNoteUnknownIdentity:
      "AMS ha segnalato un'identità RFID/AMS non registrata nell'inventario.",
    bambuLiveMoreInventoryCandidates:
      "Nell'inventario sono presenti più bobine corrispondenti.",
    bambuLiveMqttConnected: "MQTT collegato",
    bambuLiveMqttExternalTrayLabel: "Vassoio esterno MQTT",
    bambuLiveMqttSecondaryExternalTrayLabel: "MQTT vassoio esterno secondario",
    bambuLiveMqttTrayLabel: "Vassoio MQTT",
    bambuLiveNoInventoryMatch: "Nessuna corrispondenza chiara nell'inventario",
    bambuLiveNoLiveStatusPoll:
      "Connesso, ma durante questo sondaggio non è arrivato lo stato MQTT in tempo reale.",
    bambuLiveNoNewStatusPoll:
      "In questo sondaggio non è arrivata alcuna nuova raffica MQTT. Mostra l'ultimo stato live noto e la diagnostica acquisita.",
    bambuLiveNozzleRange: "Gamma di ugelli",
    bambuLiveObservedDetails: "Dettagli osservati dal vivo",
    bambuLiveObservedEmpty:
      "Nessun dato in tempo reale ancora osservato. Questa sezione mostrerà successivamente i campi di stato in entrata, l'integrità della connessione e i valori AMS utili per questa stampante.",
    bambuLiveObservedRfidIdentity: "Identità RFID/AMS osservata",
    bambuLiveObservedSummary: "Riepilogo osservato",
    bambuLivePresetNozzleSuffix: "ugello da mm",
    bambuLivePresetSignal: "Impostazioni del filamento preimpostate",
    bambuLivePrinterOnline: "In linea",
    bambuLivePrinterSerial: "Seriale della stampante",
    bambuTlsCheckCurrent: "Verifica identità",
    bambuLiveAccessCodeSaved: "Codice di accesso salvato in modo sicuro",
    bambuLiveAccessCodeMissing: "Nessun codice di accesso salvato",
    bambuLiveAccessCodeSavedPlaceholder:
      "Salvato in modo sicuro — inserisci un nuovo codice per sostituirlo",
    bambuLiveAccessCodeReplacePending:
      "Il codice di accesso salvato verrà sostituito al salvataggio.",
    bambuLiveAccessCodeSavePending:
      "Il codice di accesso verrà salvato in modo sicuro al salvataggio.",
    bambuLiveAccessCodeClear: "Rimuovi il codice salvato",
    bambuLiveAccessCodeClearPending:
      "Il codice di accesso salvato verrà rimosso al salvataggio. Le connessioni in tempo reale resteranno in pausa finché non inserirai un nuovo codice.",
    bambuLiveAccessCodeKeep: "Mantieni il codice salvato",
    bambuLiveAccessCodeHostConfigured:
      "Sul computer host è salvato un codice di accesso.",
    bambuLiveAccessCodeHostMissing:
      "Sul computer host non è salvato alcun codice di accesso.",
    bambuTlsTrustTitle: "Identità della stampante",
    bambuTlsTrustTrusted: "Attendibile",
    bambuTlsTrustUnpaired: "Non ancora attendibile",
    bambuTlsTrustChanged: "Identità modificata",
    bambuTlsTrustPending: "Attendibilità in sospeso",
    bambuTlsClearPending: "Rimozione dell’attendibilità in sospeso",
    bambuTlsTrustTrustedHint:
      "Il certificato della stampante corrisponde all’identità salvata.",
    bambuTlsTrustUnpairedHint:
      "Il codice di accesso non verrà inviato finché non renderai esplicitamente attendibile questa identità della stampante.",
    bambuTlsTrustChangedHint:
      "L’identità della stampante è cambiata. La connessione è stata interrotta prima dell’invio del codice di accesso.",
    bambuTlsTrustPendingHint:
      "Questa identità della stampante diventerà attendibile al salvataggio.",
    bambuTlsClearPendingHint:
      "L’attendibilità verrà rimossa al salvataggio. Le connessioni in tempo reale resteranno bloccate finché non renderai nuovamente attendibile la stampante.",
    bambuTlsFingerprint: "Impronta digitale del certificato",
    bambuTlsFingerprintUnavailable:
      "Salva o verifica la connessione alla stampante per leggerne l’identità.",
    bambuTlsTrustCurrent: "Rendi attendibile questa identità",
    bambuTlsRetrustCurrent: "Rendi attendibile la nuova identità",
    bambuTlsForget: "Dimentica l’identità attendibile",
    bambuTlsUndoTrustChange: "Annulla la modifica dell’attendibilità",
    bambuLiveRawPayload: "Ultimi dati grezzi in tempo reale",
    bambuLiveRawPayloadCopied: "Payload live non elaborato copiato.",
    bambuLiveSecondaryExternalSlotLabel: "Secondario esterno slot",
    bambuLiveSection: "Stato Bambu in tempo reale",
    bambuLiveTitle: "Bambu Live",
    bambuLiveAddHint: "Connettiti ora per vedere lo stato della stampante, gli slot AMS, le temperature e il consumo di stampa. Puoi anche saltare questo passaggio e configurarlo in seguito.",
    bambuLiveEnable: "Attiva Bambu Live",
    bambuLiveLocalOnly: "Si connette direttamente alla stampante sulla rete locale.",
    addPrinterWithLive: "Aggiungi stampante con Live",
    bambuLiveSignalContinuous: "Telemetria continua",
    bambuLiveSignalContinuousDesc:
      "Campi che sembrano normali aggiornamenti di stato/telemetria durante il funzionamento.",
    bambuLiveSignalEventDriven: "Segnali AMS guidati da eventi",
    bambuLiveSignalEventDrivenDesc:
      "AMS legge e sincronizza i campi di stato che tendono ad apparire attorno agli eventi.",
    bambuLiveSignalStable: "Metadati AMS stabili",
    bambuLiveSignalStableDesc:
      "RFID, impostazioni del filamento, materiale e metadati del vassoio osservati da AMS.",
    bambuLiveSlotLabel: "Slot",
    bambuLiveSortChangeCount: "Ordinamento: i più cambiati",
    bambuLiveSortChangeInterval: "Ordinamento: modifica più rapida",
    bambuLiveSortLabel: "Ordina i campi acquisiti",
    bambuLiveSortLastSeen: "Ordina: visti più di recente",
    bambuLiveSortPath: "Ordina: Campo",
    bambuLiveSortSeenInterval: "Ordina: il più veloce visto",
    bambuLiveStandaloneOnly:
      "Lo stato live Bambu è configurato su host desktop.",
    bambuLiveStartCapture: "Inizia la cattura",
    bambuLiveStatus: "Stato della connessione",
    bambuLiveStopCapture: "Interrompi la cattura",
    bambuLiveSummaryAmsHumidity: "AMS umidità",
    bambuLiveSummaryAmsStatus: "Stato AMS",
    bambuLiveSummaryExternalTray: "Vassoio esterno",
    bambuLiveSummaryJobState: "Stato lavorativo",
    bambuLiveSummarySecondaryExternalTray: "Vassoio esterno secondario",
    bambuLiveSummaryTray: "Vassoio",
    bambuLiveTechnicalDetails: "Dettagli tecnici",
    bambuLiveTechnicalDetailsHint:
      "Identità grezza RFID, base del peso, preimpostazione, intervallo di temperatura e diagnostica della corrispondenza.",
    bambuLiveTrayEmptyUnknown: "Vuoto/sconosciuto",
    bambuLiveTrayLoaded: "Caricato",
    bambuLiveWaitingForStatusBurst:
      "Connesso, in attesa del prossimo burst di stato MQTT.",
    cachedReused: "Riutilizzato nella cache",
    catalogAllTypes: "Audit completo del fornitore",
    catalogRefreshClientHostOnly:
      "Gli aggiornamenti del catalogo del fornitore vengono inviati a host. Questo client mostra e modifica ancora il catalogo host condiviso.",
    catalogRefreshHelp:
      "Scegli il fornitore e aggiorna solo le famiglie di materiali che necessitano di nuovi prodotti. Una verifica completa del fornitore è più lenta e potrebbe contrassegnare prodotti mai visti come storici.",
    catalogRefreshTitle: "Aggiornamenti del catalogo dei fornitori",
    catalogResetDone: "Riparazione del catalogo effettuata",
    catalogTabClientHelp:
      "Questo client mostra il catalogo host. Le correzioni dei campioni e gli aggiornamenti del catalogo del fornitore vengono salvati su host.",
    catalogTabHelp:
      "L'app viene fornita con un catalogo di semi locali. Gli aggiornamenti dei fornitori aggiungono prodotti appena scoperti e aggiornano le famiglie di materiali selezionate.",
    clientHostBackupRequiresPairing:
      "Associa questo client a host prima di esportare un backup host completo.",
    applicationDiagnosticsTitle: "Diagnostica dell’applicazione",
    applicationDiagnosticsDescription: "Controlla lo stato del database locale e scarica un file di supporto ripulito, senza contenuti dell’inventario né credenziali.",
    diagnosticsHealthy: "Integro",
    diagnosticsNeedsAttention: "Richiede attenzione",
    diagnosticsUnavailable: "Database non disponibile",
    diagnosticsRefreshFailed: "Impossibile aggiornare la diagnostica dell’applicazione.",
    diagnosticsLastGoodVisible: "L’ultimo risultato riuscito resta visibile.",
    diagnosticsSchema: "Schema corrente / supportato",
    diagnosticsDatabaseSize: "Dimensione database",
    diagnosticsQuickCheck: "Controllo rapido",
    diagnosticsForeignKeyCheck: "Controllo chiavi esterne",
    diagnosticsJournalMode: "Modalità journal",
    diagnosticsLocalPath: "Percorso database locale",
    diagnosticsCheckOk: "Superato",
    diagnosticsCheckIssues: "Problemi rilevati",
    diagnosticsCheckUnavailable: "Non disponibile",
    diagnosticsDownloadSupport: "Scarica file di supporto ripulito",
    diagnosticsSupportDownloaded: "File di supporto ripulito scaricato.",
    diagnosticsSupportDownloadFailed: "Impossibile scaricare il file di supporto ripulito.",
    clientHostOnlyMaintenance:
      "Questo dispositivo è un client. Il backup completo viene esportato dallo host accoppiato. Le azioni di importazione, ripristino e riparazione devono comunque essere eseguite sullo host in modo che i dati della libreria rimangano in un unico posto.",
    columnsHint:
      "Scegli modello, nome e capienza multimateriale. EXT rimane disponibile automaticamente.",
    companionAuth: "Aut",
    companionBoundaries: "Desktop-primi confini",
    companionBoundariesValue:
      "L'aggiornamento del catalogo, l'importazione/esportazione/ripristino, la sostituzione di slot occupato e i flussi di amministrazione più ampi rimangono per ora nell'app desktop.",
    companionCopyLaunchLink: "Copia il collegamento di avvio",
    companionCopyShellUrl: "Copia shell URL",
    companionHelp:
      "Aprire il browser shell dello stesso computer servito dall'app desktop. Ciò rimane limitato alla panoramica dell'inventario, ai collegamenti diretti delle bobine, alla registrazione/modifica/restituzione manuale del prestito, alla panoramica della stampante, alla revisione/cronologia del prestito in uscita con restituzione diretta, ai dettagli della bobina, agli aggiornamenti specifici di stato/posizione, all'aggiornamento manuale del peso, all'assegnazione/cancellazione di base della stampante-slot e alla creazione del prestito in uscita di bobine selezionate mentre desktop rimane la fonte della verità.",
    companionMode: "Portata",
    companionOpenBrowser: "Apri nel browser",
    companionRefreshStatus: "Aggiorna stato",
    companionScope: "Ambito del browser corrente",
    companionScopeValue:
      "Panoramica dell'inventario, collegamenti diretti delle bobine, registrazione/modifica/restituzione manuale del prestito in entrata, panoramica della stampante, revisione/cronologia del prestito in uscita con restituzione diretta, dettagli della bobina, aggiornamenti specifici di stato/posizione, aggiornamento manuale del peso, assegnazione/cancellazione stampante-slot di base e creazione prestito in uscita di bobina selezionata.",
    companionShellUrl: "Shell URL",
    companionShellUrlCopied: "Companion shell URL copiato.",
    companionShellUrlHint: "Servito localmente dall'app desktop.",
    companionSourceOfTruth: "Fonte della verità",
    companionSourceOfTruthHint:
      "I flussi del browser attraversano il limite del servizio/API di proprietà di desktop invece di toccare direttamente SQLite.",
    companionSourceOfTruthValue: "Applicazione Desktop + SQLite",
    companionStatus: "Stato Companion",
    companionStatusHint:
      "L'API loopback e il browser shell sono ospitati dal processo desktop.",
    companionStatusRunning: "Corsa",
    companionStatusStopped: "Non correre",
    companionStatusUnreachable: "Non rispondere",
    companionTitle: "Browser locale companion",
    confirmBulkSwatch:
      "Compilare automaticamente i campioni per tutte le voci mancanti visibili?",
    confirmBulkSwatchAction: "Conferma il riempimento automatico",
    confirmBulkSwatchTapAgain:
      "Fai di nuovo clic su Compila automaticamente i campioni mancanti visibili per confermare.",
    confirmBulkSwatchVisible:
      "Applicare i colori suggeriti alle voci visibili {count}?",
    confirmDeletePrinter: "Elimina stampante",
    confirmDeletePrinterSuffix: "e le sue assegnazioni slot?",
    confirmDeleteTapAgain:
      "Fare di nuovo clic su Rimuovi per confermare l'eliminazione della stampante",
    confirmImportBackup:
      "Vuoi importare il backup completo adesso?\n\nCiò sostituirà l'inventario corrente, la cronologia, le stampanti configurate e i dati di manutenzione.",
    confirmRemove: "Conferma la rimozione",
    confirmResetApp:
      "Reimpostare i dati dell'app?\n\nCiò cancella l'inventario, le mappature delle stampanti, la cronologia di stampa, la lista dei desideri e i browser associati a LAN attendibili. Le voci del catalogo vengono conservate.",
    confirmResetAppAction: "Conferma il ripristino dei dati dell'app",
    confirmResetAppTapAgain:
      "Fai nuovamente clic su Ripristina dati app per confermare.",
    confirmResetCatalogs:
      "Riparare il catalogo?\n\nIl catalogo dei semi raggruppati viene ripristinato. Vengono rimosse solo le voci di catalogo non utilizzate e non seminate; i riferimenti all'inventario e alla lista dei desideri vengono conservati.",
    confirmResetCatalogsAction: "Conferma la riparazione del catalogo",
    confirmResetCatalogsTapAgain:
      "Fare nuovamente clic su Ripara catalogo per confermare.",
    created: "creato",
    current: "Attuale",
    dark: "Scuro",
    desktopOnly:
      "Le impostazioni sono disponibili solo nella build dell'app desktop.",
    detailFetches: "Recupero dei dettagli",
    discoveredMaterials: "Materiali scoperti",
    enableBambuLive: "Abilita lo stato in tempo reale",
    error: {
      addPrinter: "Impossibile aggiungere la stampante.",
      bambuLiveFieldsRequired:
        "Host, codice di accesso e seriale della stampante sono richiesti quando lo stato live Bambu è abilitato.",
      bambuLiveIdentityCheckFailed:
        "Impossibile verificare l'identità della stampante.",
      bambuLiveTrustRequired:
        "Verifica l'identità della stampante e contrassegnala come attendibile prima di abilitare lo stato Bambu in tempo reale.",
      copyBambuLiveRawPayload:
        "Impossibile copiare il payload live non elaborato.",
      copyCompanionShellUrl: "Impossibile copiare companion shell URL.",
      copyTrustedLanPairing:
        "Impossibile copiare il collegamento di accoppiamento LAN attendibile.",
      createTrustedLanPairing:
        "Impossibile creare un collegamento di accoppiamento LAN affidabile.",
      deletePrinter: "Impossibile eliminare la stampante.",
      exportBackup: "Impossibile esportare il backup completo.",
      exportInventoryCsv: "Impossibile esportare l'inventario CSV.",
      exportInventoryJson: "Impossibile esportare l'inventario JSON.",
      importBackup: "Impossibile importare il backup completo.",
      importData: "Impossibile importare il file selezionato.",
      invalidSwatchHex:
        "Valore campione non valido. Utilizza #RGB, #RRGGBB, gradient(...) o multi(...).",
      inventoryOverviewPrint:
        "Impossibile creare il PDF dell'etichetta dell'inventario.",
      librarySyncClearClientAuth:
        "Impossibile rimuovere l'abbinamento client desktop salvato.",
      librarySyncDeviceNameSave: "Impossibile salvare il nome del dispositivo.",
      librarySyncHostCheck: "Impossibile controllare lo host configurato.",
      librarySyncLinkHost:
        "Impossibile collegare questo dispositivo alla libreria host.",
      librarySyncPairHost:
        "Impossibile associare questo client desktop a host.",
      librarySyncPairingLinkRequired:
        "Incolla il collegamento di accoppiamento completo dallo host in modo che il client possa rilevare automaticamente lo host.",
      librarySyncPrinterWriteRequiresPairing:
        "Associa questo client desktop a host prima di cambiare stampante.",
      librarySyncSave:
        "Impossibile salvare le impostazioni del ruolo della libreria.",
      librarySyncSnapshot: "Impossibile recuperare l'istantanea host.",
      load: "Impossibile caricare le impostazioni.",
      loadTrustedLanCompanion:
        "Impossibile caricare lo stato companion della LAN attendibile.",
      loadTrustedLanPairedBrowsers:
        "Impossibile aggiornare i browser associati.",
      printerRequired: "Il nome e il modello della stampante sono obbligatori.",
      resetApp: "Impossibile reimpostare i dati dell'app.",
      resetCatalogs: "Impossibile riparare il catalogo.",
      revokeAllTrustedLanBrowsers:
        "Impossibile revocare i browser LAN attendibili.",
      revokeTrustedLanBrowser:
        "Impossibile revocare il browser della LAN attendibile.",
      saveSwatch:
        "Impossibile salvare il campione per il filamento selezionato.",
      saveTrustedLanConfig:
        "Impossibile salvare le impostazioni companion della LAN attendibile.",
      setActive: "Impossibile impostare la stampante attiva.",
      trustedLanNoInterface:
        "Scegli un'interfaccia privata prima di accendere il server dell'app Web.",
      updatePrinter: "Impossibile aggiornare la stampante.",
      validateBackup: "Impossibile convalidare il file di backup.",
    },
    exportFullBackup: "Esporta backup completo (JSON)",
    exportInventoryCsv: "Esporta inventario CSV",
    exportInventoryJson: "Esporta inventario JSON",
    failed: "fallito",
    filamentsPerMmu: "Filamenti secondo MMU3",
    help: "Aiuto",
    helpHint:
      "Apri il tour visivo del prodotto per visualizzare gli screenshot dei principali flussi di lavoro desktop e Companion oppure utilizza il manuale testuale per conoscere il comportamento passo dopo passo.",
    hideObservedDetails: "Nascondi i dettagli osservati",
    hideRefreshLog: "Nascondi registro di aggiornamento",
    importDataFile: "Importa file di backup/dati",
    importDetectedInventoryCsv: "Inventario CSV",
    importDetectedInventoryJson: "Inventario JSON",
    importFullBackup: "Importa il backup completo",
    importSource: "Fonte",
    inventoryCsvExported: "Inventario CSV esportato.",
    inventoryImportDone: "Importazione dell'inventario completata.",
    inventoryJsonExported: "Inventario JSON esportato.",
    inventoryOverviewBuilderSubtitle:
      "Scegli il formato carta, rivedi le pagine e salva un PDF pronto per la stampa.",
    inventoryOverviewBuilderTitle:
      "Crea un foglio di etichette per l'inventario",
    inventoryOverviewEmpty:
      "Nessuna bobina di filamento a portata di mano da includere.",
    inventoryOverviewLabelCount: "Etichette {count} · {perPage} per pagina",
    inventoryOverviewNextPage: "Pagina successiva",
    inventoryOverviewPageCount: "Pagina {page} di {pages}",
    inventoryOverviewPaperA4: "A4",
    inventoryOverviewPaperA4Hint: "210×297 mm",
    inventoryOverviewPaperFormat: "Formato cartaceo",
    inventoryOverviewPaperLetter: "US Letter",
    inventoryOverviewPaperLetterHint: "8,5 × 11 pollici · 216 × 279 mm",
    inventoryOverviewPerPage: "etichette per pagina",
    inventoryOverviewPreview: "Anteprima del foglio",
    inventoryOverviewPreviousPage: "Pagina precedente",
    inventoryOverviewPrint: "Fogli di etichette per inventario",
    inventoryOverviewPrintAction:
      "Crea un foglio di etichette per l'inventario",
    inventoryOverviewPrintDone:
      "PDF etichetta inventario salvato in Download: {path}",
    inventoryOverviewPrintHint:
      "Crea fogli di etichette QR per ogni bobina a disposizione, utilizzando lo stesso layout leggibile di 60 × 24 mm delle singole etichette.",
    inventoryOverviewPrintSave: "Salva PDF nei download",
    inventoryOverviewPrintSaving: "Salvataggio del PDF...",
    inventoryOverviewRendering: "Preparazione dei fogli di etichette...",
    inventoryOverviewSingleLabelHint:
      "Hai bisogno di una sola etichetta? Apri la bobina in Inventario e scegli Crea etichetta QR.",
    languageSelected: "Lingua selezionata: {language}.",
    language: "Lingua",
    languageHint:
      "Scegli la lingua dell'app per tutte le visualizzazioni principali.",
    libraryRoleLabel: "Ruolo della biblioteca",
    librarySyncAdvancedHint:
      "Aprilo solo quando hai bisogno di dati diagnostici o di snapshot memorizzati nella cache.",
    librarySyncAdvancedTitle: "Dettagli host avanzati",
    librarySyncBackupAutoValidated:
      "Il backup esportato è stato convalidato automaticamente ed è pronto per l'uso nel flusso guidato di modifica del ruolo.",
    librarySyncCachedSnapshot: "Istantanea host memorizzata nella cache",
    librarySyncCheckHost: "Controllare host",
    librarySyncChecking: "Controllo...",
    librarySyncClearClientAuth: "Rimuovi l'accoppiamento",
    librarySyncClient: "Cliente",
    librarySyncClientAuthCleared:
      "L'associazione del client Desktop è stata rimossa da questo dispositivo.",
    librarySyncClientAuthExpiresAt: "La sessione scade",
    librarySyncClientAuthHint:
      "Incolla un collegamento di accoppiamento di breve durata dallo host per sbloccare le azioni di sincronizzazione desktop protette.",
    librarySyncClientAuthInput: "Collegamento di accoppiamento",
    librarySyncClientAuthNeedsRepair: "È necessaria una nuova associazione",
    librarySyncClientAuthPaired: "Accoppiato",
    librarySyncClientAuthPairedAt: "Accoppiato",
    librarySyncClientAuthPersistentHint:
      "Questo client rimane associato finché non rimuovi l'associazione qui o su host.",
    librarySyncClientAuthRepairHint:
      "Se questo client desktop usa ancora un indirizzo IP numerico, rimuovi la vecchia associazione e associalo di nuovo usando un nuovo link fornito dall'host.",
    librarySyncClientAuthTitle: "Associazione client Desktop",
    librarySyncClientAuthUnpaired: "Non accoppiato",
    librarySyncClientHint:
      "Questo dispositivo si connette a un altro host e mantiene una cache di fallback di sola lettura quando host non è disponibile.",
    librarySyncClientPaired:
      "Client Desktop abbinato a host. Ora è possibile abilitare le azioni di sincronizzazione protette.",
    librarySyncClientPairingFlowHint:
      "Inizia con un collegamento di accoppiamento di breve durata da host. Il client utilizza quel collegamento per rilevare, verificare e connettersi automaticamente allo host corretto.",
    librarySyncConfirmAgain: "Fare nuovamente clic per confermare",
    librarySyncConfirmArmedHint:
      "Un altro clic conferma questo cambio di ruolo.",
    librarySyncConfirmSwitchToClient: "Passa al cliente",
    librarySyncConfirmSwitchToHost: "Passa a Host",
    librarySyncConfirmSwitchToStandalone: "Passa alla modalità autonoma",
    librarySyncConnectHint:
      "Immettere prima l'indirizzo host. Quindi controllalo prima di collegare questo dispositivo.",
    librarySyncConnectTitle: "Connettersi a host",
    librarySyncCurrentHost: "host attuale",
    librarySyncDeviceName: "Nome del dispositivo",
    librarySyncDeviceNamePlaceholder: "PC dell'officina",
    librarySyncDeviceNameSaved: "Nome del dispositivo salvato.",
    librarySyncDeviceNameSavedStatus: "Salvato",
    librarySyncDeviceNameUnsaved: "Modifiche non salvate",
    librarySyncFetchSnapshot: "Recupera l'istantanea",
    librarySyncHideAdvanced: "Nascondi dettagli",
    librarySyncHint:
      "Scegli se questo dispositivo rimane solo locale, ospita la libreria condivisa o si connette a un altro host.",
    librarySyncHost: "Host",
    librarySyncHostCheckOk: "Controllo Host superato.",
    librarySyncHostCheckPairingInvalid:
      "Host è raggiungibile, ma l'associazione del client desktop deve essere aggiornata.",
    librarySyncHostHint:
      "Questo dispositivo è pronto per host libreria per altri desktop o client browser.",
    librarySyncHostUrl: "Host URL",
    librarySyncImportedOnClientHint:
      "Questo dispositivo è ora preparato come il prossimo host. Esamina i ruoli della Biblioteca e salva quando sei pronto per subentrare.",
    librarySyncLastChecked: "Ultimo controllo",
    librarySyncLastReachable: "Ultimo raggiungibile",
    librarySyncLastStatus: "Ultimo stato host",
    librarySyncLibraryId: "Identificativo della biblioteca",
    librarySyncLinkedHost:
      "Questo dispositivo è ora collegato alla libreria host selezionata.",
    librarySyncLinkHost: "Collega questo dispositivo allo host selezionato",
    librarySyncMigrationStepExport:
      "Esporta un backup completo dall'attuale host",
    librarySyncMigrationStepExportHint:
      "Utilizza il pulsante di esportazione qui sotto prima di importare sul computer successivo.",
    librarySyncMigrationStepImport:
      "Importa il backup completo su questo dispositivo",
    librarySyncMigrationStepImportHint:
      "Importa qui il backup host prima che questo dispositivo prenda il sopravvento.",
    librarySyncNoSnapshotHint:
      "Recupera uno snapshot host per mantenere disponibile una piccola visualizzazione di sola lettura qui.",
    librarySyncNoSnapshotYet: "Nessuno snapshot ancora memorizzato nella cache",
    librarySyncOpenMaintenance: "Strumenti di manutenzione aperti",
    librarySyncPairHost: "Associa il client desktop",
    librarySyncPairingInvalid:
      "Collegamento di accoppiamento non valido. Crea un nuovo collegamento di accoppiamento su host e riprova.",
    librarySyncRefreshingSnapshot: "Aggiornamento dell'istantanea in corso...",
    librarySyncRemoteAuth: "Modalità di autenticazione",
    librarySyncRemoteDevice: "Dispositivo remoto",
    librarySyncRemoteLibraryId: "ID della libreria remota",
    librarySyncRemoteMode: "Ruolo remoto",
    librarySyncRenewPairing: "Rinnova l'accoppiamento",
    librarySyncRenewPairingInfo:
      "L'abbinamento salvato è stato cancellato. Incolla un nuovo collegamento di accoppiamento da host per continuare.",
    librarySyncRoleChangeAutoValidatedHint:
      "L'ultimo backup esportato è stato convalidato automaticamente in questo flusso guidato.",
    librarySyncRoleChangeClientHint:
      "La modalità client prevede una connessione host. Dopo il passaggio, utilizzare l'accoppiamento client Desktop per connettere questo dispositivo allo host che si desidera utilizzare.",
    librarySyncRoleChangeClientLocalHint:
      "Questo client normalmente si aspetta una libreria host. È possibile esportare un backup completo sull'attuale host e importarlo successivamente in Manutenzione programma se si desidera continuare localmente.",
    librarySyncRoleChangeClientToHostHint:
      "Questo client diventa il proprio host dopo il passaggio. Se in seguito si desidera spostare i dati della libreria dall'attuale host, creare lì un backup completo e importarlo successivamente in Manutenzione programma su questo dispositivo.",
    librarySyncRoleChangeValidateImportHint:
      "Convalida lo stesso backup qui. Tale backup può essere importato successivamente in Manutenzione del programma sul dispositivo che dovrebbe continuare con la libreria.",
    librarySyncSave: "Salva ruolo libreria",
    librarySyncSaved: "Impostazioni del ruolo della libreria salvate.",
    librarySyncSaveDeviceName: "Salva il nome del dispositivo",
    librarySyncSaveHint:
      "I cambiamenti di ruolo aprono un flusso guidato. Niente viene salvato finché non confermi.",
    librarySyncSaving: "Risparmio...",
    librarySyncShowAdvanced: "Mostra dettagli",
    librarySyncSnapshotAssigned: "Assegnato",
    librarySyncSnapshotCapturedAt: "Catturato",
    librarySyncSnapshotInUse: "In uso",
    librarySyncSnapshotLoans: "Prestiti attivi",
    librarySyncSnapshotLowStock: "Scorte basse",
    librarySyncSnapshotPrinters: "Stampanti",
    librarySyncSnapshotRefreshed: "Istantanea Host aggiornata.",
    librarySyncSnapshotTotalSpools: "Bobine totali",
    librarySyncStandalone: "Autonomo",
    librarySyncStandaloneHint:
      "Questo dispositivo continua a utilizzare solo la propria libreria locale.",
    librarySyncStandaloneWebappHint:
      "Questo dispositivo mantiene la propria libreria locale e fornisce anche l'app Web da qui.",
    librarySyncStatusCached: "Memorizzato nella cache",
    librarySyncStatusLive: "Vivere",
    librarySyncStatusOffline: "Non in linea",
    librarySyncStepDone: "Fatto",
    librarySyncStepPending: "In attesa di",
    librarySyncTitle: "Ruoli della biblioteca",
    librarySyncUseCheckedHost: "Usa questo host selezionato",
    libraryTabHint: "",
    libraryTabTitle: "Libreria e app web",
    libraryWebappLabel: "Applicazione Web",
    libraryWebappRunning: "Corsa",
    libraryWebappRunsOnHost: "Funziona su host",
    libraryWebappToggle: "Abilita l'app Web",
    license: "Licenza",
    licenseHelp:
      "Filament Manager è open source. Le versioni distribuite modificate e le versioni modificate utilizzate su una rete devono rendere disponibile la fonte corrispondente con la stessa licenza.",
    light: "Chiaro",
    maintenance: "Manutenzione",
    missingSwatches: "Campioni mancanti",
    mmuUnits: "Unità MMU3",
    multiUnits: "Unità multimateriali",
    noActivePrinter: "Nessuna stampante attiva",
    noBackupValidationYet:
      "Convalida un file di backup qui per visualizzare i dettagli di compatibilità prima dell'importazione.",
    noMissingSwatches: "Nessun campione mancante da riempire.",
    printerDiscardChanges: "Annulla modifiche",
    printerDiscardHint:
      "Le modifiche andranno perse e la stampante manterrà la configurazione corrente.",
    printerDiscardTitle: "Eliminare le modifiche alla stampante non salvate?",
    printerKeepEditing: "Continua a modificare",
    printerModel: "Modello della stampante",
    printerName: "Nome della stampante",
    printerNoChanges: "Nessuna modifica da salvare",
    printerUnsavedChanges: "Modifiche non salvate",
    productTour: "Visita del prodotto",
    program: "Programma",
    reactivated: "riattivato",
    reconfigure: "Riconfigurare",
    refreshCurrentVendor: "Aggiorna il catalogo del fornitore corrente",
    refreshSelectedMaterials: "Aggiorna i materiali selezionati",
    remaining: "rimanente",
    removed: "RIMOSSO",
    removedPrinter: "Stampante rimossa",
    resetApp: "Reimposta i dati dell'app",
    resetAppList1:
      "Cancella le bobine di inventario e la cronologia del ciclo di vita delle bobine.",
    resetAppList2:
      "Cancella le mappature della stampante, le statistiche di stampa, la lista dei desideri e le sessioni del browser associate a LAN attendibili.",
    resetAppList3:
      "Mantiene le voci del catalogo principale e i dati dei campioni.",
    resetCatalogs: "Catalogo delle riparazioni",
    resetCatalogsHint:
      "Ripristina il catalogo dei filamenti in bundle, conserva le voci storiche dei fornitori e rimuove solo le righe del catalogo senza seed inutilizzate.",
    resetCatalogsList1:
      "Mantiene il catalogo dei semi in bundle e le voci collegate all'inventario o alla lista dei desideri.",
    resetCatalogsList2:
      "Rimuove solo le voci di catalogo senza seed inutilizzate.",
    resetCatalogsList3:
      "Reimporta le voci seed mancanti e ripara i metadati del catalogo.",
    resetDone: "Reimpostazione dei dati dell'app completata.",
    resetHint:
      "Il ripristino dell'app cancella l'inventario, la cronologia delle statistiche, le assegnazioni delle stampanti, la lista dei desideri e i browser associati a LAN attendibili.",
    resetSectionTitle: "Riparazione e pulizia",
    runFullVendorAudit: "Esegui un audit completo del fornitore",
    saveReconfigure: "Salva modifiche",
    selectPrinterModel: "Seleziona il modello della stampante",
    showObservedDetails: "Mostra i dettagli osservati e acquisisci",
    skipped: "saltato",
    slotsPerAms: "Slots per AMS",
    slotsPerUnit: "Slots per unità multimateriale",
    sourceCode: "Codice sorgente",
    subtitle:
      "Gestisci l'accesso al browser, le stampanti, gli aggiornamenti del catalogo e la manutenzione.",
    swatchBulkDone: "Aggiornamento collettivo di Swatch completato",
    swatchBulkNoneUpdated:
      "Nessun campione mancante visibile può essere compilato automaticamente.",
    swatchColorPicker: "Raccoglitore",
    swatchEditedUnsaved: "Modificato · non salvato",
    swatchInvalid: "Valore non valido",
    swatchInvalidHint: "Utilizza #RGB, #RRGGBB, gradient(...) o multi(...).",
    swatchQuality: "Qualità del campione",
    swatchQualityHelp:
      "Controlla qui i campioni mancanti, quindi salva le correzioni manuali o compila l'elenco visibile in blocco.",
    swatchSaved: "Campione salvato",
    swatchSuggestedUnsaved: "Consigliato · non salvato",
    swatchValue: "Valore del campione",
    swatchVendorFilter: "Filtra per fornitore",
    tabCatalog: "Catalogo filamenti",
    tabCompanion: "Accesso al browser",
    tabGeneral: "Generale",
    tabLibrary: "Biblioteca e app web",
    tabMaintenance: "Manutenzione del programma",
    tabPrinters: "Stampanti 3D",
    tabSwatch: "Qualità del campione",
    themeSetTo: "Modalità tema impostata su",
    toolheadGroups: "Gruppi di teste portautensili",
    toolheads: "Teste portautensili",
    totalCatalog: "Catalogare",
    trustedLanActive: "Attivo",
    trustedLanAllBrowsersRevoked:
      "Tutti i browser LAN attendibili sono stati revocati.",
    trustedLanAuth: "Aut",
    trustedLanAuthHint:
      "Associazione per browser con cookie, rinnovo e controlli CSRF.",
    trustedLanAuthorized: "Autorizzato",
    trustedLanAuthPairing: "Associazione per browser",
    trustedLanBindBody:
      "Si lega a un'interfaccia privata esplicita. Mai 0.0.0.0.",
    trustedLanBindTitle: "Solo legato all'interfaccia",
    trustedLanBrowserPairedDetected: "Nuovo browser associato connesso.",
    trustedLanBrowserRevoked: "Trusted-LAN browser revocato.",
    trustedLanBrowsersBody:
      "Revoca un browser per interrompere i rinnovi e chiudere le sessioni correnti.",
    trustedLanBrowsersEmpty:
      "Nessun browser LAN attendibile è stato ancora associato.",
    trustedLanBrowsersTitle: "Browser accoppiati",
    trustedLanBrowserWaiting: "In attesa del primo rinnovo",
    trustedLanCancelRevokeAction: "Annulla",
    trustedLanCancelRevokeAllAria:
      "Annulla la revoca dell'accesso per tutti i browser autorizzati",
    trustedLanCancelRevokeBrowserAria:
      "Annulla la revoca dell'accesso al browser per {name}",
    trustedLanCloseNetworkEditor: "Chiudi editore",
    trustedLanCompactNetworkHint:
      "L'app Web viene eseguita su un'interfaccia LAN privata selezionata. Apri i dettagli della rete solo quando ne hai bisogno.",
    trustedLanConfigBody:
      "Scegli l'interfaccia privata e la porta che l'app Web dovrà utilizzare.",
    trustedLanConfigSaved: "Trusted-LAN companion impostazioni salvate.",
    trustedLanConfigTitle: "Rete",
    trustedLanConfirmRevokeAction: "Conferma revoca",
    trustedLanConfirmRevokeAll:
      "Revoca l'accesso per tutti i browser autorizzati ({count})? Le loro sessioni correnti verranno chiuse e ogni browser dovrà essere nuovamente associato.",
    trustedLanConfirmRevokeAllAction: "Conferma revoca tutto",
    trustedLanConfirmRevokeAllAria:
      "Conferma la revoca dell'accesso per tutti i browser autorizzati",
    trustedLanConfirmRevokeBrowser:
      "Revocare l'accesso per {name}? Le sue sessioni correnti verranno chiuse e il browser dovrà essere nuovamente associato.",
    trustedLanConfirmRevokeBrowserAria:
      "Conferma la revoca dell'accesso al browser per {name}",
    trustedLanCopyPairing: "Copia il collegamento di accoppiamento",
    trustedLanCreateAnotherPairing: "Crea un altro collegamento",
    trustedLanCreatePairing: "Crea collegamento di accoppiamento",
    trustedLanDisabledInfo: "Il server dell'app Web è disattivato.",
    trustedLanEditNetwork: "Modifica rete",
    trustedLanEnabledInfo: "Server dell'app Web attivato.",
    trustedLanEnabledPendingInfo:
      "Il server dell'app Web è in fase di avvio. Aggiorna lo stato se richiede un momento.",
    trustedLanEnableLabel:
      "Abilita l'accesso al browser LAN attendibile sull'interfaccia selezionata",
    trustedLanHelp:
      "Attiva l'accesso al browser su un'interfaccia LAN privata. L'app desktop mantiene il controllo.",
    trustedLanHideNetwork: "Nascondi rete",
    trustedLanHideNetworkDetails: "Nascondi i dettagli della rete",
    trustedLanHideNetworkSummary: "Nascondi rete",
    trustedLanHideRevoked: "Nascondi {count} revocato",
    trustedLanInterface: "Interfaccia selezionata",
    trustedLanInterfaceHintDisabled:
      "Nessuna interfaccia LAN è esposta mentre la modalità LAN attendibile è disabilitata.",
    trustedLanInterfaceHintEnabled:
      "Si associa a una sola interfaccia privata.",
    trustedLanInterfaceNotSelected: "Non selezionato",
    trustedLanInterfaceSelect: "Interfaccia privata",
    trustedLanLastSeen: "Visto l'ultima volta",
    trustedLanLatestPairing: "Ultimo collegamento di accoppiamento",
    trustedLanNetworkDetails: "Dettagli della rete",
    trustedLanNetworkInterface: "Interfaccia di rete (IP)",
    trustedLanNetworkSaved: "Impostazioni di rete dell'app Web salvate.",
    trustedLanNoActiveBrowsers: "Nessun browser autorizzato al momento.",
    trustedLanNoInterfaces: "Nessuna interfaccia IPv4 privata rilevata",
    trustedLanOrigin: "Origine",
    trustedLanPairedAt: "Accoppiato",
    trustedLanPairingBody:
      "Crea un collegamento di breve durata o QR per un browser alla volta.",
    trustedLanPairingCopied:
      "Collegamento di accoppiamento Trusted-LAN copiato.",
    trustedLanPairingCreated:
      "Collegamento di accoppiamento Trusted-LAN creato e copiato.",
    trustedLanPairingEmpty:
      "Crea un collegamento di abbinamento per mostrarlo qui.",
    trustedLanPairingEmptyState:
      "Crea un collegamento di accoppiamento quando desideri aprire l'app Web su un altro dispositivo.",
    trustedLanPairingExpiresAt: "Scade alle",
    trustedLanPairingLabelEmpty: "Nessuna etichetta",
    trustedLanPairingLabelHint:
      "Opzionale. Ciò aiuta l'elenco dei browser associati a rimanere leggibile in seguito.",
    trustedLanPairingLabelInput: "Nome del browser",
    trustedLanPairingLabelMeta: "Navigatore",
    trustedLanPairingLabelPlaceholder:
      "iPad Safari, telefono in cucina, MacBook in officina...",
    trustedLanPairingNoteBody:
      "Accesso solo tramite browser. Nessun percorso di importazione del dispositivo.",
    trustedLanPairingNoteTitle: "Solo autenticazione del browser umano",
    trustedLanPairingQrAlt: "Trusted-LAN abbinamento QR",
    trustedLanPairingQrHint:
      "Crea un collegamento di abbinamento per generare un'anteprima QR.",
    trustedLanPairingQrLoading: "Creazione dell'anteprima di QR...",
    trustedLanPairingQrScanBody:
      "Esegui la scansione con il browser che desideri associare. Il collegamento rimane di breve durata e monouso.",
    trustedLanPairingQrScanTitle:
      "Esegui la scansione dal browser che desideri associare",
    trustedLanPairingQrTitle: "Associazione QR",
    trustedLanPairingQrUnavailable:
      "L'anteprima QR non è disponibile in questa build. Il collegamento di accoppiamento funziona ancora.",
    trustedLanPairingReady: "Collegamento di accoppiamento pronto",
    trustedLanPairingTitle: "Associazione dell'accesso al browser",
    trustedLanPort: "Porta",
    trustedLanPortHint:
      "Mantieni la porta stabile in modo che i collegamenti di accoppiamento rimangano prevedibili.",
    trustedLanPortInput: "Porta dell'ascoltatore",
    trustedLanQuickToggleDisabledHint:
      "Non è ancora disponibile alcuna interfaccia LAN privata.",
    trustedLanQuickToggleHint:
      "Funziona solo sull'interfaccia privata selezionata.",
    trustedLanRecentlyActive: "Attivo di recente",
    trustedLanRefreshStatus: "Aggiorna stato",
    trustedLanRevoke: "Revocare",
    trustedLanRevokeAll: "Revocare tutto",
    trustedLanRevokeAllAria:
      "Revoca l'accesso per tutti i browser autorizzati {count}",
    trustedLanRevokeAllWithCount: "Revoca tutto ({count})",
    trustedLanRevokeBrowserAria: "Revoca l'accesso al browser per {name}",
    trustedLanRevoked: "Revocato",
    trustedLanRevokedHistory: "Storia revocata",
    trustedLanRevokedHistoryBody:
      "Tienilo nascosto a meno che non sia necessario controllare l'accesso ai browser meno recenti.",
    trustedLanSave: "Salva rete",
    trustedLanServerControl: "Controllo del server",
    trustedLanServerTitle: "Server dell'applicazione Web",
    trustedLanShellUrl: "LANURL",
    trustedLanStableAddress: "Indirizzo locale stabile",
    trustedLanDirectAddress: "Indirizzo diretto attuale",
    trustedLanStableAddressUnavailable:
      "Non disponibile finché il nome locale stabile non è attivo",
    trustedLanDirectAddressHint:
      "Indirizzo di diagnostica per l'IP attualmente selezionato. Può cambiare se la rete non riserva un indirizzo per questo computer.",
    trustedLanLocalNameUnavailable: "Indirizzo locale stabile non disponibile",
    trustedLanLocalNameUnavailableHint:
      "L'app web è in esecuzione sull'IP attuale, ma l'associazione e i link QR permanenti restano disattivati finché l'indirizzo locale stabile non è disponibile.",
    trustedLanShowNetwork: "Mostra rete",
    trustedLanShowRevoked: "Mostra {count} revocato",
    trustedLanStartingInfo: "Avvio del server dell'app Web...",
    trustedLanStateChecking: "Controllo",
    trustedLanStateLive: "Vivere",
    trustedLanStateNeedsAttention: "Controllo",
    trustedLanStateOff: "Spento",
    trustedLanStatus: "Stato Trusted-LAN",
    trustedLanStatusDisabled: "Disabilitato per impostazione predefinita",
    trustedLanStatusHintDisabled:
      "L'app Web rimane disattivata finché non la attivi qui.",
    trustedLanStatusHintEnabled:
      "Il server è abilitato e rimane legato a un'interfaccia privata selezionata.",
    trustedLanStatusHintRunning:
      "Il server dell'app Web è attivo sull'interfaccia privata selezionata.",
    trustedLanStatusStarting: "Di partenza...",
    trustedLanTitle: "Trusted-LAN accesso al browser",
    trustedLanToggleBusy: "Risparmio...",
    trustedLanToggleOff: "Spegnere",
    trustedLanToggleOn: "Accendi",
    trustedLanUnnamedBrowser: "Browser accoppiato",
    trustedLanUrlHintDisabled:
      "Nessuna LAN URL viene esposta mentre la modalità LAN attendibile rimane disabilitata.",
    trustedLanUrlHintEnabled:
      "Utilizza esattamente questo URL per l'accoppiamento sulla tua rete affidabile.",
    trustedLanUrlUnavailable:
      "Non disponibile finché non viene abilitata la modalità LAN attendibile",
    trustedLanWarningBody:
      "Usalo solo su una rete di cui ti fidi. L'accoppiamento protegge l'accesso, ma chiunque su quella rete può comunque leggere il traffico.",
    trustedLanWarningTitle: "Il traffico Trusted-LAN non è crittografato",
    trustedLanWebappPort: "Porta dell'app Web",
    updated: "aggiornato",
    updatedPrinter: "Stampante aggiornata",
    updatingSwatches: "Aggiornamento dei campioni...",
    userManual: "Manuale utente",
    validateBackup: "Convalida il file di backup",
    validationExtraTables: "Tavoli aggiuntivi",
    validationFormat: "Formato",
    validationMissingTables: "Tabelle mancanti",
    validationRows: "Righe",
    validationStatusOk: "Pienamente compatibile",
    validationStatusWarn: "Ha avvisi",
    validationTables: "Tabelle",
    vendors: "Venditori",
    version: "Versione",
    viewLicense: "Visualizza licenza",
    viewNotices: "Avvisi",
    visibleMissing: "Visibile mancante",
  },
  statistics: {
    acrossPrinters: "Su tutte le stampanti",
    activeAms: "Slot attivi caricati",
    activeSlotsDetailTitle: "Slot attivi caricati",
    allTime: "Tutto il tempo",
    assignedSlots: "Slots con bobine assegnate",
    borrowedInInUse: "Ricevute da altri assegnate",
    borrowedInLowStock: "Ricevute da altri con scorte basse",
    borrowedInOnHand: "Ricevute da altri disponibili",
    borrowedInPrintUsage30d: "Consumo di stampa registrato · ricevute da altri",
    borrowedInShort: "Entrata",
    borrowerBreakdownHint: "Totali del prestito sui rulli attivi e completati.",
    borrowerUsage: "Utilizzo del prestito per persona",
    borrowerUsageByFilament: "Utilizzo del prestito per filamento",
    borrowerUsageHint:
      "Apri un mutuatario per vedere quali filamenti costituiscono il loro utilizzo in prestito.",
    clientHostBreakdownOnly:
      "La ripartizione dettagliata del filamento è attualmente disponibile sul dispositivo host.",
    clientReadOnlyCached:
      "Host non è disponibile. Mostra l'ultima istantanea delle statistiche memorizzate nella cache.",
    clientReadOnlyOffline:
      "Host non è disponibile e non è ancora disponibile alcuno snapshot delle statistiche memorizzate nella cache.",
    clientReadOnlyUpdated: "Aggiornato",
    completed: "Completato",
    consumptionByFilament: "Consumo per filamento",
    currentSnapshot: "Istantanea corrente",
    desktopOnly:
      "Le statistiche sono disponibili nella build dell'app desktop.",
    error: {
      load: "Impossibile caricare le statistiche.",
      loadBorrowerBreakdown:
        "Impossibile caricare la ripartizione del mutuatario.",
      loadFilamentBreakdown: "Impossibile caricare la rottura del filamento.",
      loadInboundBreakdown:
        "Impossibile caricare la suddivisione del proprietario.",
    },
    failedJobs: "Lavori non riusciti",
    failedJobsDetailTitle: "Lavori non riusciti per stampante",
    failureRate: "Tasso di fallimento",
    filteredResultCount:
      "{visible} / {total, plural, one {# risultato} other {# risultati}}",
    filterMaterial: "Materiale",
    filterVendor: "Venditore",
    inboundBreakdownHint:
      "Totali presi in prestito sui rulli attivi e completati.",
    inboundUsage: "Utilizzo preso in prestito dal proprietario",
    inboundUsageByFilament: "Utilizzo preso in prestito dal filamento",
    inboundUsageHint:
      "Apri un proprietario per vedere quali filamenti presi in prestito costituiscono il loro utilizzo.",
    lentOutShort: "Uscita",
    linkedActivity: "Attività collegata alla stampante",
    loadingBorrowerBreakdown: "Caricamento dettaglio mutuatario...",
    loadingFilamentBreakdown: "Caricamento della rottura del filamento...",
    loadingInboundBreakdown: "Caricamento dettaglio proprietario...",
    loadingInboundUsage: "Caricamento utilizzo preso in prestito...",
    loadingLoan: "Caricamento utilizzo del prestito...",
    loadingPrinter: "Caricamento utilizzo stampante...",
    loansShort: "Prestiti",
    loggedJobs: "Lavori registrati",
    loggedJobsDetailTitle: "Lavori registrati per stampante",
    noActiveSlotFilterMatch:
      "Nessuno slot caricato corrisponde al filtro di proprietà corrente.",
    noActiveSlotsBreakdown: "Nessuno slot caricato al momento.",
    noBorrowedInActivity:
      "Nessuna azione presa in prestito da altri o utilizzo registrato",
    noBorrowerBreakdown: "Nessun utilizzo del mutuatario ancora registrato.",
    noBorrowerFilterMatch: "Nessuna riga corrisponde ai filtri attuali.",
    noFailedJobsBreakdown: "Nessun lavoro non riuscito registrato.",
    noFilamentBreakdown:
      "Nessun consumo di filamento è stato ancora registrato.",
    noFilamentFilterMatch: "Nessuna riga corrisponde ai filtri attuali.",
    noInboundBreakdown:
      "Nessun utilizzo preso in prestito dal proprietario ancora registrato.",
    noInboundUsage: "Nessun utilizzo preso in prestito ancora registrato.",
    noLoanUsage: "Nessun utilizzo del prestito ancora registrato.",
    noLoggedJobsBreakdown: "Nessun lavoro ancora registrato.",
    noPrinterActivity: "Nessuna attività della stampante ancora disponibile.",
    ownedInUse: "Proprie assegnate",
    ownedLowStock: "Proprie con scorte basse",
    ownedOnHand: "Proprie disponibili",
    ownedPrintUsage30d: "Consumo di stampa registrato · proprie",
    ownershipSnapshot: "Istantanea della proprietà",
    ownershipSnapshotHint:
      "Ripartizione per proprietà delle scorte disponibili e del consumo di stampa registrato. Le schede principali sopra mostrano ancora i totali combinati.",
    perPrinter: "Consumo per stampante",
    perPrinterHint:
      "Apri una stampante per vedere il consumo di filamenti raggruppato per materiale.",
    printerCount: "{count, plural, one {# stampante} other {# stampanti}}",
    printerCountMany: "stampanti",
    printerCountOne: "stampante",
    resetFilters: "Reimposta i filtri",
    resultCount: "{count, plural, one {# risultato} other {# risultati}}",
    resultCountMany: "risultati",
    resultCountOne: "risultato",
    searchBorrowerFilamentPlaceholder: "Cerca filamento, colore o fornitore",
    searchFilamentPlaceholder:
      "Cerca filamento, colore, fornitore o proprietario",
    sortJobsDesc: "Più lavori",
    sortNameAsc: "Nome (A-Z)",
    sortUsedAsc: "Meno usato",
    sortUsedDesc: "Il più utilizzato",
    subtitle:
      "Visualizza l'attività della stampante, l'utilizzo dei materiali e il consumo del prestito in un'unica panoramica.",
    totalConsumption: "Consumo totale",
    viewDetails: "Visualizza i dettagli",
  },
  vendor: {
    bambu: "Bambu",
    esun: "eSUN",
    generic: "Generico",
  },
  wishlist: {
    addMissingFilamentManual: "Manca il filamento? Aggiungilo manualmente",
    catalog: "catalogare",
    colorName: "Nome del colore",
    confirmRemoveAction: "Conferma la rimozione",
    confirmRemoveHint:
      "Ciò rimuove la voce della coda. Le bobine di inventario esistenti non sono interessate.",
    confirmRemoveTapAgain:
      "Fai di nuovo clic su Rimuovi per confermare l'eliminazione di questa voce della lista dei desideri.",
    confirmRemoveTitle: "Rimuovere {name} dalla coda di acquisto?",
    elapsed: "Trascorso",
    empty: "Nessun articolo nella lista dei desideri ancora.",
    error: {
      add: "Impossibile aggiungere l'elemento alla lista dei desideri.",
      delete: "Impossibile eliminare l'elemento dalla lista dei desideri.",
      invalidSelection:
        "Scegli una configurazione di filamento valida prima di aggiungerla alla lista dei desideri.",
      loadCatalog: "Impossibile caricare il catalogo principale.",
      refreshBambu: "Aggiornamento del catalogo non riuscito.",
      refreshEsun: "Aggiornamento del catalogo eSUN non riuscito.",
      updateStatus: "Impossibile aggiornare lo stato della lista dei desideri.",
      zeroBambu:
        "Aggiornamento completato con 0 righe importate. Il negozio potrebbe avere una tariffa limitata o modificata.",
      zeroEsun:
        "Aggiornamento eSUN completato con 0 righe importate. Il formato del negozio potrebbe essere cambiato.",
    },
    filamentName: "Nome del filamento",
    hexOptional: "Colore campione (facoltativo)",
    itemStatusGroup: "Stato per {name}",
    loading: "Caricamento lista dei desideri...",
    materialPlaceholder: "Materiale (ad esempio PLA)",
    noneFiltered: "Nessun elemento corrisponde al filtro di stato selezionato.",
    noRefreshOutput: "Nessun output di aggiornamento ancora disponibile.",
    noSearchResults:
      "Nessun elemento della lista dei desideri corrisponde a questa ricerca.",
    phase: "Fase",
    qty: "Qtà",
    refreshing: "Rinfrescante",
    refreshLog: "aggiornare il registro",
    refreshPreparing: "Preparazione aggiornamento catalogo...",
    refreshPreparingBambu:
      "Preparazione dell'aggiornamento del catalogo Bambu in corso...",
    refreshPreparingEsun:
      "Preparazione aggiornamento catalogo eSUN in corso...",
    resultCount: "{count, plural, one {# elemento} other {# elementi}}",
    resultCountMany: "elementi",
    resultCountOne: "articolo",
    searchBambu: "Cerca il codice materiale/colore o filamento Bambu",
    searchEsun: "Cerca materiale/colore eSUN",
    searchQueueLabel: "Cerca coda di acquisto",
    searchQueuePlaceholder: "Cerca per nome, colore o fornitore",
    statusFilter: "Filtro sullo stato della lista dei desideri",
    statusOnOrder: "Ordinato",
    statusReceived: "Ricevuto",
    statusWishlist: "Lista dei desideri",
    vendor: "Venditore",
    vendorPlaceholder: "Fornitore (ad esempio generico, eSUN)",
    viewRefreshLog: "Visualizza il registro degli aggiornamenti",
  },
};

export default itITDictionary;
