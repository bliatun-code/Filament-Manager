import type { DictionaryNode } from "../../i18n_types";

export const esDictionary: DictionaryNode = {
  app: {
    title: "Filament Manager",
    iconAlt: "Icono de Filament Manager",
    loadingPage: "Cargando página...",
    navigation: "Navegación",
    skipToMainContent: "Ir al contenido principal",
  },
  common: {
    add: "Añadir",
    all: "Todo",
    active: "Activo",
    on: "Activado",
    off: "Desactivado",
    discontinued: "Descatalogado",
    loading: "Cargando...",
    refresh: "Actualizar",
    save: "Guardar",
    cancel: "Cancelar",
    selected: "Seleccionado",
    remove: "Eliminar",
    exportCsv: "Exportar CSV",
    exportJson: "Exportar JSON",
    loadingPrinters: "Cargando impresoras...",
    close: "Cerrar",
    back: "Atrás",
    continue: "Continuar",
    copied: "Copiado",
    copyFailed: "No se pudo copiar",
    unknown: "Desconocido",
    show: "Mostrar",
    hide: "Ocultar",
    justNow: "ahora mismo",
    minutes: "min",
    hoursShort: "h",
    daysShort: "d",
    minutesAgo: "hace {count} min",
    hoursAgo: "hace {count} h",
    daysAgo: "hace {count} días",
  },
  errors: {
    invalidRequest: "No se pudo completar la solicitud.",
    unauthorized: "Se requiere autenticación.",
    forbidden: "Esta acción no está permitida.",
    notFound: "No se encontró el registro solicitado.",
    internal: "Algo salió mal. Inténtalo de nuevo.",
    spoolActiveLoan:
      "Devuelve el préstamo activo antes de eliminar esta bobina.",
    loadedSpoolEditBlocked:
      "Usa las acciones de la ranura de impresora para editar una bobina cargada.",
    loanedSpoolEditBlocked:
      "Devuelve el préstamo antes de editar el estado o la ubicación de esta bobina.",
    spoolStatusEditLimited:
      "Desde el navegador solo se pueden marcar bobinas en stock, vacías o perdidas.",
    exportInvalidPayload: "La exportación generada no es válida.",
    downloadsUnavailable: "La carpeta Descargas no está disponible.",
    exportWriteFailed: "No se pudo guardar la exportación.",
    requestFailed: "No se pudo completar la solicitud.",
  },
  vendor: {
    bambu: "Bambu",
    esun: "eSUN",
    generic: "Genérico",
  },
  nav: {
    dashboard: "Panel",
    inventory: "Inventario",
    loans: "Préstamos",
    printers: "Impresoras",
    statistics: "Estadísticas",
    settings: "Ajustes",
  },
  dashboard: {
    onboardingInventoryBody:
      "Empieza con una bobina o importa un inventario o una copia de seguridad existentes.",
    onboardingInventoryTitle: "Añadir o importar inventario",
    onboardingPrinterBody:
      "Añade cualquier impresora compatible. Bambu Live se puede activar cuando esté disponible.",
    onboardingPrinterTitle: "Configurar una impresora",
    onboardingCompanionBody:
      "Activa el acceso desde el navegador en una red de confianza o vincula este equipo con un host.",
    onboardingCompanionTitle: "Configurar el acceso desde el navegador",
    onboardingBackupBody:
      "Crea una copia de seguridad completa cuando la biblioteca esté lista.",
    onboardingEyebrow: "Primeros pasos",
    onboardingTitle: "Finalizar la configuración",
    onboardingDescription:
      "Sigue los pasos que se adapten a tu instalación. La impresora y el acceso desde el navegador son opcionales.",
    onboardingProgress: "{completed} de {total} completados",
    onboardingDismiss: "Cerrar la lista",
    onboardingComplete: "Completado",
    onboardingOptional: "Opcional",
    onboardingPending: "Pendiente",
    subtitle:
      "Consulta el estado del inventario, el consumo actual y la actividad de las impresoras en un solo lugar.",
    totalSpools: "Bobinas totales",
    totalSpoolsSubtitle: "En todas las ubicaciones",
    inUse: "en uso",
    assigned: "asignadas",
    ownershipSnapshot: "Resumen de propiedad",
    noBorrowedInStock: "No hay bobinas prestadas por terceros",
    ownedOnHand: "Propias disponibles",
    borrowedInOnHand: "Prestadas por terceros disponibles",
    lowStock: "Poco stock",
    noAlerts: "Sin alertas",
    monthlyUsage: "Consumo mensual",
    recentActivity: "Actividad reciente",
    noRecentActivity: "Aún no hay actividad reciente.",

    achievements: "Metas de progreso",
    achievementsHint:
      "Objetivos en vivo basados ​​en su inventario actual y actividad de la impresora.",
    active: "Activo",
    activePrinters: "Impresoras activas",
    activityEmptyHint:
      "Aquí aparecerán préstamos, trabajos de impresión y otras actividades rastreadas.",
    activityHint:
      "Los préstamos abiertos y el uso reciente de la impresora aparecen aquí primero.",
    addRollsForHealth:
      "Agregue rollos para iniciar el seguimiento de la salud.",
    amsLoaded: "ranuras cargadas",
    amsOnline: "Tragamonedas en línea",
    backup: "Respaldo",
    backupText:
      "Exporte instantáneas de inventario a JSON o CSV para archivarlas.",
    badgeActiveSpoolsPlaced: "rollos activos colocados",
    badgeJobLogging: "Registro de trabajos",
    badgeJobLoggingDesc:
      "Registre los trabajos vinculados a la impresora para que el consumo se base en el uso real.",
    badgeJobsLogged: "trabajos registrados",
    badgeLocationCoverage: "Cobertura de ubicación",
    badgeLocationCoverageDesc:
      "Mantenga cada rollo activo asignado a un estante, préstamo o ranura de impresora.",
    badgeNoActiveSpools: "Aún no hay rollos activos.",
    badgeNoPrinterSlots: "Aún no se han configurado ranuras para impresora.",
    badgeSlotReadiness: "Preparación de ranuras",
    badgeSlotReadinessDesc:
      "Mantenga las ranuras AMS/MMU listas cuando se configuren; las impresoras de un solo material cuentan EXT.",
    badgeSlotsLoaded: "ranuras cargadas",
    below20: "Por debajo del 20%",
    below200: "Por debajo de 200 g",
    borrowedInLowStock: "Stock bajo prestado",
    checkHostConnection: "Verifique la conexión a",
    clientSnapshotActiveLoans: "Préstamos Activos",
    clientSnapshotCapturedAt: "Instantánea capturada",
    clientSnapshotCardHint:
      "Este dispositivo está conectado como cliente. Por ahora muestra el resumen del host y mantiene flujos de trabajo con mucha escritura en el host.",
    clientSnapshotCardTitle: "Vista previa del host de solo lectura",
    clientSnapshotHealthHint:
      "Este cliente solo muestra el resumen del host. El estado detallado del inventario permanece en el host por ahora.",
    clientSnapshotHostOnline: "Actividad de impresora informada por el host",
    clientSnapshotHostPrinters: "en el anfitrión",
    clientSnapshotLibraryId: "ID de biblioteca",
    clientSnapshotNeedsAttention: "La biblioteca anfitriona necesita atención",
    clientSnapshotSubtitle: "Instantánea del host de solo lectura",
    clientSnapshotSynced: "Instantánea del host",
    clientSnapshotSyncedCached: "Instantánea del host en caché",
    clientSnapshotSyncedLive: "Instantánea del anfitrión en vivo",
    companionCheck: "Verificación de aplicaciones web",
    companionLive: "Aplicación web en ejecución",
    companionOff: "Aplicación web desactivada",
    configured: "configuradas",
    connectedToHost: "Conectado a",
    consumption: "Consumo de filamento",
    consumptionCaption:
      "El uso se agrega a partir de trabajos de impresión vinculados a impresoras.",
    gramsPerDay: "{count} g/día",
    healthBalanceHint:
      "Observe juntos las existencias bajas, los préstamos, los pedidos y las máquinas tragamonedas cargadas.",
    healthMonitor: "Monitorear reabastecimiento",
    healthRestock: "Reabastecer recomendado",
    healthStable: "Suministro estable",
    hostCompanionOff: "Anfitrión desconectado",
    hostFallbackName: "anfitrión",
    inventoryHealth: "Estado del inventario",
    last30: "últimos 30 días",
    loaned: "prestado",
    loanedTo: "Prestado a",
    lowStockShort: "stock bajo",
    lowest: "mínimo",
    noActivePrinter: "No se seleccionó ninguna impresora activa",
    noInventoryData: "Datos insuficientes",
    noPrintersConfigured: "No hay impresoras configuradas",
    noUsageTrendYet: "Aún no hay tendencia de uso",
    onOrder: "en orden",
    openCompanionSettings: "Abrir configuración complementaria",
    ownedLowStock: "Stock bajo en propiedad",
    ownershipSnapshotHint:
      "Realice un seguimiento de las acciones propias y prestadas por separado sin cambiar los totales principales anteriores.",
    ownershipSplitNote:
      "Los totales de titulares anteriores aún combinan todos los rollos físicos, mientras que las reglas de resumen específicas de propiedad continúan evolucionando.",
    synced: "Sincronizado",
    syncedFromDb: "Sincronizado desde la base de datos local",
  },
  inventory: {
    title: "Bobinas",
    subtitle:
      "Gestiona el stock, los préstamos y el peso de las bobinas en un solo lugar.",
    addSpoolAction: "Añadir bobina",
    searchPlaceholder:
      "Buscar por material, color, propietario, ubicación o QR",
    filters: "Filtros",
    spoolResult: "bobina",
    spoolResults: "bobinas",
    activeFilters: "activos",
    resetFilters: "Restablecer filtros",
    showAdvancedFilters: "Más filtros",
    hideAdvancedFilters: "Ocultar detalles",
    viewGroup: "Vista",
    viewCards: "Vista de tarjetas",
    viewList: "Vista de lista",
    ownershipGroup: "Propiedad",
    ownershipAll: "Todas",
    vendorGroup: "Fabricante",
    vendorAll: "Todos",
    materialGroup: "Material",
    typeAll: "Todos",
    status: "Estado",
    statusInStock: "En stock",
    statusAssigned: "Asignada",
    statusInUse: "En uso",
    statusBorrowed: "Prestada",
    statusEmpty: "Vacía",
    statusLost: "Perdida",
    statusMissing: "No localizada",
    statusDeleted: "Eliminada",
    ownership: "Propiedad",
    ownershipType: "Tipo de propiedad",
    ownedByUs: "Propia",
    ownedByUsDetail: "De nuestra propiedad",
    borrowedIn: "Prestada por terceros",
    borrowedInHelp:
      "Registra esta bobina como prestada por otra persona. Puede usarse en impresoras, pero no aparecerá entre las candidatas para prestar.",
    borrowedFrom: "Prestada por",
    ownerContactOptional: "Contacto del propietario (opcional)",
    borrowedInNoteOptional: "Nota del préstamo recibido (opcional)",
    editOwnership: "Propiedad",
    ownerNameRequired: "Nombre del propietario (obligatorio)",
    ownershipNoteOptional: "Nota (opcional)",
    ownedOwnershipHelp:
      "Las bobinas propias permanecen en el inventario y pueden prestarse más adelante.",
    saveOwnership: "Guardar propiedad",
    ownershipUpdated: "Propiedad de la bobina actualizada.",
    reference: "Referencia",
    lowStockOnly: "Poco stock (1–200 g)",
    lowStockActiveBadge: "Filtro de poco stock activo",
    unassigned: "Sin asignar",
    workspace: "Espacio de trabajo",
    manageInventory: "Gestionar inventario",
    borrowedRolls: "Bobinas prestadas",
    noActiveLoans: "No hay préstamos activos.",
    to: "A",
    out: "Salida",
    rolls: "Bobinas",
    total: "Total",
    moreRolls: "bobina(s) más",
    showAllRolls: "Mostrar todas",
    showFewerRolls: "Mostrar menos",
    loading: "Cargando bobinas...",
    addedToInventory: "Añadida al inventario",
    addedFromWishlist: "Añadida desde la lista de deseos",
    noMatch: "Ninguna bobina coincide con los filtros actuales.",
    noMatchHint:
      "Prueba a cambiar la búsqueda o los filtros de estado, material o propiedad.",
    selectedRoll: "Bobina seleccionada",
    updatingRoll: "Actualizando la bobina seleccionada...",
    currentStatus: "Estado actual",
    material: "Material",
    remaining: "Restante",
    placement: "Ubicación",
    location: "Ubicación",
    assignedSlotLabel: "Ranura asignada",
    qrCode: "Código QR",
    qrLabel: "QR",
    qrCompanionLinkLabel: "Enlace de Companion",
    qrTarget: "Destino del QR",
    assignmentManagedOnPrinters:
      "La ubicación del filamento y la asignación de ranuras se gestionan en Impresoras.",
    assignAmsSlot: "Asignar a una ranura de impresora",
    slotAssignment: "Asignación de ranura",
    removeFromSlotOption: "Vaciar ranura",
    keepUnassignedOption: "Sin ranura",
    current: "actual",
    replacingRoll: "Sustituyendo",
    outgoingWeight: "Peso de salida (g)",
    incomingWeight: "Peso de entrada (g)",
    homeLocationOptional: "Ubicación habitual (opcional)",
    rollMetadata: "Metadatos de la bobina",
    rollSetup: "Configuración de la bobina",
    catalogDetails: "Detalles del catálogo",
    unlockMetadata: "Desbloquear metadatos",
    lockMetadata: "Bloquear metadatos",
    swatchColorCode: "Código de color de muestra",
    saveMetadata: "Guardar metadatos",
    saveRollChanges: "Guardar cambios de la bobina",
    measuredTotalWeight: "Peso total medido (g)",
    initialWeight: "Peso inicial (g)",
    remainingWeight: "Peso restante (g)",
    emptySpoolWeight: "Peso de la bobina vacía (g)",
    quickActions: "Acciones rápidas",
    dangerZone: "Zona de peligro",
    weightLabel: "Peso actual (g)",
    adjustWeight: "Ajustar peso",
    weightValue: "Valor del peso (g)",
    printerUsage: "Uso de impresora",
    assigned: "Asignada",
    slot: "ranura",
    assignBeforeUsage:
      "Asigna esta bobina a una ranura para registrar el consumo.",
    loanTracking: "Seguimiento de préstamos",
    addFilament: "Añadir filamento",
    addFilamentSubtitle:
      "Añádelo directamente al stock o usa el flujo deseos → pedido → stock.",
    stockEntry: "Entrada de stock",
    stockEntryHelp:
      "Elige un fabricante y un filamento, y confirma los datos del stock.",
    vendorSource: "Fuente del fabricante",
    catalogMatchCountSingular: "{count} coincidencia",
    catalogMatchCountPlural: "{count} coincidencias",
    catalogMatchCount:
      "{count, plural, one {# coincidencia} other {# coincidencias}}",
    searchVendorCatalog: "Buscar material, filamento o color de {{vendor}}",
    catalogRefreshFilter: "Actualización y filtro del catálogo",
    catalogSelection: "Selección del catálogo",
    noCatalogMatches: "No hay entradas que coincidan con los filtros actuales.",
    imported: "Importadas",
    reactivated: "Reactivadas",
    discontinued: "Descatalogadas",
    unknownCollection: "colección desconocida",
    selectionPreview: "Vista previa de la selección",
    noSelectionPreview:
      "Elige una fila del catálogo o introduce los datos manualmente.",
    bambuCodeLabel: "Filament Code",
    bambuCodeHelp:
      "Usa el código de cinco cifras indicado como Filament Code en la caja Bambu.",
    bambuCodeSingleMatch:
      "Se encontró y seleccionó una entrada activa del catálogo Bambu.",
    bambuCodeMultipleMatches:
      "Varias entradas activas usan este código. Elige la correcta.",
    bambuCodeDiscontinuedOnly:
      "Este código solo aparece en entradas Bambu descatalogadas.",
    bambuCodeNoMatch: "Ninguna entrada Bambu usa todavía este Filament Code.",
    bambuCodeMoreMatches: "más",
    bambuCodeTryCatalogSearch:
      "También puedes buscar por material, serie o nombre del color.",
    bambuCodeEnterExample:
      "Escribe el código en la búsqueda, por ejemplo 53400.",
    bambuCodeBoxLabelTitle: "Etiqueta de la caja",
    bambuCodeBoxLabelHint: "Busca este campo en la etiqueta de la caja.",
    bambuBatchHeaderAction: "Añadir lote desde cajas",
    bambuBatchHeaderActionShort: "Lote",
    bambuBatchModalEyebrow: "Cajas Bambu",
    bambuBatchModalTitle: "Añadir lote desde cajas",
    bambuBatchModalSubtitle:
      "Añade varias bobinas Bambu mediante los Filament Code de las cajas sin ocultar la búsqueda normal.",
    bambuBatchTitle: "Lote de Filament Code",
    bambuBatchInputLabel: "Códigos del lote",
    bambuBatchHelp:
      "Pega uno o varios códigos de cinco cifras. Las coincidencias listas usan los datos de stock.",
    bambuBatchScanTitle: "Escanear o introducir códigos",
    bambuBatchScanHelp:
      "Usa la webcam, importa una imagen o escribe los códigos uno a uno.",
    bambuBatchScanLabel: "Escanear o escribir un código",
    bambuBatchScanPlaceholder: "Escanear o escribir un código",
    bambuBatchAppendScan: "Añadir al lote",
    bambuBatchImageAction: "Añadir desde imagen",
    bambuBatchImageScanning: "Leyendo imagen...",
    bambuBatchImageAddedCodes: "Se añadieron {count} Filament Code al lote.",
    bambuBatchImageAddedReview:
      "Se añadieron {count} valores de código de barras para revisar.",
    bambuBatchImageAddedMixed:
      "Se añadieron {codeCount} Filament Code y {reviewCount} valores para revisar.",
    bambuBatchImageIgnored:
      "Se ignoraron {count} códigos QR de instrucciones Bambu.",
    bambuBatchImageUnsupported:
      "La lectura de códigos en imágenes no está disponible aquí. Pega o escribe el código.",
    bambuBatchImageNoBarcode:
      "No se encontró ningún código de barras en la imagen.",
    bambuBatchImageError: "No se pudo leer la imagen.",
    bambuBatchCameraAction: "Usar webcam",
    bambuBatchCameraStop: "Detener webcam",
    bambuBatchCameraStartingAction: "Iniciando cámara...",
    bambuBatchCameraStarting: "Iniciando cámara",
    bambuBatchCameraStartingMessage: "Iniciando cámara...",
    bambuBatchCameraScanning: "Escaneando",
    bambuBatchCameraShowLabel:
      "Mantén el Filament Code o código de barras plano dentro de la guía y a una distancia que conserve las barras nítidas.",
    bambuBatchCameraAdded: "Añadido",
    bambuBatchCameraReview: "Revisar",
    bambuBatchCameraDuplicate: "Ya añadido",
    bambuBatchCameraIgnored: "Ignorado",
    bambuBatchCameraUnavailable: "Cámara no disponible",
    bambuBatchCameraErrorShort: "Error de cámara",
    bambuBatchCameraPreviewIdle:
      "Inicia la webcam para escanear etiquetas de cajas Bambu.",
    bambuBatchCameraNoBarcodeYet:
      "Escaneando fotogramas sin coincidencias. Acerca o aleja la etiqueta hasta que las barras estén nítidas.",
    bambuBatchCameraAddedCodeValues: "Añadidos: {codes}.",
    bambuBatchCameraAddedReviewValues: "Añadidos para revisar: {values}.",
    bambuBatchCameraAddedMixedValues:
      "Añadidos {codes}; {reviewCount} valores para revisar.",
    bambuBatchCameraIgnoredQr:
      "Se ignoró un QR de instrucciones Bambu. Muestra la etiqueta Filament Code.",
    bambuBatchCameraAlreadyAdded:
      "Ya añadido. Retira la etiqueta antes de escanear otra.",
    bambuBatchCameraBarcodeUnsupported:
      "La lectura en directo no está disponible. Importa una imagen o escribe el código.",
    bambuBatchCameraUnsupported:
      "No se puede acceder a la cámara aquí. Importa una imagen o escribe el código.",
    bambuBatchCameraPermissionDenied:
      "Se denegó el permiso de cámara. Permite el acceso e inténtalo de nuevo.",
    bambuBatchCameraError: "No se pudo iniciar la cámara.",
    bambuBatchCameraPreviewError:
      "No se pudo iniciar la vista previa de la cámara.",
    bambuBatchCameraReadError: "El escaneo se detuvo por un error de lectura.",
    bambuBatchCameraReadRetry:
      "La cámara sigue activa, pero el lector omitió un fotograma. Mantén la etiqueta quieta.",
    bambuBatchPlaceholder: "53400\n53600\n65103",
    bambuBatchReady: "Listo",
    bambuBatchReadyShort: "listo",
    bambuBatchNeedsReview: "revisar",
    bambuBatchAmbiguous: "Elegir manualmente",
    bambuBatchChooseMatch: "Elegir fila del catálogo",
    bambuBatchNoMatch: "Sin coincidencia",
    bambuBatchNoCode: "Sin código",
    bambuBatchMoreRows: "más",
    bambuBatchNoRowsYet: "Los códigos escaneados o escritos aparecerán aquí.",
    bambuBatchBorrowedOwnerRequired:
      "Indica quién presta las bobinas antes de crear este lote.",
    bambuBatchNoneReady:
      "Aún no hay filas listas. Revisa las coincidencias ambiguas o los códigos ausentes.",
    bambuBatchPartialReady:
      "Solo se añadirán las filas listas; las de revisión se omiten.",
    bambuBatchAllReady: "Todos los códigos pegados están listos.",
    bambuBatchAddReady: "Añadir coincidencias listas",
    bambuBatchAdded: "Lote de códigos Bambu añadido",
    borrowedInBatchRegistered: "Lote prestado por terceros registrado",
    manualDetails: "Datos manuales",
    manualDetailsHelp:
      "Úsalo si el filamento no está en el catálogo o quieres una entrada manual.",
    stockDetails: "Datos del stock",
    addSpool: "Añadir bobina al inventario",
    addToWishlist: "Añadir a deseos / pedido",
    addToWishlistHelp:
      "Conserva la selección en el flujo deseos → pedido → stock.",
    wishlistWorkflow: "Flujo de deseos",
    addCurrentSelectionToWishlist: "Añadir la selección actual a deseos",
    wishlistOrders: "Deseos y pedidos",
    wishlistQueueHelp:
      "Guarda aquí las compras previstas, pásalas a pedido y regístralas cuando lleguen.",
    addDirectlyToStock: "Añadir directamente al stock",
    stockRollNow: "Registrar bobina ahora",
    registerBorrowedIn: "Registrar bobina prestada por terceros",
    availableToLoan: "Disponibles para prestar",
    loanSearchLabel: "Buscar bobinas disponibles",
    loanSearchPlaceholder:
      "Buscar material, color, fabricante, ubicación o referencia",
    loanCandidateCount: "{count, plural, one {# bobina} other {# bobinas}}",
    noLoanSearchResults: "Ninguna bobina disponible coincide con la búsqueda.",
    loanDetails: "Datos del préstamo",
    maxAvailable: "Máximo disponible",
    noLoanableRolls: "No hay bobinas disponibles para prestar.",
    chooseRollToLoan: "Elige una bobina para prestar.",
    borrowerName: "Nombre del prestatario",
    outG: "Salida (g)",
    loanNoteOptional: "Nota del préstamo (opcional)",
    loanOutRoll: "Prestar bobina",
    loanCreated: "Préstamo creado.",
    borrowedInRegistered: "Bobina prestada por terceros registrada",
    tareWeightUpdated: "Peso de la bobina vacía actualizado.",
    locationSaved: "Ubicación actualizada.",
    homeLocationSaved: "Ubicación habitual guardada.",
    editLocation: "Editar ubicación",
    locationOptional: "Ubicación (opcional)",
    editHomeLocation: "Ubicación habitual",
    homeLocationLabel: "Ubicación habitual",
    lostStatus: "Estado de pérdida",
    markLost: "Marcar como perdida",
    markFound: "Marcar como encontrada (en stock)",
    markedLost: "Bobina marcada como perdida.",
    markedFound: "Bobina restaurada al stock.",
    refill: "Rellenar / reactivar bobina",
    refilled: "Bobina reactivada y lista para usar.",
    refilledAuto: "Bobina reactivada a partir del nuevo peso medido.",
    returnToInventory: "Devolver al inventario",
    printQr: "Crear etiqueta QR",
    labelBuilderTitle: "Crear imagen de etiqueta",
    labelBuilderSubtitle:
      "Elige el tamaño físico, revisa la vista previa y guarda un PNG listo para imprimir.",
    labelSize: "Tamaño de etiqueta",
    labelPreview: "Vista previa de la etiqueta",
    labelRendering: "Generando etiqueta...",
    labelPreviewUnavailable: "Vista previa no disponible",
    labelSaving: "Guardando PNG...",
    labelSaveDownloads: "Guardar PNG en Descargas",
    labelSaved: "Etiqueta PNG guardada en Descargas.",
    rfidButton: "RFID",
    rfidHintReady:
      "Captura la identidad AMS/RFID observada, revísala y guárdala si es correcta.",
    rfidHintNeedsLive:
      "La captura RFID necesita una impresora con Live Bambu y una ranura AMS disponible.",
    rfidRegistered: "RFID registrada",
    rfidBambuUnregistered: "RFID aún no registrada",
    rfidUnsupportedVendor: "RFID de AMS no disponible",
    lastAmsIdentitySeen: "Última detección AMS",
    lastAmsSightingLiveActivity: "Ranura en directo",
    rfidMatchExact: "Exacta",
    rfidMatchExactHint: "Coinciden el material y el color HEX.",
    rfidMatchPartial: "Parcial",
    rfidMatchPartialHint:
      "Coincide el material y el color observado se aproxima a la muestra.",
    rfidCaptureTitle: "Captura RFID",
    rfidNoCaptureSource: "No hay ranuras AMS en directo disponibles",
    rfidSourceSlot: "Ranura de origen RFID",
    rfidCurrentTag: "RFID guardada",
    rfidObservedTag: "RFID observada",
    rfidObservedMaterial: "Filamento observado",
    rfidObservedColor: "Color observado",
    rfidIdentitySignals: "Señales de identidad RFID",
    rfidIdentityCandidates: "Señales de identidad RFID",
    rfidCaptureStatus: "Estado de captura",
    rfidPrinterLive: "Impresora en directo",
    rfidConnected: "Conectada",
    rfidDisconnected: "No conectada",
    rfidTechnicalDetails: "Detalles técnicos",
    rfidTechnicalDetailsHint:
      "Señales de identidad RFID sin procesar, estado de captura y campos capturados de la ranura.",
    rfidLastSeen: "Visto por última vez",
    rfidLastSlotData: "Últimos datos de la ranura",
    rfidActiveSource: "Fuente activa",
    rfidAmsSlotPresence: "Presencia en la ranura seleccionada",
    rfidAmsSlotPresent: "Presente físicamente",
    rfidAmsSlotMissing: "No presente físicamente",
    rfidSlotActive: "Activa",
    rfidSlotLoaded: "Cargada",
    rfidSlotEmpty: "Vacía",
    rfidSlotLive: "En directo",
    rfidSlotIdentitySeen: "RFID detectada",
    rfidSlotLiveSeen: "Señal en directo detectada",
    rfidCapturedFields: "Campos capturados de la ranura",
    rfidCapturedFieldsCollapsed: "Mostrar campos capturados",
    rfidCaptureWaiting:
      "Esperando datos nuevos de la ranura AMS. Mantén esta ventana abierta.",
    rfidCaptureUnavailable:
      "Aún no han llegado campos AMS específicos de esta ranura.",
    rfidCaptureNoPayload:
      "Aún no hay datos en directo. Actualiza AMS en Bambu Studio o espera.",
    rfidCaptureNothingToSave:
      "Aún no hay una identidad RFID disponible para esta ranura.",
    rfidCaptureFailed:
      "No se pudo actualizar la captura RFID desde la impresora.",
    rfidSaved: "Etiqueta RFID guardada en la bobina seleccionada.",
    saveRfid: "Guardar RFID",
    markEmpty: "Marcar como agotada (vacía)",
    confirmMarkEmptyAction: "Marcar bobina como vacía",
    markEmptyConfirmTitle: "¿Marcar esta bobina como vacía?",
    markEmptyConfirmHint:
      "El peso restante se fijará en 0 g y se retirará de la ranura si está cargada.",
    confirmDelete: "Haz clic de nuevo para confirmar",
    confirmDeleteAction: "Eliminar del inventario activo",
    deleteConfirmTitle: "¿Eliminar esta bobina del inventario activo?",
    deleteConfirmHint:
      "La bobina desaparece del inventario activo, pero se conserva su historial.",
    deleteRoll: "Eliminar bobina del inventario activo",
    confirmPurge: "Haz clic de nuevo para confirmar la eliminación permanente",
    confirmPurgeAction: "Eliminar bobina permanentemente",
    purgeConfirmTitle:
      "¿Eliminar permanentemente esta bobina y todo su historial?",
    purgeConfirmHint:
      "No se puede deshacer. Se borrarán la bobina y todos los eventos registrados.",
    purgeRoll: "Eliminar permanentemente bobina e historial",
    dangerZoneHint:
      "Ábrela solo para vaciar, eliminar o purgar permanentemente esta bobina.",
    usageDiagram: "Diagrama de consumo",
    rollHistory: "Historial de la bobina",
    rollHistoryCollapsed:
      "El historial está contraído de forma predeterminada. Amplíalo para ver los eventos.",
    historyEventCountOne: "evento",
    historyEventCountMany: "eventos",
    historyEventCount: "{count, plural, one {# evento} other {# eventos}}",
    showMoreHistory: "Mostrar más",
    showLessHistory: "Mostrar menos",
    loadingHistory: "Cargando historial...",
    noHistory: "Aún no hay eventos en el historial.",
    noVisibleHistory: "No hay historial aparte de las asignaciones de ranuras.",
    fields: "campos",
    field: "Campo",
    value: "Valor",
    lastUpdated: "Última actualización",
    changes: "Cambios",
    selectRollForHistory: "Selecciona una bobina para ver su historial.",

    addMovedPrefix: "El flujo de agregar/pedir se mueve a la parte superior",
    addMovedSuffix: "pestaña.",
    catalogManagedInSettings:
      "Las actualizaciones del catálogo y el progreso de la actualización se administran en Configuración → Catálogo de filamentos.",
    catalogManagedInSettingsHelp:
      "Utilice el catálogo local a continuación para agregar rollos directamente al stock, a la lista de deseos o a las colas de pedidos.",
    clientHostUnavailable:
      "Faltan detalles de conexión del host para este dispositivo cliente.",
    clientLoanOutPairedHint:
      "Los rollos disponibles se cargan desde el host y allí se crea el préstamo.",
    clientLoanOutUnpairedHint:
      "Empareje este cliente de escritorio con el host antes de crear un préstamo desde este dispositivo.",
    clientReadOnlyAction:
      "Este dispositivo está conectado como cliente. Utilice el host para cambios de inventario.",
    clientReadOnlyBanner:
      "Este dispositivo está vinculado como cliente. Las ediciones de inventario permanecen en el host por ahora.",
    clientReadOnlyBannerPaired:
      "Este dispositivo está conectado como cliente. Las actualizaciones del inventario se envían al host emparejado, mientras que el host sigue siendo la autoridad de la biblioteca.",
    clientReadOnlyCached:
      "El anfitrión no está disponible. Mostrando la última instantánea del inventario almacenado en caché.",
    clientReadOnlyHost: "Anfitrión",
    clientReadOnlyLive: "Mostrando inventario de hosts en vivo.",
    clientReadOnlyManage:
      "Este dispositivo está conectado como cliente. Puedes revisar el rollo aquí; las acciones del host vinculado siguen siendo limitadas y explícitas.",
    clientReadOnlyOffline:
      "El host no está disponible y aún no hay ninguna instantánea del inventario en caché disponible.",
    clientReadOnlyUpdated: "Actualizado",
    clientTareWeightUpdated:
      "Peso del rollo vacío actualizado en la biblioteca host.",
    clientWeightUpdated: "Peso actualizado en la biblioteca host.",
    clientWriteRequiresPairing:
      "Empareje este cliente de escritorio con el host antes de ejecutar acciones de sincronización protegidas.",
    emptySpoolWeightHelp:
      "Se utiliza para restar la tara del rollo del total medido para que el filamento restante se mantenga preciso.",
    historyFilteredHint:
      "Las asignaciones de ranuras de impresora se muestran arriba para que este historial se centre en la actividad del rollo.",
    homeLocationHintWhileAssigned:
      "La ubicación actual se gestiona en la página Impresoras. La ubicación inicial es a donde regresa el rollo cuando ya no está cargado.",
    inUseRequiresAms: "ASIGNADO requiere asignación a una ranura de impresora.",
    labelImageHint:
      "El PNG se representa a 300 DPI para un tamaño físico predecible.",
    labelPtouchHint:
      "Diseñado para cinta de 24 mm con un QR de altura completa y texto legible.",
    labelSheetHint:
      "¿Necesita etiquetas para varios rollos? Cree una hoja de etiquetas de inventario en Configuración → General.",
    loanCandidateMany: "rollos",
    loanCandidateOne: "rollo",
    loanDetailsHelp:
      "Confirme el prestatario y el peso saliente antes de guardar el préstamo.",
    loanSearchFilteredCount: "{visible} de {total} {unit}",
    loanSearchFilteredCountIcu:
      "{visible} de {total, plural, one {# rollo} other {# rollos}}",
    loanSelectionHelp:
      "Elija un rollo en stock, luego confirme quién lo recibirá y cuánto saldrá.",
    loanTrackingHint:
      "Las devoluciones y el pesaje a la devolución se manejan desde la página de Préstamos.",
    loanTrackingSubtitle:
      "Prestar un rollo del inventario. Las devoluciones se manejan desde la página de Préstamos.",
    metadataAppliesToFamily:
      "Los cambios actualizan la entrada del catálogo de filamentos compartidos para todos los rollos de esta familia de filamentos.",
    outgoingWeightPromptTitle: "Establecer el peso del rollo saliente",
    qrCompanionUnavailable:
      "Los enlaces QR de Companion requieren la dirección local estable. Haz que esté disponible en el host activo antes de crear una etiqueta.",
    qrTargetCompanionHint:
      "Este QR abre el navegador complementario directamente siempre que el objetivo URL aún sea accesible.",
    rfidAmsBambuBits: "Puntas AMS Bambu",
    rfidAmsExistBits: "Bits presentes en la ranura AMS",
    rfidAmsReadDone: "AMS bits de lectura realizada",
    rfidAmsStatus: "Estado de AMS RFID",
    rfidBambuUnregisteredHint:
      "Los rollos Bambu se pueden vincular automáticamente cargando el rollo en AMS y guardando la identidad RFID observada.",
    rfidCaptureNoSlotData:
      "Aún no hay campos AMS específicos de la ranura disponibles para esta ranura de origen.",
    rfidCaptureUsingLastKnown:
      "Esperando datos nuevos de la ranura AMS. Los valores capturados previamente permanecen visibles hasta que lleguen datos más nuevos.",
    rfidPresetName: "Nombre preestablecido/material",
    rfidPresetSignal: "Configuración de filamento preestablecida",
    rfidUnsupportedVendorHint:
      "Actualmente, la identidad AMS RFID solo está expuesta para los rollos Bambu. Realice un seguimiento de este rollo con QR, peso, ubicación y asignación de impresora.",
    selectRollForUsage:
      "Seleccione un rollo para mostrar la tendencia de peso.",
    selectRollPrompt:
      "Selecciona un rollo de una tarjeta agrupada para gestionarlo.",
    slotWeightPromptTitle: "Establecer pesos de cambio de ranura",
    swapWeightHint:
      "Al cambiar el rollo, el peso saliente registra el uso vinculado a la impresora antes de la reasignación. El peso entrante es opcional.",
    swatchColorPicker: "Selector de color de muestra",
    visualFixtureLoaded: "Accesorio de detalle de inventario cargado.",
    error: {
      add: "No se pudo agregar el filamento.",
      assignFirst: "Primero asigne el rollo a una ranura de la impresora.",
      bambuBatchEmpty:
        "Pegue al menos un código de filamento Bambu que coincida con el catálogo.",
      bambuBatchWrongMode:
        "Cambie a la fuente Bambu antes de crear un lote de código de filamento.",
      borrowedInNeedsOwner:
        "El registro de préstamo necesita un nombre que indique de quién se toma prestado el rollo.",
      borrowerRequired: "Se requiere el nombre del prestatario.",
      createBambuBatch:
        "No se pudo crear el lote de código Bambu. Verifique la unicidad y los valores de QR.",
      createSpool:
        "No se pudo crear el rollo. Verifique la unicidad y los valores de QR.",
      deleteRoll: "No se pudo eliminar el rollo.",
      esunDetail: "No se pudieron cargar los detalles del producto eSUN.",
      esunLookup: "La búsqueda de eSUN falló. Intentar otra vez.",
      esunQueryShort: "Escriba al menos 2 caracteres para la búsqueda de eSUN.",
      incomingWeightRequired:
        "Ingrese el peso del rollo entrante antes de guardar los cambios de ranura.",
      invalidHex:
        "Color de muestra no válido. Utilice #RRGGBB, multi(#RRGGBB,#RRGGBB) o gradiente(#RRGGBB,#RRGGBB).",
      invalidWeight: "El valor del peso no es válido.",
      loadInventory: "No se pudo cargar el inventario.",
      loadSpools: "No se pudieron cargar los rollos de inventario.",
      loanAlreadyActive: "Este rollo ya tiene un préstamo activo.",
      loanBorrowedIn: "Las bobinas prestadas no se pueden volver a prestar.",
      loanGrams: "Los gramos de préstamo deben ser cero o mayores.",
      loanOut: "No se pudo prestar el rollo.",
      manualNeedsFields:
        "La creación manual necesita el nombre y el color del filamento.",
      markEmpty: "No se pudo marcar el rollo como vacío.",
      masterFieldsRequired:
        "Se requieren proveedor, material, nombre del filamento y color para guardar los metadatos.",
      outgoingWeightRequired:
        "Ingrese el peso del rollo saliente antes de reemplazar esta ranura.",
      outgoingWeightRequiredForUnassign:
        "Ingrese el peso del rollo saliente antes de retirar este rollo de la ranura.",
      ownerNameRequired:
        "Los rollos prestados necesitan el nombre del propietario o la contraparte.",
      printLabel: "No se pudo generar la etiqueta.",
      purgeRoll: "No se pudo purgar el rollo.",
      recordUsage: "No se pudo registrar el uso de la impresora.",
      refill: "No se pudo reactivar el rollo.",
      refillRequiresWeight:
        "Establezca el peso total medido por encima del peso del rollo vacío antes de reactivar.",
      requireAmsForInUse:
        "Elija una ranura de impresora antes de configurar ASIGNADA.",
      returnLoan: "No se pudo devolver el rollo prestado.",
      returnedGrams: "Los gramos devueltos deben ser cero o más.",
      saveRfid: "No se pudo guardar la etiqueta RFID.",
      saveRollChanges: "No se pudieron guardar los cambios de rollo.",
      selectBambuFirst: "Seleccione primero un filamento Bambu.",
      selectEsunFirst: "Ejecute la búsqueda de eSUN y seleccione un producto.",
      stockFromWishlist:
        "No se pudo almacenar el rollo del artículo de la lista de deseos.",
      toggleLost: "No se pudo actualizar el estado perdido.",
      unlockMetadataFirst:
        "Desbloquee los metadatos antes de editar los detalles del catálogo.",
      updateHomeLocation: "No se pudo guardar la ubicación de casa.",
      updateLocation: "No se pudo actualizar la ubicación.",
      updateMetadata: "No se pudieron actualizar los metadatos del rollo.",
      updateOwnership: "No se pudo actualizar la propiedad del rollo.",
      updateTareWeight: "No se pudo actualizar el peso del rollo vacío.",
      updateWeight: "No se pudo actualizar el peso.",
    },
    historyEvent: {
      addedToLibrary: "Agregado a la biblioteca",
      addedToLibraryDetail: "Se agregó filamento a la biblioteca.",
      assignedToAms: "Asignado a la ranura de la impresora",
      borrowedInRegistered: "Prestado en registrado",
      borrowedInReturned: "Tomado prestado y devuelto",
      correction: "Corrección",
      deleted: "Eliminado",
      detailsUpdated: "Detalles actualizados",
      loanReturned: "Préstamo devuelto",
      loanedOut: "prestado",
      locationUpdated: "Ubicación actualizada",
      printJobRecorded: "Uso de impresión registrado",
      rfidSaved: "RFID guardado",
      rfidSavedDetail: "La identidad RFID se guardó desde la captura de AMS.",
      statusUpdated: "Estado actualizado",
      usedUp: "Marcado vacío",
      weightCorrected: "Peso corregido",
      weightUpdated: "Peso actualizado",
    },
    labelProfile: {
      compact: "Compacto",
      expanded: "Expandido",
      "ptouch-24": "P-Touch 24 mm",
      standard: "Estándar",
    },
  },
  wishlist: {
    statusWishlist: "Deseos",
    statusOnOrder: "Pedido",
    statusReceived: "Recibido",
    statusFilter: "Filtro de estado de deseos",
    itemStatusGroup: "Estado de {name}",
    qty: "Cant.",
    searchQueueLabel: "Buscar en la cola de compra",
    searchQueuePlaceholder: "Buscar por nombre, color o fabricante",
    resultCountOne: "artículo",
    resultCountMany: "artículos",
    resultCount: "{count, plural, one {# artículo} other {# artículos}}",
    filamentName: "Nombre del filamento",
    colorName: "Nombre del color",
    hexOptional: "Color de muestra (opcional)",
    loading: "Cargando lista de deseos...",
    empty: "Aún no hay artículos en la lista de deseos.",
    noneFiltered: "Ningún artículo coincide con el filtro seleccionado.",
    noSearchResults: "Ningún artículo coincide con esta búsqueda.",
    confirmRemoveAction: "Confirmar eliminación",
    confirmRemoveTitle: "¿Eliminar {name} de la cola de compra?",
    confirmRemoveHint:
      "Esto elimina la entrada de la cola, no las bobinas del inventario.",

    addMissingFilamentManual: "¿Falta el filamento? Agréguelo manualmente",
    catalog: "Catálogo",
    confirmRemoveTapAgain:
      "Haga clic en Eliminar nuevamente para confirmar la eliminación de esta entrada de la lista de deseos.",
    elapsed: "Transcurrido",
    materialPlaceholder: "Material (por ejemplo, PLA)",
    noRefreshOutput: "Aún no hay resultados de actualización disponibles.",
    phase: "Fase",
    refreshLog: "actualizar registro",
    refreshPreparing: "Preparando actualización del catálogo...",
    refreshPreparingBambu: "Preparando actualización del catálogo Bambu...",
    refreshPreparingEsun: "Preparando actualización del catálogo eSUN...",
    refreshing: "Refrescante",
    searchBambu: "Buscar material/color o código de filamento Bambu",
    searchEsun: "Buscar material/color de eSUN",
    vendor: "Proveedor",
    vendorPlaceholder: "Proveedor (por ejemplo, genérico, eSUN)",
    viewRefreshLog: "Ver registro de actualización",
    error: {
      add: "No se pudo agregar el elemento de la lista de deseos.",
      delete: "No se pudo eliminar el elemento de la lista de deseos.",
      invalidSelection:
        "Elija una configuración de filamento válida antes de agregarla a la lista de deseos.",
      loadCatalog: "No se pudo cargar el catálogo maestro.",
      refreshBambu: "Error al actualizar el catálogo.",
      refreshEsun: "Error al actualizar el catálogo de eSUN.",
      updateStatus: "No se pudo actualizar el estado de la lista de deseos.",
      zeroBambu:
        "Actualización completada con 0 filas importadas. La tienda puede tener tarifas limitadas o cambios.",
      zeroEsun:
        "Actualización de eSUN completada con 0 filas importadas. Es posible que el formato de la tienda haya cambiado.",
    },
  },
  loans: {
    subtitle: "Gestiona préstamos activos, bobinas de terceros y devoluciones.",
    exportCsv: "Exportar préstamos a CSV",
    activeLoans: "Préstamos activos",
    activeBorrowedIn: "Préstamos recibidos activos",
    activeRecords: "Registros activos",
    returnedLoans: "Préstamos devueltos",
    returnedRecords: "Registros devueltos",
    handedBack: "Entregada",
    totalConsumed: "Consumo total",
    history: "Historial de préstamos",
    searchPlaceholder: "Buscar persona, material o id. de bobina",
    resultCountOne: "préstamo",
    resultCountMany: "préstamos",
    resultCount: "{count, plural, one {# préstamo} other {# préstamos}}",
    direction: "Dirección",
    directionOutbound: "Prestada",
    directionInbound: "Prestada por terceros",
    loading: "Cargando préstamos...",
    noMatch: "Ningún préstamo coincide con el filtro actual.",
    spool: "Bobina",
    spoolId: "ID de bobina",
    borrower: "Prestatario",
    lent: "Prestada",
    borrowedInAt: "Recibida",
    startWeight: "Inicio",
    returned: "Devuelta",
    handedBackAt: "Entregada",
    returnNoteOptional: "Nota de devolución (opcional)",
    returnAction: "Devolver",
    handBackAction: "Entregar",
    returnDialogTitle: "Devolver bobina prestada",
    returnDialogSubtitle: "Vuelve a pesarla y añade una nota si es necesario.",
    returnDialogWeightLabel: "Peso total devuelto, incluida la bobina (g)",
    confirmReturnAction: "Confirmar devolución",
    handBackDialogTitle: "Entregar bobina prestada por terceros",
    confirmHandBackAction: "Confirmar entrega",
    consumed: "Consumido",
    usageByPerson: "Consumo por persona",
    noUsageByPerson: "Aún no hay datos de consumo por persona.",
    csvExported: "CSV de préstamos exportado.",

    back: "Atrás",
    borrowedGrams: "Prestado",
    clientHostUnavailable:
      "Faltan detalles de conexión del host para este dispositivo cliente.",
    clientReadOnlyAction:
      "Este dispositivo está conectado como cliente. Utilice el host para cambios de préstamos.",
    clientReadOnlyBanner:
      "Este dispositivo está vinculado como cliente. Los cambios en los préstamos permanecen en el host por ahora.",
    clientReadOnlyBannerPaired:
      "Este dispositivo está conectado como cliente. Las devoluciones y devoluciones se pueden enviar al anfitrión, mientras que la creación de nuevos préstamos permanece allí.",
    clientReadOnlyCached:
      "El anfitrión no está disponible. Mostrando la última instantánea del préstamo almacenada en caché.",
    clientReadOnlyHost: "Anfitrión",
    clientReadOnlyLive: "Mostrando préstamos de anfitriones en vivo.",
    clientReadOnlyOffline:
      "El host no está disponible y todavía no hay ninguna instantánea del préstamo en caché disponible.",
    clientReadOnlyUpdated: "Actualizado",
    clientWriteRequiresPairing:
      "Empareje este cliente de escritorio con el host antes de ejecutar acciones de préstamo protegido.",
    desktopOnly:
      "El seguimiento de préstamos está disponible en la versión de la aplicación de escritorio.",
    estimatedUsedGrams: "Utilizado estimado",
    handBackDialogHint:
      "Devolverlo eliminará el rollo prestado del inventario activo pero mantendrá su historial de préstamo.",
    handBackDialogSubtitle:
      "Vuelva a pesarlo, agregue una nota si es necesario y luego elimínelo del inventario activo.",
    handBackDialogWeightLabel: "Peso total devuelto incl. rollo (g)",
    handedBackFilamentGrams: "Devuelto",
    historyHint:
      "Los préstamos abiertos se pueden devolver aquí; los completados permanecen disponibles como referencia.",
    in: "En",
    loanedGrams: "Prestado",
    markedHandedBackTo: "rollo prestado marcado como devuelto a",
    markedReturnedFor: "Préstamo marcado como devuelto por",
    out: "Afuera",
    returnSummaryLabel: "Resumen de devolución",
    returnedFilamentGrams: "Devuelto",
    returnedG: "devuelto g",
    returnedGrams: "gramos devueltos",
    usageHint:
      "Vea quién tiene actualmente préstamos salientes activos y cuánto material ha utilizado cada persona.",
    error: {
      export: "No se pudieron exportar préstamos CSV.",
      handBack: "No se pudo devolver el rollo prestado.",
      invalidReturned: "Los gramos devueltos deben ser cero o más.",
      load: "No se pudieron cargar los datos del préstamo.",
      return: "No se pudo devolver el préstamo.",
    },
  },
  printers: {
    subtitle: "Gestiona ranuras y consumo de material vinculado a impresoras.",
    desktopOnly:
      "La vista de impresoras está disponible en la aplicación de escritorio.",
    noPrinters: "Aún no hay impresoras configuradas. Usa Añadir impresora.",
    configuredPrinters: "Impresoras configuradas",
    loadedSlots: "Ranuras cargadas",
    withAms: "Con AMS",
    noAms: "Sin AMS",
    withMmu: "Con MMU3",
    noMmu: "Sin MMU3",
    withToolheads: "Varios cabezales",
    singleToolhead: "Un cabezal",
    singleMaterialOnly: "Solo un material",
    withMultiMaterial: "Multimaterial activado",
    noMultiMaterial: "Sin multimaterial",
    noSlots: "Esta impresora no tiene ranuras configuradas.",
    slotCountOne: "ranura",
    slotCountMany: "ranuras",
    slotCount: "{count, plural, one {# ranura} other {# ranuras}}",
    showSlots: "Mostrar ranuras",
    hideSlots: "Ocultar ranuras",
    jobs: "Trabajos",
    success: "Correctos",
    failed: "Fallidos",
    used: "Consumido",
    amsSlot: "Ranura AMS",
    extSlot: "Ranura EXT",
    slot: "Ranura",
    previewWithMultiMaterial: "{model} con multimaterial",
    previewSingleMaterial: "{model} con un material",
    toolhead: "Cabezal",
    channel: "Canal",
    emptySlot: "Vaciar ranura",
    noSpoolAssigned: "Ninguna bobina asignada.",
    searchRolls: "Buscar bobinas por nombre o fabricante",
    chooseRollForSlot: "Elegir bobina para la ranura",
    availableRollsForSlot: "Bobinas disponibles para",
    searchAvailableRolls: "Buscar bobinas disponibles",
    rollResultOne: "bobina",
    rollResultMany: "bobinas",
    rollResultCount: "{count, plural, one {# bobina} other {# bobinas}}",
    clearSlotOptionHint: "Retirar la bobina actual de esta ranura",
    targetRoll: "Bobina de destino",
    targetEmpty: "Destino: ranura vacía",
    currentRoll: "Bobina actual",
    liveConnectionConnected: "Conectada en directo",
    liveConnectionIdle: "Sin actividad en directo",
    liveConnectionWaiting: "Esperando Live",
    liveTelemetryState: "Estado de la impresora",
    liveTelemetryPrinting: "Imprimiendo",
    liveTelemetryPreparing: "Preparando",
    liveTelemetryPaused: "En pausa",
    liveTelemetryActive: "Activa",
    liveTelemetryIdle: "En espera",
    liveTelemetryNozzle: "Boquilla",
    liveTelemetryBed: "Cama",
    liveTelemetryAmsHumidity: "Humedad AMS",
    liveTelemetryAmsHumidityShort: "AMS",
    liveHumidityDry: "Seco",
    liveHumidityMiddle: "Medio",
    liveHumidityWet: "Húmedo",
    liveRfid: "RFID en directo",
    liveCatalogRequiresRfid: "esperando RFID",
    manualAssignment: "Manual",
    unknownLiveRfid: "RFID no registrada",
    rfidOverridden: "RFID sustituida manualmente",
    lastKnownLive: "Último estado en directo conocido",
    waitingForLiveIdentity:
      "Se muestra la última asignación guardada hasta recibir una identidad más fiable.",
    unknownLiveRfidHint:
      "AMS informó de una identidad RFID/AMS no registrada en el inventario.",
    rfidOverriddenHint:
      "Esta ranura está asignada manualmente mientras sigue activa la misma RFID no registrada.",
    liveCandidateCurrentMatches:
      "La asignación actual coincide con el material y color en directo.",
    liveCandidateSingle:
      "Una bobina del inventario coincide con el material y color en directo.",
    liveCandidateCount: "{count} bobinas coinciden con la señal en directo.",
    liveCandidateSummary:
      "{count, plural, one {Una bobina del inventario coincide con la señal en directo.} other {# bobinas del inventario coinciden con la señal en directo.}}",
    liveRfidCandidateCurrentMatches:
      "La asignación actual parece ser esta bobina Bambu. Guarda la RFID para vincularla.",
    liveRfidCandidateSingle:
      "Una bobina del inventario parece ser esta bobina Bambu. Guarda la RFID para vincularla.",
    liveRfidCandidateSelectFirst:
      "Una bobina parece coincidir. Selecciónala antes de guardar la RFID.",
    liveRfidCandidateSelectCorrect:
      "Selecciona la bobina correcta antes de guardar la RFID.",
    liveRfidCandidateCount:
      "{count} bobinas del inventario parecen coincidir con esta bobina Bambu.",
    liveRfidCandidateSummary:
      "{count, plural, one {Una bobina parece coincidir con esta bobina Bambu. Guarda la RFID para vincularla.} other {# bobinas parecen coincidir con esta bobina Bambu.}}",
    liveCandidateCurrent: "actual",
    liveCandidateMore: "Hay más candidatas en el inventario.",
    liveCandidateHasRfid: "RFID guardada",
    liveCandidateSelectBeforeRfid: "seleccionar primero",
    liveCandidateUnavailable: "no disponible",
    registerLiveRfid: "Guardar RFID",
    liveCatalogCandidateSingle:
      "El catálogo Bambu tiene una coincidencia probable. Añádela para guardar la RFID.",
    liveCatalogCandidateCount:
      "{count} entradas del catálogo Bambu se parecen a esta bobina.",
    liveCatalogCandidateSummary:
      "{count, plural, one {El catálogo Bambu tiene una coincidencia probable. Añádela para guardar la RFID.} other {# entradas del catálogo Bambu se parecen a esta bobina.}}",
    liveCatalogCandidateMore: "Hay más candidatas en el catálogo Bambu.",
    slotOnboarding: "Registro desde AMS",
    addCatalogRollAndSaveRfid: "Añadir y guardar RFID",
    addBorrowedCatalogRollAndSaveRfid: "Añadir como prestada y guardar RFID",
    slotOnboardingOccupied:
      "Esta ranura ya tiene una bobina. Vacíala o sustitúyela mediante el flujo normal.",
    slotOnboardingOccupiedBeforeSave:
      "La ranura ahora está ocupada. Vacíala o sustituye la bobina antes de añadir otra.",
    slotOnboardingNeedsRfid:
      "Espera una identidad RFID válida del AMS antes de añadir y vincular la bobina.",
    slotOnboardingNeedsBorrowedOwner:
      "Indica quién presta la bobina antes de registrarla.",
    slotOnboardingLiveSlotUnloaded:
      "AMS ya no detecta una bobina cargada. Vuelve a abrir la acción cuando esté cargada.",
    slotOnboardingLiveIdentityChanged:
      "La identidad AMS cambió antes de guardar. Reabre la acción y confirma la bobina actual.",
    liveCatalogRequiresEmptySlot: "vaciar ranura primero",
    liveCatalogRequiresLoadedSlot: "cargar bobina primero",
    liveRfidRegisteredAndAssigned:
      "RFID guardada y bobina sugerida asignada a la ranura.",
    liveCatalogCreatedAndAssigned:
      "Se añadió {label}, se guardó la RFID y se asignó la bobina.",
    rfidOverrideDialogHint:
      "La ranura está asignada manualmente mientras AMS informa de la misma RFID no registrada.",
    rfidOverrideNothingToSave:
      "No hay una identidad RFID válida para guardar en esta ranura.",
    grams: "gramos",
    jobOptional: "Nombre del trabajo (opcional)",
    swapNoteOptional: "Nota de sustitución (opcional)",
    outgoingWeight: "Peso de salida (g)",
    incomingWeight: "Peso de entrada (g, opcional)",
    incomingWeightPromptTitle: "Definir peso de la bobina entrante",
    outgoingWeightPromptTitle: "Definir peso de la bobina saliente",
    incomingWeightPromptLabel: "Peso medido (g)",
    updateWeight: "Actualizar peso",
    applyRollChange: "Aplicar cambio de bobina",
    noPendingChanges: "No hay cambios de ranura pendientes.",
    logUse: "Registrar consumo",
    slotUpdated: "Ranura de impresora actualizada.",
    usageRecorded: "Consumo de impresión registrado.",
    error: {
      load: "No se pudo cargar la vista de impresoras.",
      updateSlot: "No se pudo actualizar la ranura.",
      outgoingWeightRequired:
        "Introduce el peso de salida antes de sustituir la bobina.",
      selectRollBeforeWeight:
        "Selecciona una bobina de destino antes de actualizar el peso.",
      invalidUsage: "El consumo debe ser mayor que cero.",
      recordUsage: "No se pudo registrar el consumo.",
      candidateAlreadyHasRfid:
        "Esta bobina ya tiene una identidad RFID guardada.",
      candidateUnavailableForRfid:
        "Actualiza los datos; la bobina ya no está disponible como candidata RFID.",
      liveSlotUnloadedBeforeSave:
        "AMS ya no detecta una bobina cargada. Actualiza y confirma la bobina actual.",
      selectCandidateBeforeRfid:
        "Selecciona primero esta bobina en la ranura antes de guardar la RFID.",
      liveRfidChangedBeforeSave:
        "La identidad AMS cambió antes de guardar. Reabre la acción.",
      createFromCatalogRequiresEmptySlot:
        "Vacía o sustituye la bobina actual antes de crear otra desde el catálogo.",
    },

    clientHostUnavailable:
      "Faltan detalles de conexión del host para este dispositivo cliente.",
    clientReadOnlyAction:
      "Este dispositivo está conectado como cliente. Utilice el host para cambios de impresora.",
    clientReadOnlyBanner:
      "Este dispositivo está vinculado como cliente. Los cambios de asignación de impresora permanecen en el host por ahora.",
    clientReadOnlyBannerPaired:
      "Este dispositivo está conectado como cliente. Los cambios en la asignación de ranuras se pueden enviar al host, mientras que la configuración de la impresora permanece allí.",
    clientReadOnlyCached:
      "El anfitrión no está disponible. Mostrando la última instantánea de la impresora almacenada en caché.",
    clientReadOnlyHost: "Anfitrión",
    clientReadOnlyOffline:
      "El host no está disponible y todavía no hay ninguna instantánea de la impresora en caché disponible.",
    clientReadOnlyUpdated: "Actualizado",
    clientWriteRequiresPairing:
      "Empareje este cliente de escritorio con el host antes de ejecutar acciones de impresora protegida.",
    liveRfidCandidateSelectionSummary:
      "{count, plural, one {Un rollo del inventario coincide con este rollo Bambu en directo. Selecciónalo antes de guardar la RFID.} other {# rollos del inventario coinciden con este rollo Bambu en directo. Selecciona el rollo correcto antes de guardar la RFID.}}",
  },
  statistics: {
    desktopOnly:
      "Las estadísticas están disponibles en la aplicación de escritorio.",
    clientReadOnlyCached:
      "El host no está disponible. Se muestran las últimas estadísticas guardadas.",
    clientReadOnlyOffline:
      "El host no está disponible y aún no hay estadísticas guardadas.",
    clientReadOnlyUpdated: "Actualizado",
    subtitle:
      "Consulta la actividad de impresoras, el consumo y los préstamos en una sola vista.",
    ownershipSnapshot: "Resumen de propiedad",
    ownershipSnapshotHint:
      "Desglose adicional del stock y consumo registrado por propiedad.",
    noBorrowedInActivity: "No hay stock de terceros ni consumo registrado",
    ownedOnHand: "Propias disponibles",
    borrowedInOnHand: "De terceros disponibles",
    ownedPrintUsage30d: "Consumo registrado · propias",
    borrowedInPrintUsage30d: "Consumo registrado · de terceros",
    ownedInUse: "Propias asignadas",
    borrowedInInUse: "De terceros asignadas",
    ownedLowStock: "Propias con poco stock",
    borrowedInLowStock: "De terceros con poco stock",
    totalConsumption: "Consumo total",
    allTime: "Todo el periodo",
    viewDetails: "Ver detalles",
    resultCountOne: "resultado",
    resultCountMany: "resultados",
    resultCount: "{count, plural, one {# resultado} other {# resultados}}",
    filteredResultCount:
      "{visible} / {total, plural, one {# resultado} other {# resultados}}",
    printerCountOne: "impresora",
    printerCountMany: "impresoras",
    printerCount: "{count, plural, one {# impresora} other {# impresoras}}",
    acrossPrinters: "En todas las impresoras",
    loggedJobs: "Trabajos registrados",
    linkedActivity: "Actividad vinculada a impresoras",
    activeAms: "Ranuras cargadas activas",
    assignedSlots: "Ranuras con bobinas asignadas",
    currentSnapshot: "Estado actual",
    failedJobs: "Trabajos fallidos",
    perPrinter: "Consumo por impresora",
    perPrinterHint:
      "Abre una impresora para ver el consumo agrupado por material.",
    loadingPrinter: "Cargando consumo de impresora...",
    noPrinterActivity: "Aún no hay actividad de impresoras.",
    consumptionByFilament: "Consumo por filamento",
    loadingFilamentBreakdown: "Cargando desglose por filamento...",
    noFilamentBreakdown: "Aún no se ha registrado consumo de filamento.",
    noFilamentFilterMatch: "Ninguna fila coincide con los filtros.",
    searchFilamentPlaceholder:
      "Buscar filamento, color, fabricante o propietario",
    searchBorrowerFilamentPlaceholder: "Buscar filamento, color o fabricante",
    filterVendor: "Fabricante",
    filterMaterial: "Material",
    sortUsedDesc: "Mayor consumo",
    sortUsedAsc: "Menor consumo",
    sortNameAsc: "Nombre (A–Z)",
    sortJobsDesc: "Más trabajos",
    resetFilters: "Restablecer filtros",
    borrowerUsage: "Consumo de préstamos por persona",
    borrowerUsageHint:
      "Abre una persona para ver los filamentos que componen su consumo.",
    borrowerBreakdownHint: "Totales de préstamos activos y completados.",
    borrowerUsageByFilament: "Consumo prestado por filamento",
    loadingLoan: "Cargando consumo de préstamos...",
    noLoanUsage: "Aún no hay consumo de préstamos registrado.",
    inboundUsage: "Consumo de bobinas de terceros por propietario",
    inboundUsageHint:
      "Abre un propietario para ver el consumo de sus filamentos.",
    inboundBreakdownHint:
      "Totales de bobinas de terceros activas y completadas.",
    inboundUsageByFilament: "Consumo de terceros por filamento",
    loadingInboundUsage: "Cargando consumo de terceros...",
    noInboundUsage: "Aún no hay consumo de terceros registrado.",
    loadingBorrowerBreakdown: "Cargando desglose del prestatario...",
    noBorrowerBreakdown: "Aún no hay consumo registrado para prestatarios.",
    loadingInboundBreakdown: "Cargando desglose del propietario...",
    noInboundBreakdown: "Aún no hay consumo registrado para propietarios.",
    noBorrowerFilterMatch: "Ninguna fila coincide con los filtros.",
    loansShort: "Préstamos",
    lentOutShort: "Salientes",
    borrowedInShort: "Entrantes",
    loggedJobsDetailTitle: "Trabajos registrados por impresora",
    failedJobsDetailTitle: "Trabajos fallidos por impresora",
    activeSlotsDetailTitle: "Ranuras cargadas activas",
    noLoggedJobsBreakdown: "Aún no hay trabajos registrados.",
    noFailedJobsBreakdown: "No hay trabajos fallidos registrados.",
    noActiveSlotsBreakdown: "No hay ranuras cargadas ahora.",
    noActiveSlotFilterMatch:
      "Ninguna ranura cargada coincide con el filtro de propiedad.",
    clientHostBreakdownOnly:
      "El desglose detallado está disponible en el host.",
    failureRate: "Tasa de fallos",
    completed: "Completados",
    error: {
      load: "No se pudieron cargar las estadísticas.",
      loadFilamentBreakdown: "No se pudo cargar el desglose de filamentos.",
      loadBorrowerBreakdown: "No se pudo cargar el desglose de prestatarios.",
      loadInboundBreakdown: "No se pudo cargar el desglose de propietarios.",
    },
  },
  settings: {
    "bambuDiscoveryTitle": "Buscar impresora Bambu",
    "bambuDiscoveryHint": "Escucha brevemente los anuncios locales de impresoras Bambu. No se envía ningún código de acceso.",
    "bambuDiscoveryFind": "Buscar impresoras Bambu",
    "bambuDiscoveryScanning": "Buscando impresoras...",
    "bambuDiscoveryListeningHint": "Esto puede tardar hasta 10 segundos mientras la impresora se anuncia.",
    "bambuDiscoveryEmpty": "No se anunció ninguna impresora Bambu en esta interfaz. Activa la impresora e inténtalo de nuevo.",
    "bambuDiscoveryUseForSetup": "Usar para la configuración",
    "bambuDiscoveryRecoverSavedAddress": "Recuperar dirección guardada",
    "bambuDiscoveryUnsavedChangesHint": "Guarda o descarta otros cambios antes de recuperar una dirección de impresora guardada.",
    "bambuDiscoveryRecoveryHint": "La dirección guardada puede recuperarse después de confiar en la identidad de esta impresora.",
    "bambuDiscoveryDifferentPrinter": "Esta no es la impresora guardada. Solo puedes usarla para una nueva configuración.",
    "bambuDiscoveryRecovered": "Se recuperó la dirección de la impresora en vivo guardada.",
    "bambuDiscoveryFailed": "No se pudieron encontrar impresoras Bambu en esta red.",
    "bambuLiveRecoveryFailed": "No se pudo recuperar la dirección de la impresora en vivo guardada.",
    updates: "Actualizaciones",
    updateCheckHint:
      "Cuando está activado, consulta GitHub automáticamente como máximo una vez al día. La descarga y la instalación siguen siendo manuales.",
    automaticUpdateChecks: "Buscar automáticamente",
    remindMeLater: "Más tarde",
    checkForUpdates: "Buscar actualizaciones",
    checkingForUpdates: "Buscando…",
    updateAvailable: "La versión {version} está disponible.",
    updateUpToDate: "La versión {version} es la última publicada.",
    updateDevelopmentBuild:
      "Esta compilación es más reciente que la última versión publicada ({version}).",
    updateCheckFailed:
      "No se pudieron buscar actualizaciones. Inténtalo de nuevo más tarde.",
    updateInfoUnavailable:
      "La información de la versión no está disponible en este momento. Inténtalo de nuevo más tarde.",
    updateChannelDisabled:
      "Esta compilación no tiene un canal público de actualizaciones. Busca versiones más recientes en el lugar desde el que descargaste la aplicación.",
    viewRelease: "Ver versión",
    tabGeneral: "General",
    tabLibrary: "Biblioteca y web app",
    tabCompanion: "Acceso desde navegador",
    tabPrinters: "Impresoras 3D",
    tabCatalog: "Catálogo de filamentos",
    tabSwatch: "Calidad de muestras",
    tabMaintenance: "Mantenimiento del programa",
    program: "Programa",
    version: "Versión",
    license: "Licencia",
    licenseHelp:
      "Filament Manager es software de código abierto. Las versiones modificadas que se distribuyan, o que se utilicen a través de una red, deben ofrecer su código fuente correspondiente bajo la misma licencia.",
    sourceCode: "Código fuente",
    viewLicense: "Ver licencia",
    viewNotices: "Avisos",
    help: "Ayuda",
    helpHint:
      "Abre el recorrido visual para ver capturas de los principales flujos de escritorio y Companion, o consulta el manual de usuario para seguirlos paso a paso.",
    productTour: "Recorrido del producto",
    userManual: "Manual de usuario",
    libraryTabTitle: "Biblioteca y aplicación web",
    libraryTabHint: "",
    libraryRoleLabel: "Función de la biblioteca",
    libraryWebappLabel: "Aplicación web",
    libraryWebappRunsOnHost: "Se ejecuta en el host",
    libraryWebappRunning: "En ejecución",
    libraryWebappToggle: "Activar aplicación web",
    librarySyncTitle: "Funciones de la biblioteca",
    librarySyncHint:
      "Elige si este dispositivo funciona solo de forma local, aloja la biblioteca compartida o se conecta a otro host.",
    librarySyncStandalone: "Independiente",
    librarySyncHost: "Host",
    librarySyncClient: "Cliente",
    librarySyncConnectTitle: "Conectar al host",
    librarySyncConnectHint:
      "Introduce primero la dirección del host. Después, compruébala antes de vincular este dispositivo.",
    librarySyncDeviceName: "Nombre del dispositivo",
    librarySyncDeviceNamePlaceholder: "PC del taller",
    librarySyncLibraryId: "ID de biblioteca",
    librarySyncHostUrl: "URL del host",
    librarySyncCheckHost: "Comprobar host",
    librarySyncChecking: "Comprobando...",
    librarySyncHostCheckOk: "Comprobación del host superada.",
    librarySyncHostCheckPairingInvalid:
      "El host está disponible, pero debe renovarse la vinculación del cliente de escritorio.",
    librarySyncLinkHost: "Vincular este dispositivo al host comprobado",
    librarySyncUseCheckedHost: "Usar este host comprobado",
    librarySyncLinkedHost:
      "Este dispositivo ya está vinculado a la biblioteca del host seleccionado.",
    librarySyncPairHost: "Vincular cliente de escritorio",
    librarySyncClientAuthTitle: "Vinculación del cliente de escritorio",
    librarySyncClientPairingFlowHint:
      "Empieza con un enlace de vinculación de corta duración creado en el host. El cliente lo utiliza para detectar, verificar y conectar automáticamente con el host correcto.",
    librarySyncClientAuthHint:
      "Pega un enlace de vinculación de corta duración del host para desbloquear las acciones protegidas de sincronización.",
    librarySyncClientAuthInput: "Enlace de vinculación",
    librarySyncClientAuthPaired: "Vinculado",
    librarySyncClientAuthNeedsRepair: "Debe volver a vincularse",
    librarySyncClientAuthUnpaired: "Sin vincular",
    librarySyncClientAuthPairedAt: "Vinculado",
    librarySyncClientAuthExpiresAt: "La sesión caduca",
    librarySyncClientAuthPersistentHint:
      "Este cliente permanece vinculado hasta que elimines la vinculación aquí o en el host.",
    librarySyncClientAuthRepairHint:
      "Si este cliente de escritorio todavía utiliza una dirección IP numérica, elimina la vinculación anterior y vuelve a vincularlo con un enlace nuevo del host.",
    cachedReused: "Caché reutilizada",
    detailFetches: "Consultas de detalle",
    librarySyncClearClientAuth: "Eliminar vinculación",
    librarySyncRenewPairing: "Renovar vinculación",
    librarySyncRenewPairingInfo:
      "Se ha borrado la vinculación guardada. Pega un enlace nuevo del host para continuar.",
    librarySyncClientAuthCleared:
      "Se ha eliminado de este dispositivo la vinculación del cliente.",
    librarySyncClientPaired:
      "Cliente de escritorio vinculado al host. Ya pueden activarse las acciones protegidas de sincronización.",
    librarySyncPairingInvalid:
      "Enlace de vinculación no válido. Crea uno nuevo en el host e inténtalo de nuevo.",
    librarySyncCurrentHost: "Host actual",
    librarySyncFetchSnapshot: "Obtener instantánea",
    librarySyncRefreshingSnapshot: "Actualizando instantánea...",
    librarySyncSnapshotRefreshed: "Instantánea del host actualizada.",
    librarySyncRemoteDevice: "Dispositivo remoto",
    librarySyncRemoteLibraryId: "ID de biblioteca remota",
    librarySyncRemoteMode: "Función remota",
    librarySyncRemoteAuth: "Modo de autenticación",
    librarySyncLastStatus: "Último estado del host",
    librarySyncLastChecked: "Última comprobación",
    librarySyncLastReachable: "Última disponibilidad",
    librarySyncCachedSnapshot: "Instantánea del host en caché",
    librarySyncNoSnapshotYet: "Aún no hay ninguna instantánea en caché",
    librarySyncNoSnapshotHint:
      "Obtén una instantánea del host para mantener aquí una pequeña vista de solo lectura.",
    librarySyncStatusLive: "En directo",
    librarySyncStatusCached: "En caché",
    librarySyncStatusOffline: "Sin conexión",
    librarySyncSnapshotCapturedAt: "Capturada",
    librarySyncSnapshotTotalSpools: "Rollos totales",
    librarySyncSnapshotInUse: "En uso",
    librarySyncSnapshotAssigned: "Asignados",
    librarySyncSnapshotLowStock: "Pocas existencias",
    librarySyncSnapshotLoans: "Préstamos activos",
    librarySyncSnapshotPrinters: "Impresoras",
    librarySyncAdvancedTitle: "Detalles avanzados del host",
    librarySyncAdvancedHint:
      "Abre esta sección solo cuando necesites diagnósticos o detalles de la instantánea en caché.",
    librarySyncShowAdvanced: "Mostrar detalles",
    librarySyncHideAdvanced: "Ocultar detalles",
    librarySyncStandaloneHint:
      "Este dispositivo continúa utilizando únicamente su biblioteca local.",
    librarySyncStandaloneWebappHint:
      "Este dispositivo conserva su propia biblioteca local y también sirve desde aquí la aplicación web.",
    librarySyncHostHint:
      "Este dispositivo está preparado para alojar la biblioteca de otros clientes de escritorio o navegador.",
    librarySyncClientHint:
      "Este dispositivo se conecta a otro host y mantiene una caché alternativa de solo lectura cuando el host no está disponible.",
    librarySyncRoleChangeValidateImportHint:
      "Valida aquí la misma copia de seguridad. Podrás importarla después desde Mantenimiento del programa en el dispositivo que deba continuar con la biblioteca.",
    librarySyncRoleChangeAutoValidatedHint:
      "La última copia exportada se ha validado automáticamente en este flujo guiado.",
    librarySyncRoleChangeClientLocalHint:
      "Este cliente normalmente utiliza la biblioteca de un host. Si quieres continuar localmente, puedes exportar una copia completa en el host actual e importarla después desde Mantenimiento del programa.",
    librarySyncRoleChangeClientToHostHint:
      "Este cliente se convertirá en su propio host. Si después quieres trasladar los datos del host actual, crea allí una copia completa e impórtala desde Mantenimiento del programa en este dispositivo.",
    librarySyncRoleChangeClientHint:
      "El modo cliente necesita una conexión con un host. Después del cambio, utiliza Vinculación del cliente de escritorio para conectar este dispositivo al host que quieras usar.",
    librarySyncConfirmSwitchToStandalone: "Cambiar a Independiente",
    librarySyncConfirmSwitchToClient: "Cambiar a Cliente",
    librarySyncConfirmSwitchToHost: "Cambiar a Host",
    librarySyncConfirmAgain: "Haz clic de nuevo para confirmar",
    librarySyncConfirmArmedHint:
      "Un clic más confirmará este cambio de función.",
    librarySyncMigrationStepExport:
      "Exportar una copia completa desde el host actual",
    librarySyncMigrationStepExportHint:
      "Utiliza el botón de exportación de abajo antes de importar en el siguiente equipo.",
    librarySyncMigrationStepImport:
      "Importar la copia completa en este dispositivo",
    librarySyncMigrationStepImportHint:
      "Importa aquí la copia del host antes de que este dispositivo asuma el control.",
    librarySyncStepDone: "Hecho",
    librarySyncStepPending: "Pendiente",
    librarySyncOpenMaintenance: "Abrir herramientas de mantenimiento",
    librarySyncSaveHint:
      "Los cambios de función abren un flujo guiado. No se guarda nada hasta que confirmes.",
    librarySyncSave: "Guardar función de biblioteca",
    librarySyncSaving: "Guardando...",
    librarySyncSaved: "Ajustes de función de biblioteca guardados.",
    librarySyncSaveDeviceName: "Guardar nombre del dispositivo",
    librarySyncDeviceNameUnsaved: "Cambios sin guardar",
    librarySyncDeviceNameSavedStatus: "Guardado",
    librarySyncDeviceNameSaved: "Nombre del dispositivo guardado.",
    companionTitle: "Companion del navegador local",
    companionHelp:
      "Abre la interfaz del navegador servida por la aplicación de escritorio en el mismo equipo. Incluye la vista del inventario, enlaces directos a rollos, registro, edición y devolución manual de material recibido, vista de impresoras, revisión e historial de préstamos enviados con devolución directa, detalle del rollo, cambios limitados de estado y ubicación, actualización manual del peso, asignación y liberación básicas de ranuras y creación de préstamos para el rollo seleccionado, mientras el escritorio sigue siendo la fuente de verdad.",
    companionRefreshStatus: "Actualizar estado",
    companionCopyShellUrl: "Copiar URL de la interfaz",
    companionCopyLaunchLink: "Copiar enlace de apertura",
    companionOpenBrowser: "Abrir en el navegador",
    companionStatus: "Estado de Companion",
    companionStatusRunning: "En ejecución",
    companionStatusUnreachable: "No responde",
    companionStatusStopped: "Detenido",
    companionStatusHint:
      "La API de bucle local y la interfaz web están alojadas por el proceso de escritorio.",
    companionShellUrl: "URL de la interfaz",
    companionShellUrlHint:
      "Servida localmente por la aplicación de escritorio.",
    companionShellUrlCopied: "URL de Companion copiada.",
    companionAuth: "Autenticación",
    companionMode: "Alcance",
    companionSourceOfTruth: "Fuente de verdad",
    companionSourceOfTruthValue: "Aplicación de escritorio + SQLite",
    companionSourceOfTruthHint:
      "Los flujos del navegador pasan por el límite de servicio y API controlado por el escritorio, sin acceder directamente a SQLite.",
    companionScope: "Alcance actual del navegador",
    companionScopeValue:
      "Vista del inventario, enlaces directos a rollos, registro, edición y devolución manual de material recibido, vista de impresoras, revisión e historial de préstamos enviados con devolución directa, detalle del rollo, cambios limitados de estado y ubicación, actualización manual del peso, asignación y liberación básicas de ranuras y creación de préstamos para el rollo seleccionado.",
    companionBoundaries: "Límites reservados al escritorio",
    companionBoundariesValue:
      "La actualización del catálogo, la importación, exportación y restauración, la sustitución de ranuras ocupadas y los flujos administrativos más amplios siguen realizándose en la aplicación de escritorio.",
    trustedLanTitle: "Acceso desde navegador en la LAN de confianza",
    trustedLanHelp:
      "Activa el acceso desde navegador en una única interfaz de red privada. La aplicación de escritorio mantiene el control.",
    trustedLanServerTitle: "Servidor de la aplicación web",
    trustedLanServerControl: "Control del servidor",
    trustedLanRefreshStatus: "Actualizar estado",
    trustedLanStatus: "Estado de la LAN de confianza",
    trustedLanStatusDisabled: "Desactivado de forma predeterminada",
    trustedLanStatusStarting: "Iniciando...",
    trustedLanStateChecking: "Comprobando",
    trustedLanStateOff: "Apagado",
    trustedLanStateLive: "En directo",
    trustedLanStateNeedsAttention: "Revisar",
    trustedLanCompactNetworkHint:
      "La aplicación web se ejecuta en una interfaz LAN privada seleccionada. Abre los detalles de red solo cuando los necesites.",
    trustedLanNetworkDetails: "Detalles de red",
    trustedLanShowNetwork: "Mostrar red",
    trustedLanHideNetwork: "Ocultar red",
    trustedLanHideNetworkSummary: "Ocultar red",
    trustedLanHideNetworkDetails: "Ocultar detalles de red",
    trustedLanEnableLabel:
      "Activar el acceso desde navegador en la interfaz seleccionada",
    trustedLanQuickToggleHint:
      "Se ejecuta solo en la interfaz privada seleccionada.",
    trustedLanQuickToggleDisabledHint:
      "Aún no hay disponible ninguna interfaz LAN privada.",
    trustedLanToggleOn: "Activar",
    trustedLanToggleOff: "Desactivar",
    trustedLanToggleBusy: "Guardando...",
    trustedLanEnabledInfo: "Servidor de la aplicación web activado.",
    trustedLanEnabledPendingInfo:
      "El servidor de la aplicación web se está iniciando. Actualiza el estado si tarda unos instantes.",
    trustedLanDisabledInfo: "Servidor de la aplicación web desactivado.",
    trustedLanStartingInfo: "Iniciando el servidor de la aplicación web...",
    trustedLanStatusHintDisabled:
      "La aplicación web permanece apagada hasta que la actives aquí.",
    trustedLanStatusHintEnabled:
      "El servidor está activado y permanece vinculado a una única interfaz privada seleccionada.",
    trustedLanStatusHintRunning:
      "El servidor de la aplicación web está activo en la interfaz privada seleccionada.",
    trustedLanInterface: "Interfaz seleccionada",
    trustedLanInterfaceNotSelected: "Sin seleccionar",
    trustedLanInterfaceHintDisabled:
      "No se expone ninguna interfaz LAN mientras el modo de LAN de confianza está desactivado.",
    trustedLanInterfaceHintEnabled:
      "Se vincula únicamente a una interfaz privada.",
    trustedLanShellUrl: "URL de la LAN",
    trustedLanStableAddress: "Dirección local estable",
    trustedLanDirectAddress: "Dirección directa actual",
    trustedLanStableAddressUnavailable:
      "No disponible hasta que el nombre local estable esté activo",
    trustedLanDirectAddressHint:
      "Dirección de diagnóstico para la IP seleccionada actualmente. Puede cambiar si la red no reserva una dirección para este equipo.",
    trustedLanLocalNameUnavailable: "Dirección local estable no disponible",
    trustedLanLocalNameUnavailableHint:
      "La aplicación web funciona en su IP actual, pero la vinculación y los enlaces QR permanentes permanecen desactivados hasta que la dirección local estable esté disponible.",
    trustedLanUrlUnavailable:
      "No disponible hasta activar el modo de LAN de confianza",
    trustedLanUrlHintDisabled:
      "No se expone ninguna URL de LAN mientras el modo de LAN de confianza está desactivado.",
    trustedLanUrlHintEnabled:
      "Utiliza esta URL exacta para vincular dispositivos en tu red de confianza.",
    trustedLanConfigTitle: "Red",
    trustedLanConfigBody:
      "Elige la interfaz privada y el puerto que debe utilizar la aplicación web.",
    trustedLanEditNetwork: "Editar red",
    trustedLanCloseNetworkEditor: "Cerrar editor",
    trustedLanNetworkInterface: "Interfaz de red (IP)",
    trustedLanInterfaceSelect: "Interfaz privada",
    trustedLanNoInterfaces: "No se han detectado interfaces IPv4 privadas",
    trustedLanPort: "Puerto",
    trustedLanPortInput: "Puerto de escucha",
    trustedLanWebappPort: "Puerto de la aplicación web",
    trustedLanPortHint:
      "Mantén el puerto estable para que los enlaces de vinculación sean previsibles.",
    trustedLanSave: "Guardar red",
    trustedLanConfigSaved:
      "Ajustes de Companion en la LAN de confianza guardados.",
    trustedLanNetworkSaved: "Ajustes de red de la aplicación web guardados.",
    trustedLanBindTitle: "Vinculado solo a la interfaz",
    trustedLanBindBody:
      "Se vincula a una interfaz privada explícita, nunca a 0.0.0.0.",
    trustedLanOrigin: "Origen",
    trustedLanAuth: "Autenticación",
    trustedLanAuthPairing: "Vinculación por navegador",
    trustedLanAuthHint:
      "Vinculación independiente por navegador con cookies, renovación y comprobaciones CSRF.",
    trustedLanWarningTitle: "El tráfico de la LAN de confianza no está cifrado",
    trustedLanWarningBody:
      "Úsalo solo en una red de confianza. La vinculación protege el acceso, pero cualquier persona en esa red puede leer el tráfico.",
    trustedLanPairingNoteTitle:
      "Autenticación solo para navegadores personales",
    trustedLanPairingNoteBody:
      "Acceso exclusivo desde navegador, sin rutas para la ingesta de dispositivos.",
    trustedLanPairingTitle: "Vinculación del acceso desde navegador",
    trustedLanPairingBody:
      "Crea un enlace o QR de corta duración para un único navegador cada vez.",
    trustedLanPairingLabelInput: "Nombre del navegador",
    trustedLanPairingLabelHint:
      "Opcional. Ayuda a reconocer el navegador posteriormente en la lista de dispositivos vinculados.",
    trustedLanPairingLabelPlaceholder:
      "Safari del iPad, teléfono de la cocina, MacBook del taller...",
    trustedLanPairingLabelMeta: "Navegador",
    trustedLanPairingLabelEmpty: "Sin nombre",
    trustedLanCreatePairing: "Crear enlace de vinculación",
    trustedLanCreateAnotherPairing: "Crear otro enlace",
    trustedLanLatestPairing: "Último enlace de vinculación",
    trustedLanPairingReady: "Enlace de vinculación listo",
    trustedLanPairingEmpty:
      "Crea un enlace de vinculación para mostrarlo aquí.",
    trustedLanPairingEmptyState:
      "Crea un enlace cuando quieras abrir la aplicación web en otro dispositivo.",
    trustedLanPairingExpiresAt: "Caduca el",
    trustedLanCopyPairing: "Copiar enlace de vinculación",
    trustedLanPairingCopied:
      "Enlace de vinculación de la LAN de confianza copiado.",
    trustedLanPairingCreated: "Enlace de vinculación creado y copiado.",
    trustedLanPairingQrTitle: "QR de vinculación",
    trustedLanPairingQrAlt: "QR de vinculación de la LAN de confianza",
    trustedLanPairingQrHint:
      "Crea un enlace de vinculación para generar la vista previa del QR.",
    trustedLanPairingQrLoading: "Generando vista previa del QR...",
    trustedLanPairingQrUnavailable:
      "La vista previa del QR no está disponible en esta compilación. El enlace de vinculación sigue funcionando.",
    trustedLanPairingQrScanTitle:
      "Escanea desde el navegador que quieras vincular",
    trustedLanPairingQrScanBody:
      "Escanéalo con el navegador que quieras vincular. El enlace es de corta duración y de un solo uso.",
    trustedLanBrowsersTitle: "Navegadores vinculados",
    trustedLanBrowsersBody:
      "Revoca un navegador para impedir renovaciones y cerrar sus sesiones actuales.",
    trustedLanBrowsersEmpty:
      "Aún no se ha vinculado ningún navegador en la LAN de confianza.",
    trustedLanNoActiveBrowsers:
      "No hay navegadores autorizados en este momento.",
    trustedLanAuthorized: "Autorizado",
    trustedLanActive: "Activo",
    trustedLanRecentlyActive: "Activo recientemente",
    trustedLanBrowserWaiting: "Esperando la primera renovación",
    trustedLanUnnamedBrowser: "Navegador vinculado",
    trustedLanPairedAt: "Vinculado",
    trustedLanLastSeen: "Última actividad",
    trustedLanRevoke: "Revocar",
    trustedLanRevokeBrowserAria: "Revocar el acceso del navegador {name}",
    trustedLanConfirmRevokeBrowser:
      "¿Revocar el acceso de {name}? Sus sesiones actuales se cerrarán y el navegador deberá volver a vincularse.",
    trustedLanConfirmRevokeBrowserAria:
      "Confirmar la revocación del acceso de {name}",
    trustedLanCancelRevokeBrowserAria:
      "Cancelar la revocación del acceso de {name}",
    trustedLanConfirmRevokeAction: "Confirmar revocación",
    trustedLanCancelRevokeAction: "Cancelar",
    trustedLanRevokeAll: "Revocar todos",
    trustedLanRevokeAllWithCount: "Revocar todos ({count})",
    trustedLanRevokeAllAria:
      "Revocar el acceso de los {count} navegadores autorizados",
    trustedLanConfirmRevokeAll:
      "¿Revocar el acceso de todos los navegadores autorizados ({count})? Sus sesiones actuales se cerrarán y todos deberán volver a vincularse.",
    trustedLanConfirmRevokeAllAction: "Confirmar todas las revocaciones",
    trustedLanConfirmRevokeAllAria:
      "Confirmar la revocación de todos los navegadores autorizados",
    trustedLanCancelRevokeAllAria:
      "Cancelar la revocación de todos los navegadores autorizados",
    trustedLanRevoked: "Revocado",
    trustedLanRevokedHistory: "Historial de revocaciones",
    trustedLanRevokedHistoryBody:
      "Mantén esta sección cerrada salvo que necesites auditar accesos anteriores desde navegadores.",
    trustedLanShowRevoked: "Mostrar {count} revocados",
    trustedLanHideRevoked: "Ocultar {count} revocados",
    trustedLanBrowserPairedDetected:
      "Se ha conectado un navegador vinculado nuevo.",
    trustedLanBrowserRevoked: "Navegador de la LAN de confianza revocado.",
    trustedLanAllBrowsersRevoked:
      "Se han revocado todos los navegadores de la LAN de confianza.",
    subtitle:
      "Gestiona el acceso del navegador, las impresoras, los catálogos y el mantenimiento.",
    desktopOnly:
      "Los ajustes solo están disponibles en la aplicación de escritorio.",
    language: "Idioma",
    languageHint:
      "Elige el idioma de todas las vistas principales de la aplicación.",
    appearance: "Apariencia",
    light: "Claro",
    dark: "Oscuro",
    auto: "Automático (sistema)",
    autoHint:
      "El modo automático sigue la preferencia clara u oscura del sistema.",
    printerModel: "Modelo de impresora",
    selectPrinterModel: "Seleccionar modelo de impresora",
    printerName: "Nombre de la impresora",
    addNewPrinter: "Añadir nueva impresora",
    addPrinter: "Añadir impresora",
    reconfigure: "Reconfigurar",
    showObservedDetails: "Mostrar detalles observados y captura",
    hideObservedDetails: "Ocultar detalles observados",
    saveReconfigure: "Guardar cambios",
    printerUnsavedChanges: "Cambios sin guardar",
    printerNoChanges: "No hay cambios que guardar",
    printerDiscardTitle: "¿Descartar los cambios de la impresora?",
    printerDiscardHint:
      "Los cambios se perderán y la impresora conservará su configuración actual.",
    printerKeepEditing: "Seguir editando",
    printerDiscardChanges: "Descartar cambios",
    amsUnits: "Unidades AMS",
    slotsPerAms: "Ranuras por AMS",
    mmuUnits: "Unidades MMU3",
    toolheadGroups: "Grupos de cabezales",
    filamentsPerMmu: "Filamentos por MMU3",
    toolheads: "Cabezales",
    multiUnits: "Unidades multimaterial",
    slotsPerUnit: "Ranuras por unidad multimaterial",
    columnsHint:
      "Elige modelo, nombre y capacidad multimaterial. EXT permanece disponible automáticamente.",
    bambuLiveSection: "Estado Live Bambu",
    bambuLiveTitle: "Bambu Live",
    bambuLiveAddHint: "Conéctate ahora para ver el estado de la impresora, las ranuras AMS, las temperaturas y el consumo de impresión. También puedes omitir este paso y configurarlo más tarde.",
    bambuLiveEnable: "Activar Bambu Live",
    bambuLiveLocalOnly: "Se conecta directamente a la impresora en tu red local.",
    addPrinterWithLive: "Añadir impresora con Live",
    bambuLiveHint:
      "Integración local opcional y de solo lectura para observar la impresora y AMS.",
    enableBambuLive: "Activar estado en directo",
    bambuLiveStandaloneOnly:
      "El estado Live Bambu se configura en el equipo host.",
    bambuLiveHost: "Host / IP de la impresora",
    bambuLiveAccessCode: "Código de acceso",
    bambuLivePrinterSerial: "Número de serie de la impresora",
    bambuLiveCredentialsNote:
      "Los códigos de acceso se guardan en el almacén seguro de credenciales del sistema operativo.",
    bambuTlsCheckCurrent: "Comprobar identidad",
    bambuLiveAccessCodeSaved: "Código de acceso guardado de forma segura",
    bambuLiveAccessCodeMissing: "No hay ningún código de acceso guardado",
    bambuLiveAccessCodeSavedPlaceholder:
      "Guardado de forma segura — introduce un código nuevo para reemplazarlo",
    bambuLiveAccessCodeReplacePending:
      "El código de acceso guardado se reemplazará cuando guardes.",
    bambuLiveAccessCodeSavePending:
      "El código de acceso se guardará de forma segura cuando guardes.",
    bambuLiveAccessCodeClear: "Eliminar código guardado",
    bambuLiveAccessCodeClearPending:
      "El código de acceso guardado se eliminará cuando guardes. Las conexiones en directo se pausarán hasta que introduzcas un código nuevo.",
    bambuLiveAccessCodeKeep: "Conservar código guardado",
    bambuLiveAccessCodeHostConfigured:
      "Hay un código de acceso guardado en el equipo host.",
    bambuLiveAccessCodeHostMissing:
      "No hay ningún código de acceso guardado en el equipo host.",
    bambuTlsTrustTitle: "Identidad de la impresora",
    bambuTlsTrustTrusted: "De confianza",
    bambuTlsTrustUnpaired: "Aún no es de confianza",
    bambuTlsTrustChanged: "La identidad ha cambiado",
    bambuTlsTrustPending: "Confianza pendiente",
    bambuTlsClearPending: "Retirada de confianza pendiente",
    bambuTlsTrustTrustedHint:
      "El certificado de la impresora coincide con la identidad guardada.",
    bambuTlsTrustUnpairedHint:
      "El código de acceso no se enviará hasta que confíes explícitamente en esta identidad de impresora.",
    bambuTlsTrustChangedHint:
      "La identidad de la impresora ha cambiado. La conexión se detuvo antes de enviar el código de acceso.",
    bambuTlsTrustPendingHint:
      "Se confiará en esta identidad de impresora cuando guardes.",
    bambuTlsClearPendingHint:
      "La confianza se retirará cuando guardes. Las conexiones en directo permanecerán bloqueadas hasta que vuelvas a confiar en la impresora.",
    bambuTlsFingerprint: "Huella digital del certificado",
    bambuTlsFingerprintUnavailable:
      "Guarda o comprueba la conexión con la impresora para leer su identidad.",
    bambuTlsTrustCurrent: "Confiar en esta identidad",
    bambuTlsRetrustCurrent: "Confiar en la nueva identidad",
    bambuTlsForget: "Olvidar identidad de confianza",
    bambuTlsUndoTrustChange: "Deshacer cambio de confianza",
    bambuLiveDisabledNote:
      "Déjalo desactivado para mantener sin cambios el flujo actual.",
    activePrinter: "Impresora activa",
    noActivePrinter: "Ninguna impresora activa",
    current: "Actual",
    maintenance: "Mantenimiento",
    backupTitle: "Copia de seguridad",
    latestFullBackupExportOnDevice: "Última exportación de copia de seguridad completa en este dispositivo",
    noFullBackupExportRecordedOnDevice: "Aún no se ha registrado ninguna exportación de copia de seguridad completa en este dispositivo",
    backupDescription:
      "Exporta una copia de seguridad JSON completa con el inventario, el historial y las impresoras configuradas.",
    applicationDiagnosticsTitle: "Diagnóstico de la aplicación",
    applicationDiagnosticsDescription: "Comprueba el estado de la base de datos local y descarga un archivo de soporte depurado, sin contenido del inventario ni credenciales.",
    diagnosticsHealthy: "Correcto",
    diagnosticsNeedsAttention: "Requiere atención",
    diagnosticsUnavailable: "Base de datos no disponible",
    diagnosticsRefreshFailed: "No se pudo actualizar el diagnóstico de la aplicación.",
    diagnosticsLastGoodVisible: "El último resultado correcto sigue visible.",
    diagnosticsSchema: "Esquema actual / compatible",
    diagnosticsDatabaseSize: "Tamaño de la base de datos",
    diagnosticsQuickCheck: "Comprobación rápida",
    diagnosticsForeignKeyCheck: "Comprobación de claves foráneas",
    diagnosticsJournalMode: "Modo de diario",
    diagnosticsLocalPath: "Ruta local de la base de datos",
    diagnosticsCheckOk: "Superada",
    diagnosticsCheckIssues: "Se encontraron problemas",
    diagnosticsCheckUnavailable: "No disponible",
    diagnosticsDownloadSupport: "Descargar archivo de soporte depurado",
    diagnosticsSupportDownloaded: "Archivo de soporte depurado descargado.",
    diagnosticsSupportDownloadFailed: "No se pudo descargar el archivo de soporte depurado.",
    clientHostOnlyMaintenance:
      "Este dispositivo es un cliente. La copia de seguridad completa se exporta desde el host vinculado. Las importaciones, los restablecimientos y las reparaciones deben realizarse en el host para mantener la biblioteca en un único lugar.",
    clientHostBackupRequiresPairing:
      "Vincula este cliente con el host antes de exportar una copia de seguridad completa del host.",
    exportFullBackup: "Exportar copia de seguridad completa (JSON)",
    importDataFile: "Importar archivo de copia o datos",
    importFullBackup: "Importar copia de seguridad completa",
    validateBackup: "Validar archivo de copia de seguridad",
    exportInventoryCsv: "Exportar inventario en CSV",
    exportInventoryJson: "Exportar inventario en JSON",
    resetSectionTitle: "Reparación y limpieza",
    resetCatalogs: "Reparar catálogo",
    resetCatalogsHint:
      "Restaura el catálogo de filamentos incluido, conserva los proveedores históricos y elimina solo las entradas no incluidas que no estén en uso.",
    resetCatalogsList1:
      "Conserva el catálogo incluido y las entradas vinculadas al inventario o a la lista de deseos.",
    resetCatalogsList2:
      "Elimina solo las entradas no incluidas que no estén en uso.",
    resetCatalogsList3:
      "Vuelve a importar las entradas incluidas que falten y repara sus metadatos.",
    resetApp: "Restablecer datos de la aplicación",
    resetHint:
      "El restablecimiento borra el inventario, el historial de estadísticas, las asignaciones de impresora, la lista de deseos y los navegadores vinculados en la LAN de confianza.",
    resetAppList1:
      "Borra los rollos del inventario y su historial de ciclo de vida.",
    resetAppList2:
      "Borra las asignaciones de impresora, las estadísticas de impresión, la lista de deseos y las sesiones de navegador vinculadas en la LAN de confianza.",
    resetAppList3:
      "Conserva las entradas del catálogo principal y los datos de muestras.",
    addedPrinter: "Impresora añadida",
    updatedPrinter: "Impresora actualizada",
    removedPrinter: "Impresora eliminada",
    activeUpdated: "Impresora activa actualizada.",
    activeCleared: "Impresora activa desactivada.",
    resetDone: "Se han restablecido los datos de la aplicación.",
    catalogResetDone: "Catálogo reparado",
    backupExported:
      "Copia de seguridad completa exportada (inventario, historial e impresoras).",
    librarySyncBackupAutoValidated:
      "La copia exportada se ha validado automáticamente y está lista para el cambio guiado de función.",
    backupImported: "Copia de seguridad completa importada correctamente.",
    librarySyncImportedOnClientHint:
      "Este dispositivo ya está preparado como próximo host. Revisa las funciones de biblioteca y guarda cuando quieras asumir el control.",
    inventoryImportDone: "Importación del inventario completada.",
    importSource: "Origen",
    importDetectedInventoryCsv: "CSV de inventario",
    importDetectedInventoryJson: "JSON de inventario",
    backupValidationDone: "Validación de la copia de seguridad completada.",
    backupValidationSummary: "Resumen de validación de la copia de seguridad",
    validationStatusOk: "Totalmente compatible",
    validationStatusWarn: "Contiene avisos",
    validationFormat: "Formato",
    validationTables: "Tablas",
    validationRows: "Filas",
    validationMissingTables: "Tablas ausentes",
    validationExtraTables: "Tablas adicionales",
    inventoryCsvExported: "Inventario CSV exportado.",
    inventoryJsonExported: "Inventario JSON exportado.",
    totalCatalog: "Catálogo",
    missingSwatches: "Muestras ausentes",
    backupExportGroup: "Copia de seguridad y exportación",
    backupImportGroup: "Importación y validación",
    noBackupValidationYet:
      "Valida aquí un archivo de copia de seguridad para comprobar su compatibilidad antes de importarlo.",
    inventoryOverviewPrint: "Hojas de etiquetas del inventario",
    inventoryOverviewPrintHint:
      "Crea hojas de etiquetas QR para todos los rollos disponibles con el mismo diseño legible de 60 × 24 mm que las etiquetas individuales.",
    inventoryOverviewPrintAction: "Crear hoja de etiquetas del inventario",
    inventoryOverviewBuilderTitle: "Crear hoja de etiquetas del inventario",
    inventoryOverviewBuilderSubtitle:
      "Elige el formato del papel, revisa las páginas y guarda un PDF listo para imprimir.",
    inventoryOverviewPaperFormat: "Formato del papel",
    inventoryOverviewPaperA4: "A4",
    inventoryOverviewPaperA4Hint: "210 × 297 mm",
    inventoryOverviewPaperLetter: "US Letter",
    inventoryOverviewPaperLetterHint: "8,5 × 11 pulg. · 216 × 279 mm",
    inventoryOverviewPreview: "Vista previa de la hoja",
    inventoryOverviewRendering: "Preparando las hojas de etiquetas...",
    inventoryOverviewEmpty: "No hay rollos disponibles que incluir.",
    inventoryOverviewLabelCount: "{count} etiquetas · {perPage} por página",
    inventoryOverviewPerPage: "etiquetas por página",
    inventoryOverviewSingleLabelHint:
      "¿Solo necesitas una etiqueta? Abre el rollo en Inventario y elige Crear etiqueta QR.",
    inventoryOverviewPageCount: "Página {page} de {pages}",
    inventoryOverviewPreviousPage: "Página anterior",
    inventoryOverviewNextPage: "Página siguiente",
    inventoryOverviewPrintSave: "Guardar PDF en Descargas",
    inventoryOverviewPrintSaving: "Guardando PDF...",
    inventoryOverviewPrintDone:
      "PDF de etiquetas del inventario guardado en Descargas: {path}",

    autofillVisibleSwatches:
      "Rellenar automáticamente muestras faltantes visibles",
    bambuLiveAmsLabel: "AMS",
    bambuLiveAmsReading:
      "Actualización de AMS en curso. RFID y la coincidencia de bandejas pueden parecer temporalmente inciertas hasta que finaliza la lectura.",
    bambuLiveAmsWeightBasis: "Base de rollo AMS",
    bambuLiveAmsWeightEstimate: "Estimación de AMS",
    bambuLiveBadge: "En directo",
    bambuLiveCandidateCount: "candidatos",
    bambuLiveCandidateNoRfidSaved: "No se guardó ningún RFID",
    bambuLiveCandidateRfidSaved: "RFID guardado",
    bambuLiveCaptureLastUpdate: "Último capturado",
    bambuLiveCapturePaused: "La captura está en pausa",
    bambuLiveCapturePausedHint:
      "La sesión actual se congela hasta que comiences la captura nuevamente.",
    bambuLiveCaptureRunning: "La captura se está ejecutando",
    bambuLiveCaptureRunningHint:
      "Las ráfagas en vivo entrantes se están recopilando en esta sesión ahora.",
    bambuLiveCaptureSeededFrom: "Sembrado desde estado vivo",
    bambuLiveCaptureStarted: "Captura iniciada",
    bambuLiveCaptureWaiting:
      "Esperando actualizaciones de campo en vivo. Inicie una impresión o deje que la impresora informe más datos mientras este panel está abierto.",
    bambuLiveCapturedFieldCount: "Campos capturados en esta sesión",
    bambuLiveCapturedGroupCaption: "Campos en vivo capturados",
    bambuLiveCapturedTable: "Campos en vivo capturados",
    bambuLiveCatalogCandidate: "Catálogo Bambu",
    bambuLiveCatalogCandidateCount: "entradas de catalogo",
    bambuLiveCatalogLikelyMatch:
      "Única coincidencia probable del catálogo Bambu en cuanto a material y color vivo.",
    bambuLiveCatalogMultipleMatches:
      "Varias entradas del catálogo Bambu podrían coincidir con este filamento.",
    bambuLiveChangedFields: "Campos modificados",
    bambuLiveChartFieldLabel: "Campo de gráfico",
    bambuLiveChartHint:
      "Elija un campo numérico para trazar solo los valores capturados en esta sesión.",
    bambuLiveChartLatest: "El último",
    bambuLiveChartNoFields:
      "Aún no hay campos numéricos listos para el gráfico",
    bambuLiveChartNoSamples:
      "Aún no hay muestras numéricas para el campo seleccionado.",
    bambuLiveChartRange: "Rango",
    bambuLiveChartTitle: "Gráfico de captura",
    bambuLiveChartWindow: "Muestras en la ventana de captura",
    bambuLiveConfiguredHost: "Host configurado",
    bambuLiveConfiguredSerial: "Serie de impresora configurada",
    bambuLiveConnected: "Conectado",
    bambuLiveCopyRawPayload: "Copiar carga útil",
    bambuLiveDiagnostics: "Diagnóstico",
    bambuLiveDisconnected: "No conectado",
    bambuLiveExportCsv: "Exportar CSV",
    bambuLiveExternalSlotLabel: "Ranura externa",
    bambuLiveFieldCadence: "Intervalo promedio visto",
    bambuLiveFieldChangeCadence: "Intervalo de cambio promedio",
    bambuLiveFieldChanges: "Cambios",
    bambuLiveFieldCount: "Campos de nivel superior observados",
    bambuLiveFieldPath: "Campo",
    bambuLiveFieldRecentValues: "Valores recientes",
    bambuLiveFieldResultCount:
      "{count, plural, one {# campo} other {# campos}}",
    bambuLiveFieldResultMany: "campos",
    bambuLiveFieldResultOne: "campo",
    bambuLiveFieldUpdated: "visto por última vez",
    bambuLiveFieldValue: "Valor",
    bambuLiveFilterAll: "Filtro: Todos",
    bambuLiveFilterChanged: "Filtro: campos modificados",
    bambuLiveFilterFrequent: "Filtro: Alta frecuencia",
    bambuLiveFilterLabel: "Filtrar campos capturados",
    bambuLiveFilterRecent: "Filtro: Visto en el último minuto",
    bambuLiveGroupAms: "AMS",
    bambuLiveGroupOther: "Otro",
    bambuLiveGroupPrint: "Impresión y estado",
    bambuLiveGroupTray: "Bandeja y chip",
    bambuLiveIdentitySignals: "Señales de identidad",
    bambuLiveInventoryLikelyMatch:
      "Una única coincidencia probable de inventario entre el material y el color vivo.",
    bambuLiveInventoryMultipleMatches:
      "Varios rollos de inventario podrían coincidir con este filamento.",
    bambuLiveInventoryNoMatch:
      "Aún no hay una coincidencia clara de inventario.",
    bambuLiveInventoryNoRfidMatch:
      "La identidad observada de RFID/AMS no coincide con nada en el inventario.",
    bambuLiveInventoryRfidMatch:
      "Coincidencia exacta de identidad RFID/AMS con el inventario.",
    bambuLiveLastSeen: "visto por última vez",
    bambuLiveMatchNoteConfiguredMismatch:
      "La última identidad conocida de RFID/AMS no coincide claramente con el rollo configurado actualmente.",
    bambuLiveMatchNoteDuplicateIdentity:
      "Varios rollos de inventario comparten esta identidad RFID/AMS guardada.",
    bambuLiveMatchNoteDuplicateTrayIndex:
      "Varias ranuras configuradas comparten este índice de bandeja.",
    bambuLiveMatchNoteExact:
      "Coincidencia exacta de identidad RFID/AMS con el inventario.",
    bambuLiveMatchNoteLastKnownGood:
      "Mostrando la última identidad buena conocida de RFID/AMS hasta que llegue una actualización más sólida.",
    bambuLiveMatchNoteMultipleStoredMatch:
      "Múltiples rollos almacenados podrían coincidir con esta bandeja activa.",
    bambuLiveMatchNoteNoStoredMatch:
      "Ningún rollo guardado coincide claramente con esta última identidad conocida de RFID/AMS.",
    bambuLiveMatchNoteOneStoredMatch:
      "Es probable que un rollo guardado coincida con esta última identidad conocida de RFID/AMS.",
    bambuLiveMatchNotePresetSignal:
      "Ajuste preestablecido del filamento: {preset}. Es una pista del material o la configuración, no la identidad del rollo.",
    bambuLiveMatchNoteUnknownIdentity:
      "AMS informó una identidad RFID/AMS que no está registrada en el inventario.",
    bambuLiveMoreInventoryCandidates:
      "Existen más rollos coincidentes en el inventario.",
    bambuLiveMqttConnected: "MQTT conectado",
    bambuLiveMqttExternalTrayLabel: "Bandeja externa MQTT",
    bambuLiveMqttSecondaryExternalTrayLabel: "Bandeja externa secundaria MQTT",
    bambuLiveMqttTrayLabel: "Bandeja MQTT",
    bambuLiveNoInventoryMatch: "No hay una coincidencia clara de inventario",
    bambuLiveNoLiveStatusPoll:
      "Conectado, pero no llegó ningún estado MQTT en vivo durante esta encuesta.",
    bambuLiveNoNewStatusPoll:
      "No llegó ninguna nueva ráfaga de MQTT a esta encuesta. Mostrando el último estado activo conocido y los diagnósticos capturados.",
    bambuLiveNozzleRange: "Gama de boquillas",
    bambuLiveObservedDetails: "Detalles observados en vivo",
    bambuLiveObservedEmpty:
      "Aún no se han observado datos en vivo. Esta sección mostrará más adelante los campos de estado entrante, el estado de la conexión y los valores útiles de AMS para esta impresora.",
    bambuLiveObservedRfidIdentity: "Identidad RFID/AMS observada",
    bambuLiveObservedSummary: "Resumen observado",
    bambuLivePresetNozzleSuffix: "boquilla mm",
    bambuLivePresetSignal: "Configuración de filamento preestablecida",
    bambuLivePrinterOnline: "En línea",
    bambuLiveRawPayload: "Últimos datos en vivo sin procesar",
    bambuLiveRawPayloadCopied: "Carga útil en vivo sin procesar copiada.",
    bambuLiveSecondaryExternalSlotLabel: "Ranura externa secundaria",
    bambuLiveSignalContinuous: "Telemetría continua",
    bambuLiveSignalContinuousDesc:
      "Campos que parecen actualizaciones normales de estado/telemetría durante la operación.",
    bambuLiveSignalEventDriven: "Señales AMS controladas por eventos",
    bambuLiveSignalEventDrivenDesc:
      "AMS lee y sincroniza los campos de estado que tienden a aparecer alrededor de los eventos.",
    bambuLiveSignalStable: "Metadatos estables de AMS",
    bambuLiveSignalStableDesc:
      "RFID, configuración de filamentos, metadatos de material y bandeja observados desde AMS.",
    bambuLiveSlotLabel: "Ranura",
    bambuLiveSortChangeCount: "Ordenar: Más cambiados",
    bambuLiveSortChangeInterval: "Ordenar: cambiado más rápido",
    bambuLiveSortLabel: "Ordenar campos capturados",
    bambuLiveSortLastSeen: "Ordenar: visto más recientemente",
    bambuLiveSortPath: "Ordenar: Campo",
    bambuLiveSortSeenInterval: "Ordenar: Visto más rápido",
    bambuLiveStartCapture: "Iniciar captura",
    bambuLiveStatus: "Estado de conexión",
    bambuLiveStopCapture: "Detener captura",
    bambuLiveSummaryAmsHumidity: "Humedad AMS",
    bambuLiveSummaryAmsStatus: "Estado de AMS",
    bambuLiveSummaryExternalTray: "Bandeja externa",
    bambuLiveSummaryJobState: "Estado del trabajo",
    bambuLiveSummarySecondaryExternalTray: "Bandeja externa secundaria",
    bambuLiveSummaryTray: "Bandeja",
    bambuLiveTechnicalDetails: "Detalles técnicos",
    bambuLiveTechnicalDetailsHint:
      "Identidad RFID sin procesar, base de peso, preajuste, rango de temperatura y diagnóstico de coincidencia.",
    bambuLiveTrayEmptyUnknown: "Vacío/desconocido",
    bambuLiveTrayLoaded: "Cargado",
    bambuLiveWaitingForStatusBurst:
      "Conectado, esperando la próxima ráfaga de estado MQTT.",
    catalogAllTypes: "Auditoría completa de proveedores",
    catalogRefreshClientHostOnly:
      "Las actualizaciones del catálogo de proveedores se envían al host. Este cliente todavía muestra y edita el catálogo de hosts compartidos.",
    catalogRefreshHelp:
      "Elige un proveedor y actualiza solo las familias de materiales que necesiten productos nuevos. Una auditoría completa es más lenta y puede marcar como históricos los productos que ya no aparezcan.",
    catalogRefreshTitle: "Actualizaciones del catálogo de proveedores",
    catalogTabClientHelp:
      "Este cliente muestra el catálogo de hosts. Las correcciones de muestras y las actualizaciones del catálogo de proveedores se guardan en el host.",
    catalogTabHelp:
      "La aplicación incluye un catálogo local. Las actualizaciones de proveedores añaden productos nuevos y actualizan las familias de materiales seleccionadas.",
    confirmBulkSwatch:
      "¿Rellenar automáticamente muestras para todas las entradas visibles que faltan?",
    confirmBulkSwatchAction: "Confirmar autocompletar",
    confirmBulkSwatchTapAgain:
      "Haga clic nuevamente en Autocompletar muestras faltantes visibles para confirmar.",
    confirmBulkSwatchVisible:
      "¿Aplicar los colores sugeridos a {count} entradas visibles?",
    confirmDeletePrinter: "Eliminar impresora",
    confirmDeletePrinterSuffix: "y sus asignaciones de franjas horarias?",
    confirmDeleteTapAgain:
      "Haga clic en Eliminar nuevamente para confirmar la eliminación de la impresora.",
    confirmImportBackup:
      "¿Importar copia de seguridad completa ahora?\\n\\nEsto reemplazará el inventario actual, el historial, las impresoras configuradas y los datos de mantenimiento.",
    confirmRemove: "Confirmar eliminación",
    confirmResetApp:
      "¿Restablecer los datos de la aplicación?\\n\\nEsto borra el inventario, las asignaciones de impresora, el historial de impresión, la lista de deseos y los navegadores emparejados con LAN confiable. Se mantienen las entradas del catálogo.",
    confirmResetAppAction: "Confirmar restablecer datos de la aplicación",
    confirmResetAppTapAgain:
      "Haga clic en Restablecer datos de la aplicación nuevamente para confirmar.",
    confirmResetCatalogs:
      "¿Reparar el catálogo?\\n\\nSe restaura el catálogo de semillas incluido. Sólo se eliminan las entradas de catálogo no utilizadas y no inicializadas; Se conservan las referencias del inventario y la lista de deseos.",
    confirmResetCatalogsAction: "Confirmar reparación del catálogo",
    confirmResetCatalogsTapAgain:
      "Haga clic en Reparar catálogo nuevamente para confirmar.",
    created: "creado",
    discoveredMaterials: "Materiales descubiertos",
    failed: "fallido",
    hideRefreshLog: "Ocultar registro de actualización",
    languageSelected: "Idioma seleccionado: {language}.",
    noMissingSwatches: "No faltan muestras para llenar.",
    reactivated: "reactivado",
    refreshCurrentVendor: "Actualizar el catálogo de proveedores actual",
    refreshSelectedMaterials: "Actualizar materiales seleccionados",
    remaining: "restante",
    removed: "Remoto",
    runFullVendorAudit: "Ejecute una auditoría completa de proveedores",
    skipped: "saltado",
    swatchBulkDone: "Actualización masiva de muestras completada",
    swatchBulkNoneUpdated:
      "No se pudieron completar automáticamente muestras faltantes visibles.",
    swatchColorPicker: "Selector",
    swatchEditedUnsaved: "Editado · no guardado",
    swatchInvalid: "Valor no válido",
    swatchInvalidHint: "Utilice #RGB, #RRGGBB, degradado(...) o múltiple(...).",
    swatchQuality: "Calidad de muestra",
    swatchQualityHelp:
      "Revise las muestras que faltan aquí, luego guarde las correcciones manuales o complete la lista visible de forma masiva.",
    swatchSaved: "Muestra guardada",
    swatchSuggestedUnsaved: "Sugerido · no guardado",
    swatchValue: "valor de muestra",
    swatchVendorFilter: "Filtrar por proveedor",
    themeSetTo: "Modo de tema configurado en",
    updated: "actualizado",
    updatingSwatches: "Actualizando muestras...",
    vendors: "Vendedores",
    visibleMissing: "faltantes visibles",
    error: {
      addPrinter: "No se pudo agregar la impresora.",
      bambuLiveFieldsRequired:
        "Se requieren host, código de acceso y serie de la impresora cuando el estado Bambu en vivo está habilitado.",
      bambuLiveIdentityCheckFailed:
        "No se pudo comprobar la identidad de la impresora.",
      bambuLiveTrustRequired:
        "Comprueba la identidad de la impresora y márcala como de confianza antes de activar el estado en directo de Bambu.",
      copyBambuLiveRawPayload:
        "No se pudo copiar la carga útil en vivo sin procesar.",
      copyCompanionShellUrl: "No se pudo copiar el shell complementario URL.",
      copyTrustedLanPairing:
        "No se pudo copiar el enlace de emparejamiento de LAN confiable.",
      createTrustedLanPairing:
        "No se pudo crear un enlace de emparejamiento de LAN confiable.",
      deletePrinter: "No se pudo eliminar la impresora.",
      exportBackup: "No se pudo exportar la copia de seguridad completa.",
      exportInventoryCsv: "No se pudo exportar el inventario CSV.",
      exportInventoryJson: "No se pudo exportar el inventario JSON.",
      importBackup: "No se pudo importar la copia de seguridad completa.",
      importData: "No se pudo importar el archivo seleccionado.",
      invalidSwatchHex:
        "Valor de muestra no válido. Utilice #RGB, #RRGGBB, degradado(...) o múltiple(...).",
      inventoryOverviewPrint:
        "No se pudo crear el PDF de la etiqueta de inventario.",
      librarySyncClearClientAuth:
        "No se pudo eliminar el emparejamiento del cliente de escritorio guardado.",
      librarySyncDeviceNameSave:
        "No se pudo guardar el nombre del dispositivo.",
      librarySyncHostCheck: "No se pudo verificar el host configurado.",
      librarySyncLinkHost:
        "No se pudo vincular este dispositivo a la biblioteca del host.",
      librarySyncPairHost:
        "No se pudo emparejar este cliente de escritorio con el host.",
      librarySyncPairingLinkRequired:
        "Pegue el enlace de emparejamiento completo del host para que el cliente pueda detectar el host automáticamente.",
      librarySyncPrinterWriteRequiresPairing:
        "Empareje este cliente de escritorio con el host antes de cambiar de impresora.",
      librarySyncSave:
        "No se pudo guardar la configuración de la función de la biblioteca.",
      librarySyncSnapshot: "No se pudo recuperar la instantánea del host.",
      load: "No se pudo cargar la configuración.",
      loadTrustedLanCompanion:
        "No se pudo cargar el estado del compañero de LAN confiable.",
      loadTrustedLanPairedBrowsers:
        "No se pudieron actualizar los navegadores emparejados.",
      printerRequired: "Se requieren el nombre y modelo de la impresora.",
      resetApp: "No se pudieron restablecer los datos de la aplicación.",
      resetCatalogs: "No se pudo reparar el catálogo.",
      revokeAllTrustedLanBrowsers:
        "No se pudieron revocar los navegadores LAN confiables.",
      revokeTrustedLanBrowser:
        "No se pudo revocar el navegador de LAN confiable.",
      saveSwatch: "No se pudo guardar la muestra del filamento seleccionado.",
      saveTrustedLanConfig:
        "No se pudo guardar la configuración del compañero de LAN confiable.",
      setActive: "No se pudo configurar la impresora activa.",
      trustedLanNoInterface:
        "Elija una interfaz privada antes de encender el servidor de aplicaciones web.",
      updatePrinter: "No se pudo actualizar la impresora.",
      validateBackup: "No se pudo validar el archivo de respaldo.",
    },
  },

  chart: {
    at: "en",
    consumed: "Consumido sobre el gráfico",
    latest: "El último",
    noSamples: "Aún no hay muestras de peso.",
    range: "Rango",
    rollUsageAria: "Tabla de uso de rollos",
    totalConsumed: "total consumido",
  },
};

export default esDictionary;
