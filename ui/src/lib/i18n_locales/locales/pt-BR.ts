import type { DictionaryNode } from "../../i18n_types";

export const ptBRDictionary: DictionaryNode = {
  app: {
    iconAlt: "Ícone Filament Manager",
    loadingPage: "Carregando página...",
    navigation: "Navegação",
    skipToMainContent: "Pular para o conteúdo principal",
    title: "Filament Manager",
  },
  chart: {
    at: "no",
    consumed: "Consumido no gráfico",
    latest: "Mais recente",
    noSamples: "Nenhuma amostra de peso ainda.",
    range: "Faixa",
    rollUsageAria: "gráfico de uso de bobina",
    totalConsumed: "total consumido",
  },
  common: {
    active: "Ativo",
    add: "Adicionar",
    all: "Todos",
    cancel: "Cancelar",
    close: "Fechar",
    back: "Voltar",
    continue: "Continuar",
    copied: "Copiado",
    copyFailed: "Falha na cópia",
    daysAgo: "{count} dias atrás",
    daysShort: "d",
    discontinued: "Descontinuado",
    exportCsv: "Exportar CSV",
    exportJson: "Exportar JSON",
    hide: "Esconder",
    hoursAgo: "{count} horas atrás",
    hoursShort: "h",
    justNow: "agora mesmo",
    loading: "Carregando...",
    loadingPrinters: "Carregando impressoras...",
    minutes: "min",
    minutesAgo: "{count} minutos atrás",
    off: "Desligado",
    on: "Sobre",
    refresh: "Atualizar",
    remove: "Remover",
    save: "Salvar",
    selected: "Selecionado",
    show: "Mostrar",
    unknown: "Desconhecido",
  },
  dashboard: {
    bambuLiveAttentionTitle: "O Bambu Live precisa de atenção",
    bambuLiveAttentionBody:
      "{name} não ficará mais Live até que você revise e aprove a identidade da impressora.",
    openBambuLiveSettings: "Abrir configurações do Live",
    onboardingInventoryBody:
      "Comece com um carretel ou importe um inventário ou backup existente.",
    onboardingInventoryTitle: "Adicionar ou importar inventário",
    onboardingPrinterBody:
      "Adicione qualquer impressora compatível. O Bambu Live pode ser ativado quando estiver disponível.",
    onboardingPrinterTitle: "Configurar uma impressora",
    onboardingCompanionBody:
      "Ative o acesso pelo navegador em uma rede confiável ou pare este computador com um host.",
    onboardingCompanionTitle: "Configurar acesso pelo navegador",
    onboardingBackupBody:
      "Crie um backup completo quando a biblioteca estiver pronta.",
    onboardingEyebrow: "Primeiros passos",
    onboardingTitle: "Concluir configuração",
    onboardingDescription:
      "Use as etapas adequadas à sua configuração. A impressora e o acesso pelo navegador são opcionais.",
    onboardingProgress: "{completed} de {total} concluídos",
    onboardingDismiss: "Fechar lista",
    onboardingComplete: "Concluído",
    onboardingOptional: "Opcional",
    onboardingPending: "A fazer",
    achievements: "Metas de progresso",
    achievementsHint:
      "Metas em tempo real com base no seu inventário atual e na atividade da impressora.",
    active: "Ativo",
    activePrinters: "Impressoras ativas",
    activityEmptyHint:
      "Empréstimos, trabalhos de impressão e outras atividades rastreadas aparecerão aqui.",
    activityHint:
      "Os empréstimos em aberto e o uso recente da impressora aparecem primeiro aqui.",
    addRollsForHealth:
      "Adicione bobinas para iniciar o monitoramento da saúde.",
    amsLoaded: "slots carregado",
    amsOnline: "Slots conectados",
    assigned: "atribuídas",
    backup: "Backup",
    backupText:
      "Exporte instantâneos de inventário para JSON ou CSV para arquivamento.",
    badgeActiveSpoolsPlaced: "bobinas ativas colocadas",
    badgeJobLogging: "Registro de trabalho",
    badgeJobLoggingDesc:
      "Registre trabalhos vinculados à impressora para que o consumo permaneça baseado no uso real.",
    badgeJobsLogged: "trabalhos registrados",
    badgeLocationCoverage: "Cobertura de localização",
    badgeLocationCoverageDesc:
      "Mantenha todas as bobinas ativas atribuídas a uma prateleira, empréstimo ou impressora slot.",
    badgeNoActiveSpools: "Ainda não há bobinas ativas.",
    badgeNoPrinterSlots: "Nenhuma impressora slots configurada ainda.",
    badgeSlotReadiness: "Prontidão Slot",
    badgeSlotReadinessDesc:
      "Mantenha AMS/MMU slots pronto quando configurado; impressoras de material único contam EXT.",
    badgeSlotsLoaded: "slots carregado",
    below20: "Abaixo de 20%",
    below200: "Abaixo de 200g",
    borrowedInLowStock: "Estoque baixo emprestado",
    borrowedInOnHand: "Emprestado em mãos",
    checkHostConnection: "Verifique a conexão com",
    clientSnapshotActiveLoans: "Empréstimos Ativos",
    clientSnapshotCapturedAt: "Instantâneo capturado",
    clientSnapshotCardHint:
      "Este dispositivo está conectado como cliente. Por enquanto, ele mostra o resumo do host e mantém fluxos de trabalho com muita gravação no host.",
    clientSnapshotCardTitle: "Visualização host somente leitura",
    clientSnapshotHealthHint:
      "Este cliente está mostrando apenas o resumo host. A integridade detalhada do inventário permanece no host por enquanto.",
    clientSnapshotHostOnline: "Host relatou atividade da impressora",
    clientSnapshotHostPrinters: "No host",
    clientSnapshotLibraryId: "ID da biblioteca",
    clientSnapshotNeedsAttention: "A biblioteca Host precisa de atenção",
    clientSnapshotSubtitle: "Instantâneo host somente leitura",
    clientSnapshotSynced: "Instantâneo Host",
    clientSnapshotSyncedCached: "Instantâneo host armazenado em cache",
    clientSnapshotSyncedLive: "Instantâneo host ao vivo",
    companionCheck: "Verificação de aplicativo da web",
    companionLive: "Aplicativo da web em execução",
    companionOff: "Aplicativo da Web desativado",
    configured: "configurado",
    connectedToHost: "Conectado a",
    consumption: "Consumo de Filamento",
    consumptionCaption:
      "O uso é agregado a partir de trabalhos de impressão vinculados à impressora.",
    gramsPerDay: "{count} g/dia",
    healthBalanceHint:
      "Observe estoque baixo, empréstimos, pedidos e slots carregados juntos.",
    healthMonitor: "Monitorar reabastecimento",
    healthRestock: "Reabastecimento recomendado",
    healthStable: "Fornecimento estável",
    hostCompanionOff: "Host desconectado",
    hostFallbackName: "host",
    inUse: "em uso",
    inventoryHealth: "Integridade do inventário",
    last30: "Últimos 30 dias",
    last12Months: "Últimos 12 meses",
    annualUsageUnavailable: "Atualize o host para exibir o histórico de 12 meses.",
    loaned: "emprestado",
    loanedTo: "Emprestado para",
    lowest: "mais baixo",
    lowStock: "Estoque baixo",
    lowStockShort: "estoque baixo",
    monthlyUsage: "Uso Mensal",
    noActivePrinter: "Nenhuma impressora ativa selecionada",
    noAlerts: "Sem alertas",
    noBorrowedInStock: "Sem estoque emprestado",
    noInventoryData: "Dados insuficientes",
    noPrintersConfigured: "Nenhuma impressora configurada",
    noRecentActivity: "Nenhuma atividade recente ainda.",
    noUsageTrendYet: "Nenhuma tendência de uso ainda",
    onOrder: "por encomenda",
    openCompanionSettings: "Abra as configurações de companion",
    ownedLowStock: "Estoque baixo possuído",
    ownedOnHand: "Possuído em mãos",
    ownershipSnapshot: "Instantâneo de propriedade",
    ownershipSnapshotHint:
      "Acompanhe o estoque próprio e emprestado separadamente, sem alterar os totais acima.",
    ownershipSplitNote:
      "Os totais de títulos acima ainda combinam todas as bobinas físicas, enquanto as regras resumidas específicas de propriedade continuam a evoluir.",
    recentActivity: "Atividade recente",
    subtitle:
      "Acompanhe a integridade do inventário, o uso atual e a atividade da impressora em uma visão geral.",
    synced: "Sincronizado",
    syncedFromDb: "Sincronizado do banco de dados local",
    totalSpools: "Bobinas totais",
    totalSpoolsSubtitle: "Em todos os locais",
  },
  errors: {
    downloadsUnavailable: "A pasta Downloads não está disponível.",
    exportInvalidPayload: "A exportação gerada é inválida.",
    exportWriteFailed: "A exportação não pôde ser salva.",
    forbidden: "Esta ação não é permitida.",
    internal: "Algo deu errado. Tente novamente.",
    invalidRequest: "A solicitação não pôde ser concluída.",
    loadedSpoolEditBlocked:
      "Use as ações da impressora slot para editar uma bobina carregada.",
    loanedSpoolEditBlocked:
      "Devolva o empréstimo antes de editar o status ou localização desta bobina.",
    notFound: "O registro solicitado não foi encontrado.",
    requestFailed: "A solicitação não pôde ser concluída.",
    spoolActiveLoan: "Devolva o empréstimo ativo antes de retirar esta bobina.",
    spoolStatusEditLimited:
      "As edições do navegador são limitadas a bobinas em estoque, vazias ou perdidas.",
    unauthorized: "A autenticação é necessária.",
  },
  inventory: {
    activeFilters: "ativo",
    addCurrentSelectionToWishlist: "Adicionar seleção atual à lista de desejos",
    addDirectlyToStock: "Adicione diretamente ao estoque",
    addedFromWishlist: "Adicionado da lista de desejos",
    addedToInventory: "Adicionado ao inventário",
    addFilament: "Adicionar filamento",
    addFilamentSubtitle:
      "Adicione diretamente ao estoque ou mantenha o fluxo lista de desejos → encomendado → estoque.",
    addMovedPrefix: "O fluxo de adição/pedido é movido para o topo",
    addMovedSuffix: "guia.",
    addSpool: "Adicionar bobina ao inventário",
    addSpoolAction: "Adicionar bobina",
    addToWishlist: "Adicionar à lista de desejos/pedido",
    addToWishlistHelp:
      "Use a seleção atual para manter o fluxo lista de desejos → encomendado → estoque.",
    adjustWeight: "Ajustar peso",
    assignAmsSlot: "Atribuir à impressora slot",
    assignBeforeUsage:
      "Atribua esta bobina a uma impressora slot para registrar o uso.",
    assigned: "Atribuída",
    assignedSlotLabel: "Slot atribuído",
    assignmentManagedOnPrinters:
      "A colocação do filamento e a atribuição do slot são gerenciadas na página Impressoras.",
    availableToLoan: "Disponível para empréstimo",
    bambuBatchAdded: "Lote de código Bambu adicionado",
    bambuBatchAddReady: "Adicione correspondências prontas",
    bambuBatchAllReady: "Todos os códigos colados estão prontos.",
    bambuBatchAmbiguous: "Escolha manualmente",
    bambuBatchAppendScan: "Adicionar ao lote",
    bambuBatchBorrowedOwnerRequired:
      "Insira de quem as bobinas foram emprestadas antes de criar esse lote emprestado.",
    bambuBatchCameraAction: "Usar webcam",
    bambuBatchCameraAdded: "Adicionado",
    bambuBatchCameraAddedCodeValues: "Adicionado {codes}.",
    bambuBatchCameraAddedMixedValues:
      "Adicionado {codes}; Valores do código de barras {reviewCount} para revisão.",
    bambuBatchCameraAddedReviewValues: "Adicionado para revisão: {values}.",
    bambuBatchCameraAlreadyAdded:
      "Já adicionado. Afaste a etiqueta antes de digitalizar outra cópia.",
    bambuBatchCameraBarcodeUnsupported:
      "A detecção de código de barras ao vivo não está disponível aqui. Use a importação de imagens ou digite o código.",
    bambuBatchCameraDuplicate: "Já adicionado",
    bambuBatchCameraError: "Não foi possível iniciar a câmera.",
    bambuBatchCameraErrorShort: "Erro de câmera",
    bambuBatchCameraIgnored: "Ignorado",
    bambuBatchCameraIgnoredQr:
      "Ignorou uma instrução Bambu QR. Continue mostrando a etiqueta do código do filamento.",
    bambuBatchCameraNoBarcodeYet:
      "Quadros de digitalização; nenhuma correspondência de código de barras ainda. Aproxime-se ou afaste-se até que as barras fiquem afiadas.",
    bambuBatchCameraPermissionDenied:
      "A permissão da câmera foi negada. Permita o acesso à câmera e tente novamente.",
    bambuBatchCameraPreviewError:
      "Não foi possível iniciar a visualização da câmera.",
    bambuBatchCameraPreviewIdle:
      "Inicie a webcam para digitalizar os rótulos das caixas Bambu.",
    bambuBatchCameraReadError:
      "A digitalização da câmera foi interrompida após um erro de leitura.",
    bambuBatchCameraReadRetry:
      "A câmera ainda está ativa, mas o leitor pulou um quadro. Mantenha a etiqueta estável.",
    bambuBatchCameraReview: "Análise",
    bambuBatchCameraScanning: "Digitalizando",
    bambuBatchCameraShowLabel:
      "Segure o código do filamento ou o código de barras na guia, longe o suficiente para que as barras fiquem afiadas.",
    bambuBatchCameraStarting: "Iniciando câmera",
    bambuBatchCameraStartingAction: "Iniciando a câmera...",
    bambuBatchCameraStartingMessage: "Iniciando a câmera...",
    bambuBatchCameraStop: "Pare a webcam",
    bambuBatchCameraUnavailable: "Câmera indisponível",
    bambuBatchCameraUnsupported:
      "O acesso à câmera não está disponível aqui. Use a importação de imagens ou digite o código.",
    bambuBatchChooseMatch: "Escolha a linha do catálogo",
    bambuBatchHeaderAction: "Adição em lote de caixas",
    bambuBatchHeaderActionShort: "Lote",
    bambuBatchHelp:
      "Cole um ou mais códigos de cinco dígitos. As correspondências prontas usam os detalhes de estoque de Adicionar filamento.",
    bambuBatchImageAction: "Adicionar da imagem",
    bambuBatchImageAddedCodes:
      "Código(s) de filamento {count} adicionados ao lote.",
    bambuBatchImageAddedMixed:
      "Código(s) de filamento {codeCount} e valor(es) de código de barras {reviewCount} para revisão foram adicionados ao lote.",
    bambuBatchImageAddedReview:
      "Valores do código de barras {count} adicionados para revisão.",
    bambuBatchImageError: "Não foi possível ler essa imagem.",
    bambuBatchImageIgnored: "Valores {count} da instrução Bambu ignorados.",
    bambuBatchImageNoBarcode:
      "Nenhum código de barras foi encontrado nessa imagem.",
    bambuBatchImageScanning: "Lendo imagem...",
    bambuBatchImageUnsupported:
      "A detecção de código de barras de imagem não está disponível aqui. Cole ou digite o código.",
    bambuBatchInputLabel: "Códigos neste lote",
    bambuBatchModalEyebrow: "Caixas Bambu",
    bambuBatchModalSubtitle:
      "Adicione várias bobinas Bambu da caixa Filament Codes sem mover a pesquisa normal do catálogo para fora da vista.",
    bambuBatchModalTitle: "Adição em lote de caixas",
    bambuBatchMoreRows: "mais",
    bambuBatchNeedsReview: "análise",
    bambuBatchNoCode: "Sem código",
    bambuBatchNoMatch: "Nenhuma correspondência",
    bambuBatchNoneReady:
      "Nenhuma linha está pronta ainda. Escolha correspondências ambíguas ou descontinuadas ou revise manualmente os códigos ausentes.",
    bambuBatchNoRowsYet:
      "Os códigos digitalizados e digitados aparecerão aqui.",
    bambuBatchPartialReady:
      "Somente linhas prontas serão adicionadas; as linhas de revisão são ignoradas.",
    bambuBatchPlaceholder: "53400\n53600\n65103",
    bambuBatchReady: "Preparar",
    bambuBatchReadyShort: "preparar",
    bambuBatchScanHelp:
      "Use a webcam, importe imagens ou digite um código de cada vez.",
    bambuBatchScanLabel: "Digitalize ou digite um código",
    bambuBatchScanPlaceholder: "Digitalize ou digite um código",
    bambuBatchScanTitle: "Digitalize ou insira códigos",
    bambuBatchTitle: "Códigos de filamento em lote",
    bambuCodeBoxLabelHint: "Encontre este campo no rótulo da caixa.",
    bambuCodeBoxLabelTitle: "Etiqueta da caixa",
    bambuCodeDiscontinuedOnly:
      "Somente entradas descontinuadas do catálogo Bambu usam este código.",
    bambuCodeEnterExample:
      "Digite o código no campo de pesquisa, por exemplo 53400.",
    bambuCodeHelp:
      "Use o código de cinco dígitos impresso como Código de Filamento na etiqueta da caixa Bambu.",
    bambuCodeLabel: "Código do Filamento",
    bambuCodeMoreMatches: "mais",
    bambuCodeMultipleMatches:
      "Este código é usado por várias entradas ativas do catálogo Bambu. Escolha a linha correta.",
    bambuCodeNoMatch:
      "Nenhuma entrada de catálogo Bambu usa este código de filamento ainda.",
    bambuCodeSingleMatch:
      "Uma entrada de catálogo Bambu ativa corresponde e está selecionada.",
    bambuCodeTryCatalogSearch:
      "Você ainda pode pesquisar por material, série ou nome de cor.",
    borrowedFrom: "Emprestado de",
    borrowedIn: "Emprestada de terceiros",
    borrowedInBatchRegistered: "Lote emprestado cadastrado",
    borrowedInHelp:
      "Registre esta bobina como emprestada de outra pessoa. Ainda pode ser usado em impressoras, mas não aparecerá em candidatos a empréstimos.",
    borrowedInNoteOptional: "Nota emprestada (opcional)",
    borrowedInRegistered: "Bobina emprestada registrada",
    borrowedRolls: "Bobinas emprestadas",
    borrowerName: "Nome do mutuário",
    catalogDetails: "Detalhes do catálogo",
    catalogManagedInSettings:
      "As atualizações do catálogo e o progresso da atualização são gerenciados em Configurações → Catálogo de filamentos.",
    catalogManagedInSettingsHelp:
      "Use o catálogo local abaixo para adicionar bobinas diretamente ao estoque, lista de desejos ou filas de pedidos.",
    catalogMatchCount:
      "{count, plural, one {# correspondência} other {# correspondências}}",
    catalogMatchCountPlural: "{count} correspondências",
    catalogMatchCountSingular: "{count} correspondência",
    catalogRefreshFilter: "Atualização e filtro de catálogo",
    catalogSelection: "Seleção de catálogo",
    changes: "Mudanças",
    chooseRollToLoan: "Escolha uma bobina para emprestar.",
    clientHostUnavailable:
      "Os detalhes da conexão Host estão faltando para este dispositivo cliente.",
    clientLoanOutPairedHint:
      "As bobinas disponíveis são carregadas no host e o empréstimo é criado lá.",
    clientLoanOutUnpairedHint:
      "Emparelhe este cliente desktop com o host antes de criar um empréstimo a partir deste dispositivo.",
    clientReadOnlyAction:
      "Este dispositivo está conectado como cliente. Use o host para alterações de estoque.",
    clientReadOnlyBanner:
      "Este dispositivo está vinculado como cliente. As edições de inventário permanecem no host por enquanto.",
    clientReadOnlyBannerPaired:
      "Este dispositivo está conectado como cliente. As atualizações de inventário são enviadas para o host emparelhado, enquanto o host ainda permanece como autoridade da biblioteca.",
    clientReadOnlyCached:
      "Host não está disponível. Mostrando o último instantâneo de inventário em cache.",
    clientReadOnlyHost: "Host",
    clientReadOnlyLive: "Mostrando inventário host ao vivo.",
    clientReadOnlyManage:
      "Este dispositivo está conectado como cliente. Você pode revisar a bobina aqui e as ações host emparelhadas permanecerão limitadas e explícitas.",
    clientReadOnlyOffline:
      "Host não está disponível e nenhum instantâneo de inventário em cache está disponível ainda.",
    clientReadOnlyUpdated: "Atualizado",
    clientTareWeightUpdated:
      "Peso da bobina vazia atualizado na biblioteca host.",
    clientWeightUpdated: "Peso atualizado na biblioteca host.",
    clientWriteRequiresPairing:
      "Emparelhe este cliente desktop com o host antes de executar ações de sincronização protegidas.",
    confirmDelete: "Clique novamente para confirmar a exclusão",
    confirmDeleteAction: "Excluir do inventário ativo",
    confirmMarkEmptyAction: "Marcar a bobina como vazia",
    confirmPurge: "Clique novamente para confirmar a limpeza permanente",
    confirmPurgeAction: "Purgue a bobina permanentemente",
    current: "atual",
    currentStatus: "Estado atual",
    dangerZone: "Zona de perigo",
    dangerZoneHint:
      "Abra somente quando precisar esvaziar, remover ou purgar permanentemente esta bobina.",
    deleteConfirmHint:
      "A bobina desaparece do estoque ativo, enquanto seu histórico registrado é mantido.",
    deleteConfirmTitle: "Excluir esta bobina do inventário ativo?",
    deleteRoll: "Excluir bobina do inventário ativo",
    discontinued: "Descontinuado",
    editHomeLocation: "Localização inicial",
    editLocation: "Editar local",
    editOwnership: "Propriedade",
    emptySpoolWeight: "Peso da bobina vazia (g)",
    emptySpoolWeightHelp:
      "Usado para subtrair a tara da bobina do total medido para que o filamento restante permaneça preciso.",
    error: {
      add: "Falha ao adicionar filamento.",
      assignFirst: "Atribua primeiro a bobina a uma impressora slot.",
      bambuBatchEmpty:
        "Cole pelo menos um código de filamento Bambu com uma correspondência de catálogo pronta.",
      bambuBatchWrongMode:
        "Mude para a fonte Bambu antes de criar um lote de código de filamento.",
      borrowedInNeedsOwner:
        "O registro emprestado precisa de um nome de quem a bobina foi emprestada.",
      borrowerRequired: "O nome do mutuário é obrigatório.",
      createBambuBatch:
        "Falha ao criar lote de códigos Bambu. Verifique a exclusividade e os valores de QR.",
      createSpool:
        "Falha ao criar bobina. Verifique a exclusividade e os valores de QR.",
      deleteRoll: "Falha ao excluir a bobina.",
      esunDetail: "Não foi possível carregar os detalhes do produto eSUN.",
      esunLookup: "Falha na pesquisa do eSUN. Tente novamente.",
      esunQueryShort: "Digite pelo menos 2 caracteres para pesquisa eSUN.",
      incomingWeightRequired:
        "Insira o peso da bobina recebida antes de salvar as alterações do slot.",
      invalidHex:
        "Invalid swatch color. Use #RRGGBB, multi(#RRGGBB,#RRGGBB) ou gradiente(#RRGGBB,#RRGGBB).",
      invalidWeight: "O valor do peso é inválido.",
      loadInventory: "Falha ao carregar inventário.",
      loadSpools: "Não foi possível carregar as bobinas do inventário.",
      loanAlreadyActive: "Esta bobina já possui empréstimo ativo.",
      loanBorrowedIn:
        "Bobinas emprestadas não podem ser emprestadas novamente.",
      loanGrams: "Os gramas do empréstimo devem ser zero ou maiores.",
      loanOut: "Não foi possível emprestar a bobina.",
      manualNeedsFields:
        "A criação manual precisa do nome e da cor do filamento.",
      markEmpty: "Falha ao marcar a bobina como vazia.",
      masterFieldsRequired:
        "Fornecedor, material, nome do filamento e cor são necessários para salvar os metadados.",
      outgoingWeightRequired:
        "Insira o peso da bobina de saída antes de substituir este slot.",
      outgoingWeightRequiredForUnassign:
        "Insira o peso da bobina de saída antes de removê-la de slot.",
      ownerNameRequired:
        "As bobinas emprestadas precisam do nome do proprietário ou da contraparte.",
      printLabel: "Falha ao gerar rótulo.",
      purgeRoll: "Falha ao purgar a bobina.",
      recordUsage: "Falha ao registrar o uso da impressora.",
      refill: "Falha ao reativar a bobina.",
      refillRequiresWeight:
        "Defina o peso total medido acima do peso da bobina vazia antes de reativar.",
      requireAmsForInUse:
        "Escolha uma impressora slot antes de definir ASSIGNED.",
      returnedGrams: "Os gramas retornados devem ser zero ou maiores.",
      returnLoan: "Não foi possível devolver a bobina emprestada.",
      saveRfid: "Falha ao salvar a tag RFID.",
      saveRollChanges: "Falha ao salvar as alterações da bobina.",
      selectBambuFirst: "Selecione primeiro um filamento Bambu.",
      selectEsunFirst: "Execute a pesquisa eSUN e selecione um produto.",
      stockFromWishlist: "Falha ao estocar bobina do item da lista de desejos.",
      toggleLost: "Falha ao atualizar o status perdido.",
      unlockMetadataFirst:
        "Desbloqueie os metadados antes de editar os detalhes do catálogo.",
      updateHomeLocation: "Falha ao salvar o local de armazenamento.",
      updateLocation: "Falha ao atualizar o local.",
      updateMetadata: "Falha ao atualizar os metadados da bobina.",
      updateOwnership: "Falha ao atualizar a propriedade da bobina.",
      updateTareWeight: "Falha ao atualizar o peso da bobina vazia.",
      updateWeight: "Falha ao atualizar o peso.",
    },
    field: "Campo",
    fields: "campos",
    filters: "Filtros",
    hideAdvancedFilters: "Ocultar detalhes",
    historyEvent: {
      addedToLibrary: "Adicionado à biblioteca",
      addedToLibraryDetail: "Filamento foi adicionado à biblioteca.",
      assignedToAms: "Atribuída ao slot da impressora",
      borrowedInRegistered: "Emprestado em registrado",
      borrowedInReturned: "Emprestado e devolvido",
      correction: "Correção",
      deleted: "Excluído",
      detailsUpdated: "Detalhes atualizados",
      loanedOut: "Emprestado",
      loanReturned: "Empréstimo devolvido",
      locationUpdated: "Localização atualizada",
      printJobRecorded: "Uso de impressão registrado",
      rfidSaved: "RFID salvo",
      rfidSavedDetail: "A identidade RFID foi salva da captura AMS.",
      statusUpdated: "Status atualizado",
      usedUp: "Marcado como vazio",
      weightCorrected: "Peso corrigido",
      weightUpdated: "Peso atualizado",
    },
    historyEventCount: "{count, plural, one {# evento} other {# eventos}}",
    historyEventCountMany: "eventos",
    historyEventCountOne: "evento",
    historyFilteredHint:
      "As atribuições da impressora slot são mostradas acima para que esse histórico permaneça focado na atividade da bobina.",
    homeLocationHintWhileAssigned:
      "O posicionamento atual é gerenciado na página Impressoras. O local inicial é para onde a bobina retorna quando não está mais carregada.",
    homeLocationLabel: "Localização inicial",
    homeLocationOptional: "Local de armazenamento (opcional)",
    homeLocationSaved: "Localização inicial salva.",
    imported: "Importado",
    incomingWeight: "Entrada g",
    initialWeight: "Peso inicial (g)",
    inUseRequiresAms: "ASSIGNED requer atribuição a uma impressora slot.",
    keepUnassignedOption: "Sem slot (manter não atribuída)",
    labelBuilderSubtitle:
      "Escolha um tamanho físico, verifique a visualização e salve um PNG pronto para impressão.",
    labelBuilderTitle: "Criar imagem de etiqueta",
    labelImageHint:
      "O PNG é renderizado a 300 DPI para um dimensionamento físico previsível.",
    labelPreview: "Pré-visualização da etiqueta",
    labelPreviewUnavailable: "Visualização do rótulo indisponível",
    labelProfile: {
      compact: "Compactar",
      expanded: "Expandido",
      "ptouch-24": "P Touch 24 mm",
      standard: "Padrão",
    },
    labelPtouchHint:
      "Projetado para fita de 24 mm com QR de altura total e texto legível.",
    labelRendering: "Rótulo de renderização...",
    labelSaved: "Etiqueta PNG salva em Downloads.",
    labelSaveDownloads: "Salvar PNG em downloads",
    labelSaving: "Salvando PNG...",
    labelSheetHint:
      "Precisa de etiquetas para diversas bobinas? Crie uma folha de etiquetas de inventário em Configurações → Geral.",
    labelSize: "Tamanho da etiqueta",
    lastAmsIdentitySeen: "Último avistamento de AMS",
    lastAmsSightingLiveActivity: "slot ao vivo",
    lastUpdated: "Última atualização",
    loading: "Carregando bobinas...",
    loadingHistory: "Carregando histórico...",
    loanCandidateCount: "{count, plural, one {# bobina} other {# bobinas}}",
    loanCandidateMany: "bobinas",
    loanCandidateOne: "bobina",
    loanCreated: "Empréstimo criado.",
    loanDetails: "Detalhes do empréstimo",
    loanDetailsHelp:
      "Confirme o mutuário e o peso de saída antes de salvar o empréstimo.",
    loanNoteOptional: "Nota de empréstimo (opcional)",
    loanOutRoll: "Emprestar bobina",
    loanSearchFilteredCount: "{visible} de {total} {unit}",
    loanSearchFilteredCountIcu:
      "{visible} de {total, plural, one {# bobina} other {# bobinas}}",
    loanSearchLabel: "Pesquisar bobinas disponíveis",
    loanSearchPlaceholder:
      "Pesquise material, cor, fornecedor, localização ou referência",
    loanSelectionHelp:
      "Escolha uma bobina em estoque e confirme quem a está pegando e quanto está saindo.",
    loanTracking: "Rastreamento de empréstimos",
    loanTrackingHint:
      "As devoluções e a avaliação na devolução são tratadas na página Empréstimos.",
    loanTrackingSubtitle:
      "Empreste uma bobina do estoque. As devoluções são tratadas na página Empréstimos.",
    location: "Localização",
    locationOptional: "Localização (opcional)",
    locationSaved: "Localização atualizada.",
    lockMetadata: "Bloquear metadados",
    lostStatus: "Status perdido",
    lowStockActiveBadge: "Filtro de estoque baixo ativo",
    lowStockOnly: "Estoque baixo (1-200 g)",
    manageInventory: "Gerenciar inventário",
    manualDetails: "Detalhes manuais",
    manualDetailsHelp:
      "Use isto quando um filamento estiver faltando no catálogo do fornecedor ou você quiser uma entrada totalmente manual.",
    markedFound: "bobina restaurada para em estoque.",
    markedLost: "bobina marcada como perdida.",
    markEmpty: "Marcar como usado (vazio)",
    markEmptyConfirmHint:
      "O peso restante será definido como 0 g. Se a bobina for carregada em uma impressora slot, ela será removida dessa slot.",
    markEmptyConfirmTitle: "Marcar esta bobina como vazia?",
    markFound: "Marcar como encontrado (em estoque)",
    markLost: "Marcar como perdido",
    material: "Material",
    materialGroup: "Material",
    maxAvailable: "Máximo disponível",
    measuredTotalWeight: "Peso total medido (g)",
    metadataAppliesToFamily:
      "As alterações atualizam a entrada do catálogo de filamentos compartilhados para todas as bobinas desta família de filamentos.",
    moreRolls: "mais bobina(s)",
    noActiveLoans: "Nenhum empréstimo ativo.",
    noCatalogMatches:
      "Nenhuma entrada de catálogo corresponde aos filtros do fornecedor atual.",
    noHistory: "Nenhum evento histórico ainda.",
    noLoanableRolls:
      "Nenhuma bobina está atualmente disponível para empréstimo.",
    noLoanSearchResults:
      "Nenhuma bobina disponível corresponde à sua pesquisa.",
    noMatch: "Nenhuma bobina corresponde aos filtros atuais.",
    noMatchHint:
      "Tente ajustar os filtros de pesquisa, status, material ou propriedade.",
    noSelectionPreview:
      "Escolha uma linha do catálogo ou insira detalhes manualmente antes de salvar.",
    noVisibleHistory:
      "Ainda não há histórico de bobina além das atribuições da impressora slot.",
    out: "Fora",
    outG: "Fora g",
    outgoingWeight: "Saída g",
    outgoingWeightPromptTitle: "Definir o peso da bobina de saída",
    ownedByUs: "Própria",
    ownedByUsDetail: "De nossa propriedade",
    ownedOwnershipHelp:
      "As bobinas próprias permanecem em seu inventário e podem ser emprestadas posteriormente.",
    ownerContactOptional: "Contato do proprietário (opcional)",
    ownerNameRequired: "Nome do proprietário (obrigatório)",
    ownership: "Propriedade",
    ownershipAll: "Todos",
    ownershipGroup: "Propriedade",
    ownershipNoteOptional: "Nota (opcional)",
    ownershipType: "Tipo de propriedade",
    ownershipUpdated: "Propriedade da bobina atualizada.",
    placement: "Colocação",
    printerUsage: "Uso da impressora",
    printQr: "Criar etiqueta QR",
    purgeConfirmHint:
      "Isto não pode ser desfeito. A bobina e todos os eventos do histórico registrado serão excluídos.",
    purgeConfirmTitle:
      "Excluir permanentemente esta bobina e todo o histórico?",
    purgeRoll: "Purgar bobina + todo o histórico permanentemente",
    qrCode: "Código QR",
    qrCompanionLinkLabel: "Link do Companion",
    qrCompanionUnavailable:
      "Os links QR do Companion exigem o endereço local estável. Disponibilize-o no host ativo antes de criar uma etiqueta.",
    qrLabel: "QR",
    qrTarget: "Alvo QR",
    qrTargetCompanionHint:
      "Este QR abre o navegador companion diretamente, desde que o destino URL ainda esteja acessível.",
    quickActions: "Ações rápidas",
    reactivated: "Reativado",
    reference: "Referência",
    refill: "Recarregar/Reativar bobina",
    refilled: "bobina reativada e pronta para uso.",
    refilledAuto: "bobina reativada a partir do novo peso medido.",
    registerBorrowedIn: "Cadastrar bobina emprestada",
    remaining: "Restante",
    remainingWeight: "Peso restante (g)",
    removeFromSlotOption: "slot vazio (remover do slot atual)",
    replacingRoll: "Substituindo",
    resetFilters: "Redefinir filtros",
    returnToInventory: "Retornar ao inventário",
    rfidActiveSource: "Fonte ativa",
    rfidAmsBambuBits: "AMS Bambu bits",
    rfidAmsExistBits: "AMS slot bits atuais",
    rfidAmsReadDone: "AMS leitura de bits concluídos",
    rfidAmsSlotMissing: "Não fisicamente presente",
    rfidAmsSlotPresence: "Presença slot selecionada",
    rfidAmsSlotPresent: "Presente fisicamente",
    rfidAmsStatus: "Status AMS RFID",
    rfidBambuUnregistered: "RFID ainda não registrado",
    rfidBambuUnregisteredHint:
      "As bobinas Bambu podem ser vinculadas automaticamente carregando a bobina em AMS e salvando a identidade RFID observada.",
    rfidButton: "RFID",
    rfidCapturedFields: "Campos slot capturados",
    rfidCapturedFieldsCollapsed: "Mostrar campos slot capturados",
    rfidCaptureFailed:
      "Não foi possível atualizar a captura RFID da impressora.",
    rfidCaptureNoPayload:
      "Nenhuma carga útil ativa ainda está disponível nesta impressora. Acione uma atualização AMS no Bambu Studio ou aguarde a próxima explosão de status.",
    rfidCaptureNoSlotData:
      "Nenhum campo AMS específico de slot está disponível ainda para esta origem slot.",
    rfidCaptureNothingToSave:
      "Nenhuma identidade RFID está disponível ainda para a origem selecionada slot.",
    rfidCaptureStatus: "Status de captura",
    rfidCaptureTitle: "Captura RFID",
    rfidCaptureUnavailable:
      "Nenhum campo AMS específico de slot chegou ainda para este slot.",
    rfidCaptureUsingLastKnown:
      "Aguardando dados AMS slot atualizados. Os valores capturados anteriormente permanecem visíveis até a chegada de dados mais recentes.",
    rfidCaptureWaiting:
      "Aguardando dados AMS slot atualizados. Mantenha esta janela aberta enquanto a impressora relata atualizações da bandeja.",
    rfidConnected: "Conectado",
    rfidCurrentTag: "RFID salvo",
    rfidDisconnected: "Não conectado",
    rfidHintNeedsLive:
      "A captura RFID precisa de uma impressora com status Live Bambu ativado e pelo menos um AMS slot disponível.",
    rfidHintReady:
      "Capture dados de identidade AMS/RFID, revise-os e salve a identidade RFID observada quando parecer correta.",
    rfidIdentityCandidates: "Sinais de identidade RFID",
    rfidIdentitySignals: "Sinais de identidade RFID",
    rfidLastSeen: "Visto pela última vez",
    rfidLastSlotData: "Últimos dados slot",
    rfidMatchExact: "Exato",
    rfidMatchExactHint: "Correspondência de material e amostra HEX.",
    rfidMatchPartial: "Parcial",
    rfidMatchPartialHint:
      "O material corresponde e a cor observada está próxima da amostra do catálogo.",
    rfidNoCaptureSource: "Nenhum AMS slot ao vivo disponível",
    rfidObservedColor: "Cor observada",
    rfidObservedMaterial: "Filamento observado",
    rfidObservedTag: "RFID observado",
    rfidPresetName: "Nome da predefinição/material",
    rfidPresetSignal: "Predefinição de configurações de filamento",
    rfidPrinterLive: "Impressora ao vivo",
    rfidRegistered: "RFID registrado",
    rfidSaved: "Tag RFID salva na bobina selecionada.",
    rfidSlotActive: "Ativo",
    rfidSlotEmpty: "Vazio",
    rfidSlotIdentitySeen: "RFID visto",
    rfidSlotLive: "Ao vivo",
    rfidSlotLiveSeen: "Visto ao vivo",
    rfidSlotLoaded: "Carregado",
    rfidSourceSlot: "Fonte RFID slot",
    rfidTechnicalDetails: "Detalhes técnicos",
    rfidTechnicalDetailsHint:
      "Sinais de identidade RFID brutos, status de captura e campos slot capturados.",
    rfidUnsupportedVendor: "AMS RFID não disponível",
    rfidUnsupportedVendorHint:
      "Atualmente, a identidade AMS RFID está exposta apenas para bobinas Bambu. Rastreie esta bobina com QR, peso, localização e atribuição da impressora.",
    rollHistory: "Histórico da bobina",
    rollHistoryCollapsed:
      "o histórico da bobina é recolhido por padrão. Expanda-o para visualizar os eventos.",
    rollMetadata: "metadados da bobina",
    rolls: "bobinas",
    rollSetup: "configuração da bobina",
    saveMetadata: "Salvar metadados",
    saveOwnership: "Salvar propriedade",
    saveRfid: "Salvar RFID",
    saveRollChanges: "Salvar alterações na bobina",
    searchPlaceholder:
      "Pesquise por material, cor, proprietário, localização ou QR",
    searchVendorCatalog: "Pesquise {{vendor}} material, filamento ou cor",
    selectedRoll: "Bobina selecionada",
    selectionPreview: "Pré-visualização da seleção",
    selectRollForHistory:
      "Selecione uma bobina para mostrar o histórico do ciclo de vida.",
    selectRollForUsage:
      "Selecione uma bobina para mostrar a tendência de peso.",
    selectRollPrompt:
      "Selecione uma bobina de um cartão agrupado para gerenciá-la.",
    showAdvancedFilters: "Mais filtros",
    showAllRolls: "Mostrar tudo",
    showFewerRolls: "Mostrar menos",
    showLessHistory: "Mostrar menos",
    showMoreHistory: "Mostrar mais",
    slot: "slot",
    slotAssignment: "Atribuição Slot",
    slotWeightPromptTitle: "Definir pesos de alteração slot",
    spoolResult: "bobina",
    spoolResults: "bobinas",
    status: "Status",
    statusAssigned: "Atribuída",
    statusBorrowed: "Emprestado",
    statusDeleted: "Excluído",
    statusEmpty: "Vazio",
    statusInStock: "Em estoque",
    statusInUse: "Em uso",
    statusLost: "Perdido",
    statusMissing: "Ausente",
    stockDetails: "Detalhes do estoque",
    stockEntry: "Entrada de estoque",
    stockEntryHelp:
      "Escolha um fluxo de fornecedor, escolha um filamento e confirme os detalhes do estoque abaixo.",
    stockRollNow: "Bobina de estoque agora",
    subtitle: "Gerencie estoque, empréstimos e peso da bobina em um só lugar.",
    swapWeightHint:
      "Na troca de bobina, o peso de saída registra o uso vinculado à impressora antes da reatribuição. O peso recebido é opcional.",
    swatchColorCode: "Código de cores da amostra",
    swatchColorPicker: "Seletor de cores de amostra",
    tareWeightUpdated: "Peso da bobina vazia atualizado.",
    title: "Bobinas",
    to: "Para",
    total: "Total",
    typeAll: "Todos",
    unassigned: "Não atribuído",
    unknownCollection: "coleção desconhecida",
    unlockMetadata: "Desbloquear metadados",
    updatingRoll: "Atualizando bobina selecionada...",
    usageDiagram: "Diagrama de uso",
    value: "Valor",
    vendorAll: "Todos",
    vendorGroup: "Fornecedor",
    vendorSource: "Fonte do fornecedor",
    viewCards: "Visualização de cartão",
    viewGroup: "Visualizar",
    viewList: "Visualização de lista",
    visualFixtureLoaded: "Dispositivo de detalhe de inventário carregado.",
    weightLabel: "Peso atual (g)",
    weightValue: "Valor do peso (g)",
    wishlistOrders: "Lista de desejos e pedidos",
    wishlistQueueHelp:
      "Mantenha as compras planejadas aqui, mova-as para o pedido e armazene-as quando chegarem.",
    wishlistWorkflow: "Fluxo de trabalho da lista de desejos",
    workspace: "Espaço de trabalho",
  },
  loans: {
    activeBorrowedIn: "Recebidas ativas",
    activeLoans: "Empréstimos ativos",
    activeRecords: "Registros ativos",
    back: "Voltar",
    borrowedGrams: "Emprestado",
    borrowedInAt: "Recebida em",
    borrower: "Mutuário",
    clientHostUnavailable:
      "Os detalhes da conexão Host estão faltando para este dispositivo cliente.",
    clientReadOnlyAction:
      "Este dispositivo está conectado como cliente. Use o host para alterações de empréstimo.",
    clientReadOnlyBanner:
      "Este dispositivo está vinculado como cliente. As alterações do empréstimo permanecem no host por enquanto.",
    clientReadOnlyBannerPaired:
      "Este dispositivo está conectado como cliente. As devoluções e devoluções podem ser enviadas para o host, enquanto a criação de novos empréstimos ainda permanece lá.",
    clientReadOnlyCached:
      "Host não está disponível. Mostrando o último instantâneo do empréstimo em cache.",
    clientReadOnlyHost: "Host",
    clientReadOnlyLive: "Mostrando empréstimos host ao vivo.",
    clientReadOnlyOffline:
      "Host não está disponível e nenhum instantâneo de empréstimo em cache está disponível ainda.",
    clientReadOnlyUpdated: "Atualizado",
    clientWriteRequiresPairing:
      "Emparelhe este cliente desktop com o host antes de executar ações de empréstimo protegidas.",
    confirmHandBackAction: "Confirmar devolução",
    confirmReturnAction: "Confirmar devolução",
    consumed: "Consumido",
    csvExported: "CSV de empréstimos exportado.",
    desktopOnly:
      "O rastreamento de empréstimos está disponível na versão do aplicativo desktop.",
    direction: "Direção",
    directionInbound: "Recebida de terceiros",
    directionOutbound: "Emprestada a terceiros",
    error: {
      export: "Falha ao exportar empréstimos CSV.",
      handBack: "Falha ao devolver a bobina emprestada.",
      invalidReturned: "Os gramas retornados devem ser zero ou maiores.",
      load: "Falha ao carregar dados do empréstimo.",
      return: "Não foi possível devolver o empréstimo.",
    },
    estimatedUsedGrams: "Estimativa de uso",
    exportCsv: "Exportar empréstimos (CSV)",
    handBackAction: "Devolver",
    handBackDialogHint:
      "Devolver isso removerá a bobina emprestada do estoque ativo, mas manterá seu histórico de empréstimos.",
    handBackDialogSubtitle:
      "Pese-o novamente, adicione uma nota, se necessário, e remova-o do inventário ativo.",
    handBackDialogTitle: "Devolva a bobina emprestada",
    handBackDialogWeightLabel: "Peso total devolvido incl. bobina (g)",
    handedBack: "Devolvido",
    handedBackAt: "Devolvido",
    handedBackFilamentGrams: "Devolvido",
    history: "Histórico de empréstimos",
    historyHint:
      "Registre aqui a devolução ao cliente ou ao proprietário. Os registros concluídos continuam disponíveis para consulta.",
    in: "Entrada",
    lent: "Emprestada em",
    loading: "Carregando empréstimos...",
    loanedGrams: "Emprestado",
    markedHandedBackTo: "Bobina emprestada marcada como devolvida a",
    markedReturnedFor: "Empréstimo marcado como devolvido para",
    noMatch: "Nenhum empréstimo corresponde ao filtro atual.",
    noUsageByPerson: "Ainda não há dados de uso pessoal.",
    out: "Saída",
    resultCount: "{count, plural, one {# empréstimo} other {# empréstimos}}",
    resultCountMany: "empréstimos",
    resultCountOne: "empréstimo",
    returnAction: "Retornar",
    returnDialogSubtitle: "Pese novamente e adicione uma nota, se necessário.",
    returnDialogTitle: "Devolver bobina emprestada",
    returnDialogWeightLabel: "Peso total devolvido incl. bobina (g)",
    returned: "Devolvido",
    returnedFilamentGrams: "Devolvido",
    returnedG: "Devolvido g",
    returnedGrams: "Gramas devolvidas",
    returnedLoans: "Empréstimos devolvidos",
    returnedRecords: "Registros retornados",
    returnNoteOptional: "Nota de devolução (opcional)",
    returnSummaryLabel: "Resumo do retorno",
    searchPlaceholder: "Pesquisar ID de pessoa/material/bobina",
    spool: "bobina",
    spoolId: "ID da bobina",
    startWeight: "Inicial",
    subtitle:
      "Acompanhe empréstimos ativos, bobinas emprestadas e devoluções em um só lugar.",
    totalConsumed: "Total consumido",
    usageByPerson: "Uso por pessoa",
    usageHint:
      "Veja quem tem empréstimos ativos no momento e quanto material cada pessoa utilizou.",
  },
  nav: {
    dashboard: "Painel",
    inventory: "Inventário",
    loans: "Empréstimos",
    printers: "Impressoras",
    settings: "Configurações",
    statistics: "Estatísticas",
  },
  printers: {
    addBorrowedCatalogRollAndSaveRfid: "Adicionar empréstimo + salvar RFID",
    addCatalogRollAndSaveRfid: "Adicionar + salvar RFID",
    amsSlot: "AMS Slot",
    applyRollChange: "Aplicar troca de bobina",
    availableRollsForSlot: "Bobinas disponíveis para",
    channel: "Canal",
    chooseRollForSlot: "Escolha a bobina para slot",
    clearSlotOptionHint: "Remova a bobina atual deste slot",
    clientHostUnavailable:
      "Os detalhes da conexão Host estão faltando para este dispositivo cliente.",
    clientReadOnlyAction:
      "Este dispositivo está conectado como cliente. Use o host para alterações de impressora.",
    clientReadOnlyBanner:
      "Este dispositivo está vinculado como cliente. As alterações na atribuição da impressora permanecem no host por enquanto.",
    clientReadOnlyBannerPaired:
      "Este dispositivo está conectado como cliente. As alterações de atribuição do Slot podem ser enviadas para o host, enquanto a configuração da impressora ainda permanece lá.",
    clientReadOnlyCached:
      "Host não está disponível. Mostrando o último instantâneo da impressora em cache.",
    clientReadOnlyHost: "Host",
    clientReadOnlyOffline:
      "Host não está disponível e nenhum instantâneo de impressora em cache está disponível ainda.",
    clientReadOnlyUpdated: "Atualizado",
    clientWriteRequiresPairing:
      "Emparelhe este cliente desktop com o host antes de executar ações protegidas da impressora.",
    configuredPrinters: "Impressoras configuradas",
    currentRoll: "Bobina atual",
    desktopOnly:
      "A visão geral da impressora está disponível na versão do aplicativo desktop.",
    emptySlot: "slot vazio",
    error: {
      candidateAlreadyHasRfid:
        "Esta bobina de inventário já possui uma identidade RFID salva.",
      candidateUnavailableForRfid:
        "Atualize os dados da impressora; esta bobina não está mais disponível como candidata Bambu RFID ativa.",
      createFromCatalogRequiresEmptySlot:
        "Limpe ou troque a bobina atual através do fluxo normal slot antes de criar uma nova bobina de catálogo aqui.",
      invalidUsage: "Os gramas de uso devem ser maiores que zero.",
      liveRfidChangedBeforeSave:
        "A identidade AMS ativa foi alterada antes de salvar. Abra novamente a ação slot e confirme a bobina atual.",
      liveSlotUnloadedBeforeSave:
        "AMS não informa mais uma bobina carregada neste slot. Atualize e confirme a bobina atual antes de salvar RFID.",
      load: "Falha ao carregar a visão geral da impressora.",
      outgoingWeightRequired:
        "Insira o peso da bobina de saída antes de trocar as bobinas.",
      recordUsage: "Falha ao registrar o uso de impressão.",
      selectCandidateBeforeRfid:
        "Selecione esta bobina primeiro em slot, para que qualquer peso de bobina de saída seja tratado antes de salvar RFID.",
      selectRollBeforeWeight:
        "Selecione uma bobina alvo antes de atualizar o peso.",
      updateSlot: "Falha ao atualizar a impressora slot.",
    },
    extSlot: "EXT Slot",
    failed: "Falhas",
    grams: "gramas",
    hideSlots: "Ocultar slots",
    incomingWeight: "Pesagem de entrada (g, opcional)",
    incomingWeightPromptLabel: "Peso medido (g)",
    incomingWeightPromptTitle: "Definir peso da bobina de entrada",
    jobOptional: "Nome do trabalho (opcional)",
    jobs: "Trabalhos",
    lastKnownLive: "Último conhecido ao vivo",
    liveCandidateCount:
      "As bobinas de estoque {count} correspondem ao material ativo/sinal de cor.",
    liveCandidateCurrent: "atual",
    liveCandidateCurrentMatches:
      "A atribuição atual corresponde ao sinal de material/cor ativo.",
    liveCandidateHasRfid: "RFID salvo",
    liveCandidateMore: "Existem mais candidatos no inventário.",
    liveCandidateSelectBeforeRfid: "selecione primeiro",
    liveCandidateSingle:
      "Uma bobina de inventário corresponde ao sinal de material/cor ativo.",
    liveCandidateSummary:
      "{count, plural, one {Uma bobina do inventário corresponde ao sinal de material/cor em tempo real.} other {# bobinas do inventário correspondem ao sinal de material/cor em tempo real.}}",
    liveCandidateUnavailable: "não disponível",
    liveCatalogCandidateCount:
      "As entradas do catálogo {count} Bambu se parecem com esta bobina viva.",
    liveCatalogCandidateMore:
      "Mais candidatos ao catálogo Bambu estão disponíveis.",
    liveCatalogCandidateSingle:
      "O catálogo Bambu tem uma correspondência provável. Adicione-o aqui para salvar o RFID ao vivo.",
    liveCatalogCandidateSummary:
      "{count, plural, one {O catálogo Bambu tem uma correspondência provável. Adicione-a aqui para salvar o RFID em tempo real.} other {# entradas do catálogo Bambu parecem ser esta bobina em tempo real.}}",
    liveCatalogCreatedAndAssigned:
      "{label} foi adicionado, RFID foi salvo e a bobina foi atribuída a este slot.",
    liveCatalogRequiresEmptySlot: "limpe slot primeiro",
    liveCatalogRequiresLoadedSlot: "carregue a bobina primeiro",
    liveCatalogRequiresRfid: "espere por RFID",
    liveConnectionConnected: "Conectado ao vivo",
    liveConnectionIdle: "Ao vivo · ociosa",
    liveConnectionWaiting: "Esperando ao vivo",
    liveHumidityDry: "Seco",
    liveHumidityMiddle: "Meio",
    liveHumidityWet: "Molhado",
    liveRfid: "RFID ao vivo",
    liveRfidCandidateCount:
      "As bobinas de estoque {count} se parecem com esta bobina Bambu ativa.",
    liveRfidCandidateCurrentMatches:
      "A atribuição atual se parece com esta bobina Bambu ativa. Salve RFID para vinculá-lo permanentemente.",
    liveRfidCandidateSelectCorrect:
      "Selecione a bobina correta antes de salvar RFID.",
    liveRfidCandidateSelectFirst:
      "Uma bobina de estoque se parece com esta bobina Bambu ativa. Selecione-o antes de salvar RFID.",
    liveRfidCandidateSelectionSummary:
      "{count, plural, one {Uma bobina do inventário parece ser esta bobina Bambu em tempo real. Selecione-a antes de salvar o RFID.} other {# bobinas do inventário parecem ser esta bobina Bambu em tempo real. Selecione a bobina correta antes de salvar o RFID.}}",
    liveRfidCandidateSingle:
      "Uma bobina de estoque se parece com esta bobina Bambu ativa. Salve RFID para vinculá-lo permanentemente.",
    liveRfidCandidateSummary:
      "{count, plural, one {Uma bobina do inventário parece ser esta bobina Bambu em tempo real. Salve o RFID para vinculá-la permanentemente.} other {# bobinas do inventário parecem ser esta bobina Bambu em tempo real.}}",
    liveRfidRegisteredAndAssigned:
      "RFID salvo e a bobina sugerida foi atribuída a este slot.",
    liveTelemetryActive: "Ativo",
    liveTelemetryAmsHumidity: "Umidade AMS",
    liveTelemetryAmsHumidityShort: "AMS",
    liveTelemetryBed: "Mesa",
    liveTelemetryIdle: "Parado",
    liveTelemetryNozzle: "Bocal",
    liveTelemetryPaused: "Pausado",
    liveTelemetryPreparing: "Preparando",
    liveTelemetryPrinting: "Impressão",
    liveTelemetryState: "Estado da impressora",
    loadedSlots: "slots carregado",
    logUse: "Uso de registro",
    manualAssignment: "Manual",
    noAms: "Não AMS",
    noMmu: "Não MMU3",
    noMultiMaterial: "Sem multimaterial",
    noPendingChanges: "Nenhuma alteração slot pendente.",
    noPrinters:
      "Nenhuma impressora configurada ainda. Use Adicionar impressora para criar uma.",
    noSlots: "Esta impressora não possui nenhum slots configurado.",
    noSpoolAssigned: "Nenhuma bobina atribuída.",
    outgoingWeight: "Peso de saída (g)",
    outgoingWeightPromptTitle: "Definir o peso da bobina de saída",
    previewSingleMaterial: "{model} monomaterial",
    previewWithMultiMaterial: "{model} com multimaterial",
    registerLiveRfid: "Salvar RFID",
    rfidOverridden: "RFID substituído",
    rfidOverriddenHint:
      "Este slot é atribuído manualmente enquanto a mesma identidade RFID não registrada ainda está ativa.",
    rfidOverrideDialogHint:
      "Este slot é atribuído manualmente enquanto AMS ainda relata a mesma identidade RFID não registrada. Salve-o na bobina selecionada quando estiver pronto.",
    rfidOverrideNothingToSave:
      "Nenhuma identidade RFID não vazia está disponível para salvar para este slot.",
    rollResultCount: "{count, plural, one {# bobina} other {# bobinas}}",
    rollResultMany: "bobinas",
    rollResultOne: "bobina",
    searchAvailableRolls: "Pesquisar bobinas disponíveis",
    searchRolls: "Pesquise bobinas por nome/fornecedor",
    showSlots: "Mostrar slots",
    singleMaterialOnly: "Somente material único",
    singleToolhead: "Cabeçote único",
    slot: "Slot",
    slotCount: "{count, plural, one {# slot} other {# slots}}",
    slotCountMany: "slots",
    slotCountOne: "slot",
    slotOnboarding: "Integração AMS",
    slotOnboardingLiveIdentityChanged:
      "A identidade AMS ativa foi alterada antes de salvar. Abra novamente a ação slot e confirme a bobina atual.",
    slotOnboardingLiveSlotUnloaded:
      "AMS não informa mais uma bobina carregada neste slot. Reabra a ação slot quando a bobina estiver carregada.",
    slotOnboardingNeedsBorrowedOwner:
      "Insira de quem a bobina foi emprestada antes de registrá-la como emprestada.",
    slotOnboardingNeedsRfid:
      "Aguarde por uma identidade RFID não vazia do sinal AMS ativo antes de adicionar e vincular esta bobina.",
    slotOnboardingOccupied:
      "Este slot já possui uma bobina atribuída. Limpe ou troque-o através do fluxo slot normal antes de criar uma nova bobina a partir do sinal AMS ativo.",
    slotOnboardingOccupiedBeforeSave:
      "Este slot agora possui uma bobina atribuída. Limpe ou troque-a através do fluxo slot normal antes de adicionar uma nova bobina de AMS.",
    slotUpdated: "Impressora slot atualizada.",
    subtitle: "Gerencie o slots e o uso de materiais vinculados à impressora.",
    success: "Sucessos",
    swapNoteOptional: "Trocar nota (opcional)",
    targetEmpty: "Alvo: slot vazio",
    targetRoll: "Bobina alvo",
    toolhead: "Cabeçote",
    unknownLiveRfid: "RFID não está registrado",
    unknownLiveRfidHint:
      "AMS relatou uma identidade RFID/AMS que não está registrada no inventário.",
    updateWeight: "Atualizar peso",
    usageRecorded: "Uso de impressão registrado.",
    used: "Consumo",
    waitingForLiveIdentity:
      "Mostrando a última atribuição slot salva até que uma identidade ativa mais forte chegue.",
    withAms: "Com AMS",
    withMmu: "Com MMU3",
    withMultiMaterial: "Multimaterial habilitado",
    withToolheads: "Multi-ferramenta",
  },
  settings: {
    "bambuDiscoveryTitle": "Localizar impressora Bambu",
    "bambuDiscoveryHint": "Escute brevemente os anúncios locais de impressoras Bambu. Nenhum código de acesso é enviado.",
    "bambuDiscoveryFind": "Localizar impressoras Bambu",
    "bambuDiscoveryScanning": "Procurando impressoras...",
    "bambuDiscoveryListeningHint": "Isso pode levar até 10 segundos enquanto a impressora se anuncia.",
    "bambuDiscoveryEmpty": "Nenhuma impressora Bambu se anunciou nesta interface. Ligue a impressora e tente novamente.",
    "bambuDiscoveryUseForSetup": "Usar na configuração",
    "bambuDiscoveryRecoverSavedAddress": "Recuperar endereço salvo",
    "bambuDiscoveryUnsavedChangesHint": "Salve ou descarte outras alterações antes de recuperar um endereço de impressora salvo.",
    "bambuDiscoveryRecoveryHint": "O endereço salvo pode ser recuperado depois que a identidade desta impressora for confiável.",
    "bambuDiscoveryDifferentPrinter": "Esta não é a impressora salva. Você só pode usá-la para uma nova configuração.",
    "bambuDiscoveryRecovered": "O endereço salvo da impressora ao vivo foi recuperado.",
    "bambuDiscoveryFailed": "Não foi possível encontrar impressoras Bambu nesta rede.",
    "bambuLiveRecoveryFailed": "Não foi possível recuperar o endereço salvo da impressora ao vivo.",
    updates: "Atualizações",
    updateCheckHint:
      "Quando ativado, verifica o GitHub automaticamente no máximo uma vez por dia. O download e a instalação continuam manuais.",
    automaticUpdateChecks: "Verificar automaticamente",
    remindMeLater: "Mais tarde",
    checkForUpdates: "Verificar atualizações",
    checkingForUpdates: "Verificando…",
    updateAvailable: "A versão {version} está disponível.",
    updateUpToDate: "A versão {version} é a versão publicada mais recente.",
    updateDevelopmentBuild:
      "Esta compilação é mais recente que a última versão publicada ({version}).",
    updateCheckFailed:
      "Não foi possível verificar atualizações. Tente novamente mais tarde.",
    updateInfoUnavailable:
      "As informações da versão não estão disponíveis no momento. Tente novamente mais tarde.",
    updateChannelDisabled:
      "Esta versão não tem um canal público de atualizações. Procure versões mais recentes no local de onde você baixou o aplicativo.",
    viewRelease: "Ver versão",
    activeCleared: "Impressora ativa apagada.",
    activePrinter: "Impressora ativa",
    activeUpdated: "Impressora ativa atualizada.",
    addedPrinter: "Impressora adicionada",
    addNewPrinter: "Adicionar nova impressora",
    addPrinter: "Adicionar impressora",
    amsUnits: "Unidades AMS",
    appearance: "Aparência",
    auto: "Automático (sistema)",
    autofillVisibleSwatches:
      "Preencher automaticamente amostras ausentes visíveis",
    autoHint: "Auto segue a preferência claro/escuro do seu sistema.",
    backupDescription:
      "Exporte um backup JSON completo com inventário, histórico e impressoras configuradas.",
    backupExported:
      "Backup completo exportado (inventário, histórico e impressoras).",
    backupExportGroup: "Backup e exportação",
    backupImported: "Backup completo importado com sucesso.",
    backupImportGroup: "Importação e validação",
    backupTitle: "Backup",
    latestFullBackupExportOnDevice: "Exportação mais recente de backup completo neste dispositivo",
    noFullBackupExportRecordedOnDevice: "Nenhuma exportação de backup completo foi registrada neste dispositivo ainda",
    backupValidationDone: "Validação de backup concluída.",
    backupValidationSummary: "Resumo de validação de backup",
    bambuLiveAccessCode: "Código de acesso",
    bambuLiveAmsLabel: "AMS",
    bambuLiveAmsReading:
      "Atualização AMS em andamento. RFID e a correspondência da bandeja podem parecer temporariamente incertas até que a leitura termine.",
    bambuLiveAmsWeightBasis: "Base da bobina AMS",
    bambuLiveAmsWeightEstimate: "Estimativa AMS",
    bambuLiveBadge: "Ao vivo",
    bambuLiveCandidateCount: "candidatos",
    bambuLiveCandidateNoRfidSaved: "Nenhum RFID salvo",
    bambuLiveCandidateRfidSaved: "RFID salvo",
    bambuLiveCapturedFieldCount: "Campos capturados nesta sessão",
    bambuLiveCapturedGroupCaption: "Campos Live capturados",
    bambuLiveCapturedTable: "Campos Live capturados",
    bambuLiveCaptureLastUpdate: "Última capturada",
    bambuLiveCapturePaused: "A captura está pausada",
    bambuLiveCapturePausedHint:
      "A sessão atual fica congelada até você iniciar a captura novamente.",
    bambuLiveCaptureRunning: "A captura está em execução",
    bambuLiveCaptureRunningHint:
      "As rajadas ao vivo recebidas estão sendo coletadas nesta sessão agora.",
    bambuLiveCaptureSeededFrom: "Semeado do estado ativo",
    bambuLiveCaptureStarted: "Captura iniciada",
    bambuLiveCaptureWaiting:
      "Aguardando atualizações de campo ao vivo. Inicie uma impressão ou deixe a impressora reportar mais dados enquanto este painel estiver aberto.",
    bambuLiveCatalogCandidate: "Catálogo Bambu",
    bambuLiveCatalogCandidateCount: "entradas de catálogo",
    bambuLiveCatalogLikelyMatch:
      "Provável correspondência única do catálogo Bambu em termos de material e cor viva.",
    bambuLiveCatalogMultipleMatches:
      "Várias entradas do catálogo Bambu podem corresponder a este filamento.",
    bambuLiveChangedFields: "Campos alterados",
    bambuLiveChartFieldLabel: "Campo gráfico",
    bambuLiveChartHint:
      "Escolha um campo numérico para representar graficamente apenas os valores capturados nesta sessão.",
    bambuLiveChartLatest: "Mais recente",
    bambuLiveChartNoFields:
      "Ainda não há campos numéricos prontos para gráfico",
    bambuLiveChartNoSamples:
      "Ainda não há amostras numéricas para o campo selecionado.",
    bambuLiveChartRange: "Faixa",
    bambuLiveChartTitle: "Gráfico de captura",
    bambuLiveChartWindow: "Amostras na janela de captura",
    bambuLiveConfiguredHost: "host configurado",
    bambuLiveConfiguredSerial: "Serial da impressora configurada",
    bambuLiveConnected: "Conectado",
    bambuLiveCopyRawPayload: "Copiar dados",
    bambuLiveCredentialsNote:
      "Os códigos de acesso são armazenados no repositório seguro de credenciais do sistema operacional.",
    bambuLiveDiagnostics: "Diagnóstico",
    bambuLiveDisabledNote:
      "Deixe desativado para manter o fluxo atual da impressora inalterado.",
    bambuLiveDisconnected: "Não conectado",
    bambuLiveExportCsv: "Exportar CSV",
    bambuLiveExternalSlotLabel: "slot externo",
    bambuLiveFieldCadence: "Intervalo médio visto",
    bambuLiveFieldChangeCadence: "Intervalo médio de alteração",
    bambuLiveFieldChanges: "Mudanças",
    bambuLiveFieldCount: "Campos de nível superior observados",
    bambuLiveFieldPath: "Campo",
    bambuLiveFieldRecentValues: "Valores recentes",
    bambuLiveFieldResultCount:
      "{count, plural, one {# campo} other {# campos}}",
    bambuLiveFieldResultMany: "campos",
    bambuLiveFieldResultOne: "campo",
    bambuLiveFieldUpdated: "Visto pela última vez",
    bambuLiveFieldValue: "Valor",
    bambuLiveFilterAll: "Filtro: Todos",
    bambuLiveFilterChanged: "Filtro: Campos alterados",
    bambuLiveFilterFrequent: "Filtro: Alta frequência",
    bambuLiveFilterLabel: "Filtrar campos capturados",
    bambuLiveFilterRecent: "Filtro: Visto no último minuto",
    bambuLiveGroupAms: "AMS",
    bambuLiveGroupOther: "Outro",
    bambuLiveGroupPrint: "Imprimir e status",
    bambuLiveGroupTray: "Bandeja e chip",
    bambuLiveHint:
      "Integração local somente leitura opcional para observar o status da impressora e do AMS.",
    bambuLiveHost: "Host/IP da impressora",
    bambuLiveIdentitySignals: "Sinais de identidade",
    bambuLiveInventoryLikelyMatch:
      "Única correspondência provável de inventário de material e cor viva.",
    bambuLiveInventoryMultipleMatches:
      "Várias bobinas de inventário podem corresponder a este filamento.",
    bambuLiveInventoryNoMatch:
      "Ainda não há correspondência clara de inventário.",
    bambuLiveInventoryNoRfidMatch:
      "A identidade RFID/AMS observada não corresponde a nada no inventário.",
    bambuLiveInventoryRfidMatch:
      "Correspondência exata de identidade RFID/AMS com relação ao inventário.",
    bambuLiveLastSeen: "Visto pela última vez",
    bambuLiveMatchNoteConfiguredMismatch:
      "A última identidade RFID/AMS conhecida não é mapeada corretamente para a bobina atualmente configurada.",
    bambuLiveMatchNoteDuplicateIdentity:
      "Várias bobinas de inventário compartilham esta identidade RFID/AMS salva.",
    bambuLiveMatchNoteDuplicateTrayIndex:
      "Vários slots configurados compartilham este índice de bandeja.",
    bambuLiveMatchNoteExact:
      "Correspondência exata de identidade RFID/AMS com relação ao inventário.",
    bambuLiveMatchNoteLastKnownGood:
      "Mostrando a última identidade RFID/AMS válida até que uma atualização mais forte chegue.",
    bambuLiveMatchNoteMultipleStoredMatch:
      "Várias bobinas armazenadas podem corresponder a esta bandeja ativa.",
    bambuLiveMatchNoteNoStoredMatch:
      "Nenhuma bobina armazenada clara corresponde a esta última identidade RFID/AMS conhecida.",
    bambuLiveMatchNoteOneStoredMatch:
      "Uma bobina provavelmente armazenada corresponde a esta última identidade RFID/AMS conhecida.",
    bambuLiveMatchNotePresetSignal:
      "Predefinição de configurações de filamento: {preset}. Esta é uma dica de material/configurações, não uma identidade de bobina.",
    bambuLiveMatchNoteUnknownIdentity:
      "AMS relatou uma identidade RFID/AMS que não está registrada no inventário.",
    bambuLiveMoreInventoryCandidates:
      "Existem mais bobinas correspondentes no inventário.",
    bambuLiveMqttConnected: "MQTT conectado",
    bambuLiveMqttExternalTrayLabel: "Bandeja externa MQTT",
    bambuLiveMqttSecondaryExternalTrayLabel: "Bandeja externa secundária MQTT",
    bambuLiveMqttTrayLabel: "Bandeja MQTT",
    bambuLiveNoInventoryMatch: "Nenhuma correspondência de inventário clara",
    bambuLiveNoLiveStatusPoll:
      "Conectado, mas nenhum status MQTT ativo chegou durante esta pesquisa.",
    bambuLiveNoNewStatusPoll:
      "Nenhuma nova explosão MQTT apareceu nesta enquete. Mostrando o último estado ativo conhecido e diagnósticos capturados.",
    bambuLiveNozzleRange: "Alcance do bico",
    bambuLiveObservedDetails: "Detalhes ao vivo observados",
    bambuLiveObservedEmpty:
      "Nenhum dado ao vivo observado ainda. Esta seção mostrará posteriormente os campos de status de entrada, integridade da conexão e valores AMS úteis para esta impressora.",
    bambuLiveObservedRfidIdentity: "Identidade RFID/AMS observada",
    bambuLiveObservedSummary: "Resumo observado",
    bambuLivePresetNozzleSuffix: "bocal mm",
    bambuLivePresetSignal: "Predefinição de configurações de filamento",
    bambuLivePrinterOnline: "On-line",
    bambuLivePrinterSerial: "Número de série da impressora",
    bambuTlsCheckCurrent: "Verificar identidade",
    bambuLiveAccessCodeSaved: "Código de acesso salvo com segurança",
    bambuLiveAccessCodeMissing: "Nenhum código de acesso salvo",
    bambuLiveAccessCodeSavedPlaceholder:
      "Salvo com segurança — insira um novo código para substituir",
    bambuLiveAccessCodeReplacePending:
      "O código de acesso salvo será substituído ao salvar.",
    bambuLiveAccessCodeSavePending:
      "O código de acesso será salvo com segurança ao salvar.",
    bambuLiveAccessCodeClear: "Remover código salvo",
    bambuLiveAccessCodeClearPending:
      "O código de acesso salvo será removido ao salvar. As conexões ao vivo ficarão pausadas até você inserir um novo código.",
    bambuLiveAccessCodeKeep: "Manter código salvo",
    bambuLiveAccessCodeHostConfigured:
      "Há um código de acesso salvo no desktop host.",
    bambuLiveAccessCodeHostMissing:
      "Não há código de acesso salvo no desktop host.",
    bambuTlsTrustTitle: "Identidade da impressora",
    bambuTlsTrustTrusted: "Confiável",
    bambuTlsTrustUnpaired: "Ainda não confiável",
    bambuTlsTrustChanged: "Identidade alterada",
    bambuTlsTrustPending: "Confiança pendente",
    bambuTlsClearPending: "Remoção da confiança pendente",
    bambuTlsTrustTrustedHint:
      "O certificado da impressora corresponde à identidade salva.",
    bambuTlsTrustUnpairedHint:
      "O código de acesso não será enviado até que você confie explicitamente nesta identidade da impressora.",
    bambuTlsTrustChangedHint:
      "A identidade da impressora mudou. A conexão foi interrompida antes do envio do código de acesso.",
    bambuTlsTrustPendingHint:
      "Esta identidade da impressora se tornará confiável ao salvar.",
    bambuTlsClearPendingHint:
      "A confiança será removida ao salvar. As conexões ao vivo permanecerão bloqueadas até você confiar novamente na impressora.",
    bambuTlsFingerprint: "Impressão digital do certificado",
    bambuTlsFingerprintUnavailable:
      "Salve ou verifique a conexão da impressora para ler sua identidade.",
    bambuTlsTrustCurrent: "Confiar nesta identidade",
    bambuTlsRetrustCurrent: "Confiar na nova identidade",
    bambuTlsForget: "Esquecer identidade confiável",
    bambuTlsUndoTrustChange: "Desfazer alteração de confiança",
    bambuLiveRawPayload: "Dados brutos mais recentes",
    bambuLiveRawPayloadCopied: "Dados brutos copiados.",
    bambuLiveSecondaryExternalSlotLabel: "slot externo secundário",
    bambuLiveSection: "Status Live Bambu",
    bambuLiveTitle: "Bambu Live",
    bambuLiveAddHint: "Conecte agora para ver o status da impressora, os slots AMS, as temperaturas e o consumo de impressão. Você também pode pular esta etapa e configurar depois.",
    bambuLiveEnable: "Ativar Bambu Live",
    bambuLiveLocalOnly: "Conecta diretamente à impressora na sua rede local.",
    addPrinterWithLive: "Adicionar impressora com Live",
    bambuLiveSignalContinuous: "Telemetria contínua",
    bambuLiveSignalContinuousDesc:
      "Campos que parecem atualizações normais de status/telemetria durante a operação.",
    bambuLiveSignalEventDriven: "Sinais AMS acionados por eventos",
    bambuLiveSignalEventDrivenDesc:
      "AMS lê e sincroniza campos de status que tendem a aparecer em torno de eventos.",
    bambuLiveSignalStable: "Metadados AMS estáveis",
    bambuLiveSignalStableDesc:
      "RFID, configurações de filamento, metadados de material e bandeja observados em AMS.",
    bambuLiveSlotLabel: "Slot",
    bambuLiveSortChangeCount: "Classificar: Mais alterados",
    bambuLiveSortChangeInterval: "Classificar: alteração mais rápida",
    bambuLiveSortLabel: "Classificar campos capturados",
    bambuLiveSortLastSeen: "Classificar: visto mais recentemente",
    bambuLiveSortPath: "Classificar: Campo",
    bambuLiveSortSeenInterval: "Classificar: visto mais rápido",
    bambuLiveStandaloneOnly:
      "O status ativo do Bambu é configurado no host desktop.",
    bambuLiveStartCapture: "Iniciar captura",
    bambuLiveStatus: "Status da conexão",
    bambuLiveStopCapture: "Parar captura",
    bambuLiveSummaryAmsHumidity: "Umidade AMS",
    bambuLiveSummaryAmsStatus: "Status AMS",
    bambuLiveSummaryExternalTray: "Bandeja externa",
    bambuLiveSummaryJobState: "Estado do trabalho",
    bambuLiveSummarySecondaryExternalTray: "Bandeja externa secundária",
    bambuLiveSummaryTray: "Bandeja",
    bambuLiveTechnicalDetails: "Detalhes técnicos",
    bambuLiveTechnicalDetailsHint:
      "Identidade RFID bruta, base de peso, predefinição, faixa de temperatura e diagnóstico de correspondência.",
    bambuLiveTrayEmptyUnknown: "Vazio/desconhecido",
    bambuLiveTrayLoaded: "Carregado",
    bambuLiveWaitingForStatusBurst:
      "Conectado, aguardando a próxima explosão de status MQTT.",
    cachedReused: "Reutilizado em cache",
    catalogAllTypes: "Auditoria completa do fornecedor",
    catalogRefreshClientHostOnly:
      "As atualizações do catálogo do fornecedor são enviadas para host. Este cliente ainda mostra e edita o catálogo host compartilhado.",
    catalogRefreshHelp:
      "Escolha o fornecedor e atualize apenas as famílias de materiais que necessitam de novos produtos. Uma auditoria completa do fornecedor é mais lenta e pode marcar produtos não vistos como históricos.",
    catalogRefreshTitle: "Atualizações do catálogo do fornecedor",
    catalogResetDone: "Reparo de catálogo feito",
    catalogTabClientHelp:
      "Este cliente mostra o catálogo host. Correções de amostras e atualizações de catálogo de fornecedores são salvas no host.",
    catalogTabHelp:
      "O aplicativo vem com um catálogo de sementes local. As atualizações do fornecedor adicionam produtos recém-descobertos e atualizam famílias de materiais selecionadas.",
    clientHostBackupRequiresPairing:
      "Emparelhe este cliente com o host antes de exportar um backup completo do host.",
    applicationDiagnosticsTitle: "Diagnóstico do aplicativo",
    applicationDiagnosticsDescription: "Verifique a integridade do banco de dados local e baixe um arquivo de suporte higienizado, sem conteúdo do inventário nem credenciais.",
    diagnosticsHealthy: "Íntegro",
    diagnosticsNeedsAttention: "Requer atenção",
    diagnosticsUnavailable: "Banco de dados indisponível",
    diagnosticsRefreshFailed: "Não foi possível atualizar o diagnóstico do aplicativo.",
    diagnosticsLastGoodVisible: "O último resultado bem-sucedido continua visível.",
    diagnosticsSchema: "Esquema atual / compatível",
    diagnosticsDatabaseSize: "Tamanho do banco de dados",
    diagnosticsQuickCheck: "Verificação rápida",
    diagnosticsForeignKeyCheck: "Verificação de chaves estrangeiras",
    diagnosticsJournalMode: "Modo de diário",
    diagnosticsLocalPath: "Caminho do banco de dados local",
    diagnosticsCheckOk: "Aprovada",
    diagnosticsCheckIssues: "Problemas encontrados",
    diagnosticsCheckUnavailable: "Indisponível",
    diagnosticsDownloadSupport: "Baixar arquivo de suporte higienizado",
    diagnosticsSupportDownloaded: "Arquivo de suporte higienizado baixado.",
    diagnosticsSupportDownloadFailed: "Não foi possível baixar o arquivo de suporte higienizado.",
    clientHostOnlyMaintenance:
      "Este dispositivo é um cliente. O backup completo é exportado do host emparelhado. As ações de importação, redefinição e reparo ainda devem ser executadas no host para que os dados da biblioteca permaneçam em um só lugar.",
    columnsHint:
      "Escolha modelo, nome e capacidade multimaterial. EXT permanece disponível automaticamente.",
    companionAuth: "Autenticação",
    companionBoundaries: "Desktop-primeiros limites",
    companionBoundariesValue:
      "Atualização de catálogo, importação/exportação/redefinição, substituição de slot ocupada e fluxos administrativos mais amplos ainda permanecem no aplicativo desktop por enquanto.",
    companionCopyLaunchLink: "Copiar link de lançamento",
    companionCopyShellUrl: "Copiar shell URL",
    companionHelp:
      "Abra o navegador da mesma máquina shell servido pelo aplicativo desktop. Isso permanece limitado à visão geral do inventário, links diretos de bobina, registro/edição/devolução manual de empréstimo, visão geral da impressora, revisão/histórico de empréstimo de saída com retorno direto, detalhes da bobina, atualizações de status/localização restritas, atualização manual de peso, atribuição/limpeza básica da impressora-slot e criação de empréstimo de saída de bobina selecionada, enquanto desktop permanece a fonte da verdade.",
    companionMode: "Alcançar",
    companionOpenBrowser: "Abrir no navegador",
    companionRefreshStatus: "Atualizar status",
    companionScope: "Escopo atual do navegador",
    companionScopeValue:
      "Visão geral do estoque, links diretos de bobina, registro/edição/devolução manual de empréstimos emprestados, visão geral da impressora, revisão/histórico de empréstimos de saída com devolução direta, detalhes da bobina, atualizações de status/localização restritas, atualização manual de peso, atribuição/limpeza básica da impressora-slot e criação de empréstimo de saída de bobina selecionada.",
    companionShellUrl: "Shell URL",
    companionShellUrlCopied: "Companion shell URL copiado.",
    companionShellUrlHint: "Servido localmente pelo aplicativo desktop.",
    companionSourceOfTruth: "Fonte da verdade",
    companionSourceOfTruthHint:
      "Os fluxos do navegador passam pelo limite de serviço/API de propriedade de desktop em vez de tocar diretamente em SQLite.",
    companionSourceOfTruthValue: "Aplicativo Desktop + SQLite",
    companionStatus: "Status Companion",
    companionStatusHint:
      "A API de loopback e o navegador shell são hospedados pelo processo desktop.",
    companionStatusRunning: "Correndo",
    companionStatusStopped: "Não está em execução",
    companionStatusUnreachable: "Não respondendo",
    companionTitle: "Navegador local companion",
    confirmBulkSwatch:
      "Amostras de preenchimento automático para todas as entradas ausentes visíveis?",
    confirmBulkSwatchAction: "Confirmar preenchimento automático",
    confirmBulkSwatchTapAgain:
      "Clique em Preencher automaticamente amostras ausentes visíveis novamente para confirmar.",
    confirmBulkSwatchVisible:
      "Aplicar cores sugeridas às entradas visíveis de {count}?",
    confirmDeletePrinter: "Excluir impressora",
    confirmDeletePrinterSuffix: "e suas atribuições slot?",
    confirmDeleteTapAgain:
      "Clique em Remover novamente para confirmar a exclusão da impressora",
    confirmImportBackup:
      "Importar backup completo agora?\n\nIsso substituirá o inventário atual, o histórico, as impressoras configuradas e os dados de manutenção.",
    confirmRemove: "Confirmar remoção",
    confirmResetApp:
      "Redefinir dados do aplicativo?\n\nIsso limpa inventário, mapeamentos de impressoras, histórico de impressão, lista de desejos e navegadores emparelhados com LAN confiável. As entradas do catálogo são mantidas.",
    confirmResetAppAction: "Confirme a redefinição dos dados do aplicativo",
    confirmResetAppTapAgain:
      "Clique em Redefinir dados do aplicativo novamente para confirmar.",
    confirmResetCatalogs:
      "Reparar o catálogo?\n\nO catálogo inicial empacotado é restaurado. Somente entradas de catálogo não utilizadas e não propagadas são removidas; as referências do inventário e da lista de desejos são preservadas.",
    confirmResetCatalogsAction: "Confirme o reparo do catálogo",
    confirmResetCatalogsTapAgain:
      "Clique em Reparar catálogo novamente para confirmar.",
    created: "criado",
    current: "Atual",
    dark: "Escuro",
    desktopOnly:
      "As configurações estão disponíveis apenas na versão do aplicativo desktop.",
    detailFetches: "Buscas de detalhes",
    discoveredMaterials: "Materiais descobertos",
    enableBambuLive: "Ativar status ao vivo",
    error: {
      addPrinter: "Falha ao adicionar impressora.",
      bambuLiveFieldsRequired:
        "Host, o código de acesso e o número de série da impressora são necessários quando o status ativo de Bambu está ativado.",
      bambuLiveIdentityCheckFailed:
        "Não foi possível verificar a identidade da impressora.",
      bambuLiveTrustRequired:
        "Verifique a identidade da impressora e marque-a como confiável antes de ativar o status ao vivo da Bambu.",
      copyBambuLiveRawPayload: "Falha ao copiar a carga bruta ao vivo.",
      copyCompanionShellUrl: "Falha ao copiar companion shell URL.",
      copyTrustedLanPairing:
        "Falha ao copiar o link de emparelhamento de LAN confiável.",
      createTrustedLanPairing:
        "Falha ao criar um link de emparelhamento de LAN confiável.",
      deletePrinter: "Falha ao excluir a impressora.",
      exportBackup: "Falha ao exportar o backup completo.",
      exportInventoryCsv: "Falha ao exportar o inventário CSV.",
      exportInventoryJson: "Falha ao exportar o inventário JSON.",
      importBackup: "Falha ao importar o backup completo.",
      importData: "Falha ao importar o arquivo selecionado.",
      invalidSwatchHex:
        "Invalid swatch value. Use #RGB, #RRGGBB, gradiente(...) ou multi(...).",
      inventoryOverviewPrint: "Falha ao criar o PDF da etiqueta de inventário.",
      librarySyncClearClientAuth:
        "Falha ao remover o emparelhamento do cliente desktop salvo.",
      librarySyncDeviceNameSave: "Falha ao salvar o nome do dispositivo.",
      librarySyncHostCheck: "Falha ao verificar o host configurado.",
      librarySyncLinkHost:
        "Falha ao vincular este dispositivo à biblioteca host.",
      librarySyncPairHost:
        "Falha ao emparelhar este cliente desktop com o host.",
      librarySyncPairingLinkRequired:
        "Cole o link de emparelhamento completo do host para que o cliente possa detectar o host automaticamente.",
      librarySyncPrinterWriteRequiresPairing:
        "Emparelhe este cliente desktop com o host antes de trocar de impressora.",
      librarySyncSave:
        "Falha ao salvar as configurações de função da biblioteca.",
      librarySyncSnapshot: "Falha ao buscar o instantâneo host.",
      load: "Falha ao carregar as configurações.",
      loadTrustedLanCompanion:
        "Falha ao carregar o status companion da LAN confiável.",
      loadTrustedLanPairedBrowsers: "Falha ao atualizar navegadores pareados.",
      printerRequired: "O nome e o modelo da impressora são obrigatórios.",
      resetApp: "Falha ao redefinir os dados do aplicativo.",
      resetCatalogs: "Falha ao reparar o catálogo.",
      revokeAllTrustedLanBrowsers:
        "Falha ao revogar navegadores de LAN confiáveis.",
      revokeTrustedLanBrowser: "Falha ao revogar o navegador de LAN confiável.",
      saveSwatch: "Falha ao salvar a amostra do filamento selecionado.",
      saveTrustedLanConfig:
        "Falha ao salvar as configurações de LAN confiável companion.",
      setActive: "Falha ao definir a impressora ativa.",
      trustedLanNoInterface:
        "Escolha uma interface privada antes de ativar o servidor de aplicativos web.",
      updatePrinter: "Falha ao atualizar a impressora.",
      validateBackup: "Falha ao validar o arquivo de backup.",
    },
    exportFullBackup: "Exportar backup completo (JSON)",
    exportInventoryCsv: "Exportar inventário CSV",
    exportInventoryJson: "Exportar inventário JSON",
    failed: "fracassado",
    filamentsPerMmu: "Filamentos por MMU3",
    help: "Ajuda",
    helpHint:
      "Abra o tour visual do produto para obter capturas de tela dos principais fluxos de trabalho desktop e Companion ou use o manual de texto para obter o comportamento passo a passo.",
    hideObservedDetails: "Ocultar detalhes observados",
    hideRefreshLog: "Ocultar registro de atualização",
    importDataFile: "Importar arquivo de backup/dados",
    importDetectedInventoryCsv: "Inventário CSV",
    importDetectedInventoryJson: "Inventário JSON",
    importFullBackup: "Importar backup completo",
    importSource: "Fonte",
    inventoryCsvExported: "Inventário CSV exportado.",
    inventoryImportDone: "Importação de inventário concluída.",
    inventoryJsonExported: "Inventário JSON exportado.",
    inventoryOverviewBuilderSubtitle:
      "Escolha o formato do papel, revise as páginas e salve um PDF pronto para impressão.",
    inventoryOverviewBuilderTitle: "Criar folha de etiquetas de inventário",
    inventoryOverviewEmpty:
      "Não há bobinas de filamento disponíveis para incluir.",
    inventoryOverviewLabelCount: "Etiquetas {count} · {perPage} por página",
    inventoryOverviewNextPage: "Próxima página",
    inventoryOverviewPageCount: "Página {page} de {pages}",
    inventoryOverviewPaperA4: "A4",
    inventoryOverviewPaperA4Hint: "210 × 297 milímetros",
    inventoryOverviewPaperFormat: "Formato de papel",
    inventoryOverviewPaperLetter: "US Letter",
    inventoryOverviewPaperLetterHint: "8,5 × 11 pol. · 216 × 279 mm",
    inventoryOverviewPerPage: "etiquetas por página",
    inventoryOverviewPreview: "Visualização da planilha",
    inventoryOverviewPreviousPage: "Página anterior",
    inventoryOverviewPrint: "Folhas de etiquetas de inventário",
    inventoryOverviewPrintAction: "Criar folha de etiquetas de inventário",
    inventoryOverviewPrintDone:
      "PDF da etiqueta de inventário salvo em Downloads: {path}",
    inventoryOverviewPrintHint:
      "Crie folhas de etiquetas QR para cada bobina disponível, usando o mesmo layout legível de 60 × 24 mm das etiquetas individuais.",
    inventoryOverviewPrintSave: "Salvar PDF em downloads",
    inventoryOverviewPrintSaving: "Salvando PDF...",
    inventoryOverviewRendering: "Preparando folhas de etiquetas...",
    inventoryOverviewSingleLabelHint:
      "Precisa de apenas uma etiqueta? Abra a bobina no Inventário e escolha Criar etiqueta QR.",
    languageSelected: "Idioma selecionado: {language}.",
    language: "Idioma",
    languageHint:
      "Escolha o idioma do aplicativo para todas as visualizações principais.",
    libraryRoleLabel: "Função da biblioteca",
    librarySyncAdvancedHint:
      "Abra-o somente quando precisar de diagnósticos ou detalhes de instantâneos em cache.",
    librarySyncAdvancedTitle: "Detalhes avançados do host",
    librarySyncBackupAutoValidated:
      "O backup exportado foi validado automaticamente e está pronto para uso no fluxo guiado de mudança de função.",
    librarySyncCachedSnapshot: "Instantâneo host armazenado em cache",
    librarySyncCheckHost: "Verifique host",
    librarySyncChecking: "Verificando...",
    librarySyncClearClientAuth: "Remover pareamento",
    librarySyncClient: "Cliente",
    librarySyncClientAuthCleared:
      "O emparelhamento do cliente Desktop foi removido deste dispositivo.",
    librarySyncClientAuthExpiresAt: "A sessão expira",
    librarySyncClientAuthHint:
      "Cole um link de emparelhamento de curta duração do host para desbloquear ações de sincronização protegidas do desktop.",
    librarySyncClientAuthInput: "Link de emparelhamento",
    librarySyncClientAuthNeedsRepair: "É necessário emparelhar novamente",
    librarySyncClientAuthPaired: "Emparelhado",
    librarySyncClientAuthPairedAt: "Emparelhado",
    librarySyncClientAuthPersistentHint:
      "Este cliente permanece emparelhado até que você remova o emparelhamento aqui ou no host.",
    librarySyncClientAuthRepairHint:
      "Se este cliente para desktop ainda usa um endereço IP numérico, remova o pareamento antigo e faça um novo pareamento usando um link fornecido pelo host.",
    librarySyncClientAuthTitle: "Emparelhamento de cliente Desktop",
    librarySyncClientAuthUnpaired: "Não pareado",
    librarySyncClientHint:
      "Este dispositivo se conecta a outro host e mantém um cache de fallback somente leitura quando esse host não está disponível.",
    librarySyncClientPaired:
      "Cliente Desktop emparelhado com o host. Ações de sincronização protegidas agora podem ser habilitadas.",
    librarySyncClientPairingFlowHint:
      "Comece com um link de emparelhamento de curta duração do host. O cliente usa esse link para detectar, verificar e conectar-se automaticamente ao host correto.",
    librarySyncConfirmAgain: "Clique novamente para confirmar",
    librarySyncConfirmArmedHint:
      "Mais um clique confirma esta mudança de função.",
    librarySyncConfirmSwitchToClient: "Mudar para cliente",
    librarySyncConfirmSwitchToHost: "Mudar para Host",
    librarySyncConfirmSwitchToStandalone: "Mudar para autônomo",
    librarySyncConnectHint:
      "Insira primeiro o endereço host. Em seguida, verifique antes de vincular este dispositivo.",
    librarySyncConnectTitle: "Conecte-se a host",
    librarySyncCurrentHost: "host atual",
    librarySyncDeviceName: "Nome do dispositivo",
    librarySyncDeviceNamePlaceholder: "PC de oficina",
    librarySyncDeviceNameSaved: "Nome do dispositivo salvo.",
    librarySyncDeviceNameSavedStatus: "Salvo",
    librarySyncDeviceNameUnsaved: "Alterações não salvas",
    librarySyncFetchSnapshot: "Buscar instantâneo",
    librarySyncHideAdvanced: "Ocultar detalhes",
    librarySyncHint:
      "Escolha se este dispositivo permanecerá apenas local, hospedará a biblioteca compartilhada ou se conectará a outro host.",
    librarySyncHost: "Host",
    librarySyncHostCheckOk: "Verificação Host aprovada.",
    librarySyncHostCheckPairingInvalid:
      "Host está acessível, mas o emparelhamento do cliente desktop deve ser atualizado.",
    librarySyncHostHint:
      "Este dispositivo está preparado para host a biblioteca para outros desktop ou clientes de navegador.",
    librarySyncHostUrl: "Host URL",
    librarySyncImportedOnClientHint:
      "Este dispositivo está agora preparado como o próximo host. Revise as funções da biblioteca e salve quando estiver pronto para assumir.",
    librarySyncLastChecked: "Última verificação",
    librarySyncLastReachable: "Último acessível",
    librarySyncLastStatus: "Último status host",
    librarySyncLibraryId: "ID da biblioteca",
    librarySyncLinkedHost:
      "Este dispositivo agora está vinculado à biblioteca host selecionada.",
    librarySyncLinkHost: "Vincule este dispositivo ao host verificado",
    librarySyncMigrationStepExport: "Exporte um backup completo do host atual",
    librarySyncMigrationStepExportHint:
      "Use o botão de exportação abaixo antes de importar na próxima máquina.",
    librarySyncMigrationStepImport:
      "Importe o backup completo neste dispositivo",
    librarySyncMigrationStepImportHint:
      "Importe o backup host aqui antes que este dispositivo assuma o controle.",
    librarySyncNoSnapshotHint:
      "Obtenha um instantâneo host para manter uma pequena visualização somente leitura disponível aqui.",
    librarySyncNoSnapshotYet: "Nenhum snapshot armazenado em cache ainda",
    librarySyncOpenMaintenance: "Ferramentas de manutenção abertas",
    librarySyncPairHost: "Emparelhar cliente desktop",
    librarySyncPairingInvalid:
      "Link de emparelhamento inválido. Crie um novo link de emparelhamento no host e tente novamente.",
    librarySyncRefreshingSnapshot: "Atualizando instantâneo...",
    librarySyncRemoteAuth: "Modo de autenticação",
    librarySyncRemoteDevice: "Dispositivo remoto",
    librarySyncRemoteLibraryId: "ID da biblioteca remota",
    librarySyncRemoteMode: "Função remota",
    librarySyncRenewPairing: "Renovar emparelhamento",
    librarySyncRenewPairingInfo:
      "O emparelhamento salvo foi apagado. Cole um novo link de emparelhamento do host para continuar.",
    librarySyncRoleChangeAutoValidatedHint:
      "O último backup exportado foi validado automaticamente neste fluxo guiado.",
    librarySyncRoleChangeClientHint:
      "O modo cliente espera uma conexão host. Após a troca, use o emparelhamento do cliente Desktop para conectar este dispositivo ao host que você deseja usar.",
    librarySyncRoleChangeClientLocalHint:
      "Este cliente normalmente espera uma biblioteca host. Você pode exportar um backup completo no host atual e importá-lo posteriormente em Manutenção do programa se desejar continuar localmente.",
    librarySyncRoleChangeClientToHostHint:
      "Este cliente se torna seu próprio host após a troca. Se posteriormente você quiser mover os dados da biblioteca do host atual, crie um backup completo lá e importe-o posteriormente em Manutenção do programa neste dispositivo.",
    librarySyncRoleChangeValidateImportHint:
      "Valide o mesmo backup aqui. Esse backup pode ser importado posteriormente em Manutenção do programa no dispositivo que deverá continuar com a biblioteca.",
    librarySyncSave: "Salvar função de biblioteca",
    librarySyncSaved: "Configurações de função de biblioteca salvas.",
    librarySyncSaveDeviceName: "Salvar nome do dispositivo",
    librarySyncSaveHint:
      "As mudanças de função abrem um fluxo guiado. Nada é salvo até que você confirme.",
    librarySyncSaving: "Salvando...",
    librarySyncShowAdvanced: "Mostrar detalhes",
    librarySyncSnapshotAssigned: "Atribuído",
    librarySyncSnapshotCapturedAt: "Capturado",
    librarySyncSnapshotInUse: "Em uso",
    librarySyncSnapshotLoans: "Empréstimos ativos",
    librarySyncSnapshotLowStock: "Estoque baixo",
    librarySyncSnapshotPrinters: "Impressoras",
    librarySyncSnapshotRefreshed: "Instantâneo Host atualizado.",
    librarySyncSnapshotTotalSpools: "Bobinas totais",
    librarySyncStandalone: "Autônomo",
    librarySyncStandaloneHint:
      "Este dispositivo continua usando apenas sua própria biblioteca local.",
    librarySyncStandaloneWebappHint:
      "Este dispositivo mantém sua própria biblioteca local e também atende o aplicativo da web a partir daqui.",
    librarySyncStatusCached: "Em cache",
    librarySyncStatusLive: "Ao vivo",
    librarySyncStatusOffline: "Off-line",
    librarySyncStepDone: "Feito",
    librarySyncStepPending: "Pendente",
    librarySyncTitle: "Funções da biblioteca",
    librarySyncUseCheckedHost: "Use este host verificado",
    libraryTabHint: "",
    libraryTabTitle: "Biblioteca e aplicativo da web",
    libraryWebappLabel: "Aplicativo da web",
    libraryWebappRunning: "Correndo",
    libraryWebappRunsOnHost: "Funciona em host",
    libraryWebappToggle: "Habilitar aplicativo da web",
    license: "Licença",
    licenseHelp:
      "Filament Manager é de código aberto. As versões distribuídas modificadas e as versões modificadas utilizadas em rede devem disponibilizar sua fonte correspondente sob a mesma licença.",
    light: "Claro",
    maintenance: "Manutenção",
    missingSwatches: "Amostras ausentes",
    mmuUnits: "Unidades MMU3",
    multiUnits: "Unidades multimateriais",
    noActivePrinter: "Nenhuma impressora ativa",
    noBackupValidationYet:
      "Valide um arquivo de backup aqui para ver detalhes de compatibilidade antes de importar.",
    noMissingSwatches: "Não há amostras faltantes para preencher.",
    printerDiscardChanges: "Descartar alterações",
    printerDiscardHint:
      "Suas alterações serão perdidas e a impressora manterá a configuração atual.",
    printerDiscardTitle: "Descartar alterações de impressora não salvas?",
    printerKeepEditing: "Continue editando",
    printerModel: "Modelo de impressora",
    printerName: "Nome da impressora",
    printerNoChanges: "Nenhuma alteração para salvar",
    printerUnsavedChanges: "Alterações não salvas",
    productTour: "Tour do produto",
    program: "Programa",
    reactivated: "reativado",
    reconfigure: "Reconfigurar",
    refreshCurrentVendor: "Atualizar catálogo de fornecedores atual",
    refreshSelectedMaterials: "Atualizar materiais selecionados",
    remaining: "restante",
    removed: "Removido",
    removedPrinter: "Impressora removida",
    resetApp: "Redefinir dados do aplicativo",
    resetAppList1:
      "Limpa o estoque de bobinas e o histórico do ciclo de vida das bobinas.",
    resetAppList2:
      "Limpa mapeamentos de impressoras, estatísticas de impressão, lista de desejos e sessões de navegador emparelhadas com LAN confiável.",
    resetAppList3: "Mantém entradas do catálogo mestre e dados de amostra.",
    resetCatalogs: "Catálogo de reparos",
    resetCatalogsHint:
      "Restaura o catálogo de filamentos agrupados, mantém entradas históricas de fornecedores e remove apenas linhas de catálogo não utilizadas e não propagadas.",
    resetCatalogsList1:
      "Mantém o catálogo de sementes agrupado e as entradas vinculadas ao inventário ou à lista de desejos.",
    resetCatalogsList2:
      "Remove apenas entradas de catálogo não utilizadas e não propagadas.",
    resetCatalogsList3:
      "Reimporta entradas iniciais ausentes e repara metadados do catálogo.",
    resetDone: "A redefinição dos dados do aplicativo foi concluída.",
    resetHint:
      "A redefinição do aplicativo limpa inventário, histórico de estatísticas, atribuições de impressoras, lista de desejos e navegadores emparelhados com LAN confiável.",
    resetSectionTitle: "Reparação e limpeza",
    runFullVendorAudit: "Execute uma auditoria completa do fornecedor",
    saveReconfigure: "Salvar alterações",
    selectPrinterModel: "Selecione o modelo da impressora",
    showObservedDetails: "Mostrar detalhes observados e captura",
    skipped: "ignorado",
    slotsPerAms: "Slots por AMS",
    slotsPerUnit: "Slots por unidade multimaterial",
    sourceCode: "Código fonte",
    subtitle:
      "Gerencie o acesso ao navegador, impressoras, atualizações de catálogo e manutenção.",
    swatchBulkDone: "Atualização em massa do Swatch concluída",
    swatchBulkNoneUpdated:
      "Nenhuma amostra ausente visível pode ser preenchida automaticamente.",
    swatchColorPicker: "Seletor",
    swatchEditedUnsaved: "Editado · não salvo",
    swatchInvalid: "Valor inválido",
    swatchInvalidHint: "Use #RGB, #RRGGBB, gradiente(...) ou multi(...).",
    swatchQuality: "Qualidade da amostra",
    swatchQualityHelp:
      "Revise as amostras ausentes aqui e salve as correções manuais ou preencha a lista visível em massa.",
    swatchSaved: "Amostra salva",
    swatchSuggestedUnsaved: "Sugerido · não salvo",
    swatchValue: "Valor da amostra",
    swatchVendorFilter: "Filtrar por fornecedor",
    tabCatalog: "Catálogo de filamentos",
    tabCompanion: "Acesso ao navegador",
    tabGeneral: "Geral",
    tabLibrary: "Biblioteca e aplicativo da web",
    tabMaintenance: "Manutenção do programa",
    tabPrinters: "Impressoras 3D",
    tabSwatch: "Qualidade da amostra",
    themeSetTo: "Modo tema definido como",
    toolheadGroups: "Grupos de ferramentas",
    toolheads: "Cabeças de ferramentas",
    totalCatalog: "Catálogo",
    trustedLanActive: "Ativo",
    trustedLanAllBrowsersRevoked:
      "Todos os navegadores de LAN confiáveis ​​foram revogados.",
    trustedLanAuth: "Autenticação",
    trustedLanAuthHint:
      "Emparelhamento por navegador com cookies, renovação e verificações CSRF.",
    trustedLanAuthorized: "Autorizado",
    trustedLanAuthPairing: "Emparelhamento por navegador",
    trustedLanBindBody:
      "Vincula-se a uma interface privada explícita. Nunca 0.0.0.0.",
    trustedLanBindTitle: "Apenas vinculado à interface",
    trustedLanBrowserPairedDetected: "Novo navegador emparelhado conectado.",
    trustedLanBrowserRevoked: "Navegador Trusted-LAN revogado.",
    trustedLanBrowsersBody:
      "Revogue um navegador para interromper as renovações e fechar as sessões atuais.",
    trustedLanBrowsersEmpty:
      "Nenhum navegador de LAN confiável foi emparelhado ainda.",
    trustedLanBrowsersTitle: "Navegadores emparelhados",
    trustedLanBrowserWaiting: "Aguardando a primeira renovação",
    trustedLanCancelRevokeAction: "Cancelar",
    trustedLanCancelRevokeAllAria:
      "Cancelar a revogação do acesso para todos os navegadores autorizados",
    trustedLanCancelRevokeBrowserAria:
      "Cancelar a revogação do acesso do navegador para {name}",
    trustedLanCloseNetworkEditor: "Fechar editor",
    trustedLanCompactNetworkHint:
      "O aplicativo web é executado em uma interface LAN privada selecionada. Abra os detalhes da rede somente quando precisar deles.",
    trustedLanConfigBody:
      "Escolha a interface privada e a porta que o aplicativo web deve usar.",
    trustedLanConfigSaved: "Configurações de Trusted-LAN companion salvas.",
    trustedLanConfigTitle: "Rede",
    trustedLanConfirmRevokeAction: "Confirmar revogação",
    trustedLanConfirmRevokeAll:
      "Revogar o acesso de todos os navegadores autorizados ({count})? Suas sessões atuais serão encerradas e todos os navegadores deverão ser emparelhados novamente.",
    trustedLanConfirmRevokeAllAction: "Confirmar revogar tudo",
    trustedLanConfirmRevokeAllAria:
      "Confirme a revogação do acesso para todos os navegadores autorizados",
    trustedLanConfirmRevokeBrowser:
      "Revogar acesso para {name}? Suas sessões atuais serão encerradas e o navegador deverá ser emparelhado novamente.",
    trustedLanConfirmRevokeBrowserAria:
      "Confirme a revogação do acesso do navegador para {name}",
    trustedLanCopyPairing: "Copiar link de pareamento",
    trustedLanCreateAnotherPairing: "Crie outro link",
    trustedLanCreatePairing: "Criar link de pareamento",
    trustedLanDisabledInfo: "Servidor de aplicativos da Web desativado.",
    trustedLanEditNetwork: "Editar rede",
    trustedLanEnabledInfo: "Servidor de aplicativos Web ativado.",
    trustedLanEnabledPendingInfo:
      "O servidor de aplicativos Web está sendo iniciado. Atualize o status se demorar um pouco.",
    trustedLanEnableLabel:
      "Habilite o acesso do navegador de LAN confiável na interface selecionada",
    trustedLanHelp:
      "Ative o acesso do navegador em uma interface LAN privada. O aplicativo desktop permanece no controle.",
    trustedLanHideNetwork: "Ocultar rede",
    trustedLanHideNetworkDetails: "Ocultar detalhes da rede",
    trustedLanHideNetworkSummary: "Ocultar rede",
    trustedLanHideRevoked: "Ocultar {count} revogado",
    trustedLanInterface: "Interface selecionada",
    trustedLanInterfaceHintDisabled:
      "Nenhuma interface LAN é exposta enquanto o modo LAN confiável está desabilitado.",
    trustedLanInterfaceHintEnabled:
      "Vincula-se apenas a uma interface privada.",
    trustedLanInterfaceNotSelected: "Não selecionado",
    trustedLanInterfaceSelect: "Interface privada",
    trustedLanLastSeen: "Visto pela última vez",
    trustedLanLatestPairing: "Link de emparelhamento mais recente",
    trustedLanNetworkDetails: "Detalhes da rede",
    trustedLanNetworkInterface: "Interface de rede (IP)",
    trustedLanNetworkSaved: "Configurações de rede do aplicativo Web salvas.",
    trustedLanNoActiveBrowsers: "Nenhum navegador autorizado no momento.",
    trustedLanNoInterfaces: "Nenhuma interface IPv4 privada detectada",
    trustedLanOrigin: "Origem",
    trustedLanPairedAt: "Emparelhado",
    trustedLanPairingBody:
      "Crie um link de curta duração ou QR para um navegador por vez.",
    trustedLanPairingCopied: "Link de emparelhamento Trusted-LAN copiado.",
    trustedLanPairingCreated:
      "Link de emparelhamento Trusted-LAN criado e copiado.",
    trustedLanPairingEmpty:
      "Crie um link de emparelhamento para mostrá-lo aqui.",
    trustedLanPairingEmptyState:
      "Crie um link de emparelhamento quando quiser abrir o aplicativo da web em outro dispositivo.",
    trustedLanPairingExpiresAt: "Expira em",
    trustedLanPairingLabelEmpty: "Sem rótulo",
    trustedLanPairingLabelHint:
      "Opcional. Isso ajuda a lista de navegadores emparelhados a permanecer legível posteriormente.",
    trustedLanPairingLabelInput: "Nome do navegador",
    trustedLanPairingLabelMeta: "Navegador",
    trustedLanPairingLabelPlaceholder:
      "iPad Safari, telefone de cozinha, MacBook de oficina...",
    trustedLanPairingNoteBody:
      "Acesso somente pelo navegador. Nenhuma rota de ingestão de dispositivo.",
    trustedLanPairingNoteTitle: "Somente autenticação humana do navegador",
    trustedLanPairingQrAlt: "Emparelhamento Trusted-LAN QR",
    trustedLanPairingQrHint:
      "Crie um link de emparelhamento para gerar uma visualização QR.",
    trustedLanPairingQrLoading: "Criando visualização do QR...",
    trustedLanPairingQrScanBody:
      "Digitalize com o navegador que deseja emparelhar. O link permanece de curta duração e de uso único.",
    trustedLanPairingQrScanTitle:
      "Digitalize a partir do navegador que você deseja emparelhar",
    trustedLanPairingQrTitle: "Emparelhamento QR",
    trustedLanPairingQrUnavailable:
      "A visualização QR não está disponível nesta compilação. O link de emparelhamento ainda funciona.",
    trustedLanPairingReady: "Link de emparelhamento pronto",
    trustedLanPairingTitle: "Emparelhamento de acesso ao navegador",
    trustedLanPort: "Porta",
    trustedLanPortHint:
      "Mantenha a porta estável para que os links de emparelhamento permaneçam previsíveis.",
    trustedLanPortInput: "Porta do ouvinte",
    trustedLanQuickToggleDisabledHint:
      "Nenhuma interface LAN privada está disponível ainda.",
    trustedLanQuickToggleHint:
      "Executa apenas na interface privada selecionada.",
    trustedLanRecentlyActive: "Recentemente ativo",
    trustedLanRefreshStatus: "Atualizar status",
    trustedLanRevoke: "Revogar",
    trustedLanRevokeAll: "Revogar tudo",
    trustedLanRevokeAllAria:
      "Revogar o acesso de todos os navegadores autorizados {count}",
    trustedLanRevokeAllWithCount: "Revogar tudo ({count})",
    trustedLanRevokeBrowserAria: "Revogar o acesso do navegador para {name}",
    trustedLanRevoked: "Revogado",
    trustedLanRevokedHistory: "Histórico de revogações",
    trustedLanRevokedHistoryBody:
      "Mantenha isso guardado, a menos que precise auditar o acesso a navegadores mais antigos.",
    trustedLanSave: "Salvar rede",
    trustedLanServerControl: "Controle de servidor",
    trustedLanServerTitle: "Servidor de aplicativos da web",
    trustedLanShellUrl: "LAN URL",
    trustedLanStableAddress: "Endereço local estável",
    trustedLanDirectAddress: "Endereço direto atual",
    trustedLanStableAddressUnavailable:
      "Indisponível até que o nome local estável esteja ativo",
    trustedLanDirectAddressHint:
      "Endereço de diagnóstico para o IP selecionado no momento. Ele pode mudar se a rede não reservar um endereço para este computador.",
    trustedLanLocalNameUnavailable: "Endereço local estável indisponível",
    trustedLanLocalNameUnavailableHint:
      "O aplicativo web está sendo executado no IP atual, mas o pareamento e os links QR permanentes permanecem desativados até que o endereço local estável esteja disponível.",
    trustedLanShowNetwork: "Mostrar rede",
    trustedLanShowRevoked: "Mostrar {count} revogado",
    trustedLanStartingInfo: "Iniciando o servidor de aplicativos web...",
    trustedLanStateChecking: "Verificando",
    trustedLanStateLive: "Ao vivo",
    trustedLanStateNeedsAttention: "Verificar",
    trustedLanStateOff: "Desligado",
    trustedLanStatus: "Status Trusted-LAN",
    trustedLanStatusDisabled: "Desativado por padrão",
    trustedLanStatusHintDisabled:
      "O aplicativo da web permanece desativado até você ativá-lo aqui.",
    trustedLanStatusHintEnabled:
      "O servidor está ativado e permanece vinculado a uma interface privada selecionada.",
    trustedLanStatusHintRunning:
      "O servidor de aplicativos web está ativo na interface privada selecionada.",
    trustedLanStatusStarting: "Começando...",
    trustedLanTitle: "Acesso ao navegador Trusted-LAN",
    trustedLanToggleBusy: "Salvando...",
    trustedLanToggleOff: "Desligar",
    trustedLanToggleOn: "Ligar",
    trustedLanUnnamedBrowser: "Navegador emparelhado",
    trustedLanUrlHintDisabled:
      "Nenhuma LAN URL é exposta enquanto o modo LAN confiável permanece desabilitado.",
    trustedLanUrlHintEnabled:
      "Use exatamente este URL para emparelhamento em sua rede confiável.",
    trustedLanUrlUnavailable:
      "Não disponível até que o modo LAN confiável esteja ativado",
    trustedLanWarningBody:
      "Use-o apenas em uma rede em que você confia. O emparelhamento protege o acesso, mas qualquer pessoa nessa rede ainda pode ler o tráfego.",
    trustedLanWarningTitle: "O tráfego Trusted-LAN não está criptografado",
    trustedLanWebappPort: "Porta do aplicativo Web",
    updated: "atualizado",
    updatedPrinter: "Impressora atualizada",
    updatingSwatches: "Atualizando amostras...",
    userManual: "Manual do usuário",
    validateBackup: "Validar arquivo de backup",
    validationExtraTables: "Tabelas extras",
    validationFormat: "Formatar",
    validationMissingTables: "Tabelas ausentes",
    validationRows: "Linhas",
    validationStatusOk: "Totalmente compatível",
    validationStatusWarn: "Tem avisos",
    validationTables: "Tabelas",
    vendors: "Fornecedores",
    version: "Versão",
    viewLicense: "Ver licença",
    viewNotices: "Avisos",
    visibleMissing: "Desaparecimento visível",
  },
  statistics: {
    acrossPrinters: "Em todas as impressoras",
    activeAms: "Slots ativos carregados",
    activeSlotsDetailTitle: "Slots ativos carregados",
    allTime: "Todo o tempo",
    assignedSlots: "Slots com bobinas atribuídas",
    borrowedInInUse: "De terceiros atribuídas",
    borrowedInLowStock: "De terceiros com estoque baixo",
    borrowedInOnHand: "De terceiros disponíveis",
    borrowedInPrintUsage30d: "Uso de impressão registrado · de terceiros",
    borrowedInShort: "Entrada",
    borrowerBreakdownHint:
      "Totais de empréstimos em bobinas ativas e concluídas.",
    borrowerUsage: "Uso do empréstimo por pessoa",
    borrowerUsageByFilament: "Uso de empréstimo por filamento",
    borrowerUsageHint:
      "Abra um mutuário para ver quais filamentos constituem o uso do empréstimo.",
    clientHostBreakdownOnly:
      "A divisão detalhada dos filamentos está atualmente disponível no dispositivo host.",
    clientReadOnlyCached:
      "Host não está disponível. Mostrando o último instantâneo de estatísticas em cache.",
    clientReadOnlyOffline:
      "Host não está disponível e nenhum instantâneo de estatísticas em cache está disponível ainda.",
    clientReadOnlyUpdated: "Atualizado",
    completed: "Concluído",
    consumptionByFilament: "Consumo por filamento",
    currentSnapshot: "Instantâneo atual",
    desktopOnly:
      "As estatísticas estão disponíveis na versão do aplicativo desktop.",
    error: {
      load: "Falha ao carregar estatísticas.",
      loadBorrowerBreakdown: "Falha ao carregar detalhamento do mutuário.",
      loadFilamentBreakdown: "Falha ao carregar o detalhamento por filamento.",
      loadInboundBreakdown: "Falha ao carregar o detalhamento do proprietário.",
    },
    failedJobs: "Trabalhos com falha",
    failedJobsDetailTitle: "Trabalhos com falha por impressora",
    failureRate: "Taxa de falha",
    filteredResultCount:
      "{visible} / {total, plural, one {# resultado} other {# resultados}}",
    filterMaterial: "Material",
    filterVendor: "Fornecedor",
    inboundBreakdownHint:
      "Totais emprestados entre bobinas ativas e concluídas.",
    inboundUsage: "Uso de bobinas de terceiros por proprietário",
    inboundUsageByFilament: "Uso de bobinas de terceiros por filamento",
    inboundUsageHint:
      "Abra um proprietário para ver quais filamentos emprestados constituem seu uso.",
    lentOutShort: "Saída",
    linkedActivity: "Atividade vinculada à impressora",
    loadingBorrowerBreakdown: "Carregando detalhamento do mutuário...",
    loadingFilamentBreakdown: "Carregando quebra de filamento...",
    loadingInboundBreakdown: "Carregando detalhamento do proprietário...",
    loadingInboundUsage: "Carregando uso de bobinas de terceiros...",
    loadingLoan: "Carregando uso do empréstimo...",
    loadingPrinter: "Carregando uso da impressora...",
    loansShort: "Empréstimos",
    loggedJobs: "Trabalhos registrados",
    loggedJobsDetailTitle: "Trabalhos registrados por impressora",
    noActiveSlotFilterMatch:
      "Nenhum slot carregado corresponde ao filtro de propriedade atual.",
    noActiveSlotsBreakdown: "Nenhum slot carregado no momento.",
    noBorrowedInActivity:
      "Nenhum estoque emprestado de terceiros ou uso registrado",
    noBorrowerBreakdown: "Nenhum uso do mutuário registrado ainda.",
    noBorrowerFilterMatch: "Nenhuma linha corresponde aos filtros atuais.",
    noFailedJobsBreakdown: "Nenhum trabalho com falha foi registrado.",
    noFilamentBreakdown: "Nenhum consumo de filamento foi registrado ainda.",
    noFilamentFilterMatch: "Nenhuma linha corresponde aos filtros atuais.",
    noInboundBreakdown:
      "Nenhum uso por proprietário de bobinas de terceiros foi registrado ainda.",
    noInboundUsage: "Nenhum uso de bobinas de terceiros registrado ainda.",
    noLoanUsage: "Nenhum uso de empréstimo registrado ainda.",
    noLoggedJobsBreakdown: "Nenhum trabalho registrado ainda.",
    noPrinterActivity: "Nenhuma atividade de impressora disponível ainda.",
    ownedInUse: "Próprias atribuídas",
    ownedLowStock: "Próprias com estoque baixo",
    ownedOnHand: "Próprias disponíveis",
    ownedPrintUsage30d: "Uso de impressão registrado · próprias",
    ownershipSnapshot: "Instantâneo de propriedade",
    ownershipSnapshotHint:
      "Divisão por propriedade do estoque disponível e do uso de impressão registrado. Os cartões principais acima ainda mostram os totais combinados.",
    perPrinter: "Consumo por impressora",
    perPrinterHint:
      "Abra uma impressora para ver o consumo de filamento agrupado por material.",
    printerCount: "{count, plural, one {# impressora} other {# impressoras}}",
    printerCountMany: "impressoras",
    printerCountOne: "impressora",
    resetFilters: "Redefinir filtros",
    resultCount: "{count, plural, one {# resultado} other {# resultados}}",
    resultCountMany: "resultados",
    resultCountOne: "resultado",
    searchBorrowerFilamentPlaceholder: "Pesquise filamento, cor ou fornecedor",
    searchFilamentPlaceholder:
      "Pesquise filamento, cor, fornecedor ou proprietário",
    sortJobsDesc: "Mais trabalhos",
    sortNameAsc: "Nome (A-Z)",
    sortUsedAsc: "Menos usado",
    sortUsedDesc: "Mais usado",
    subtitle:
      "Veja a atividade da impressora, o uso de materiais e o consumo de empréstimos em uma visão geral.",
    totalConsumption: "Consumo Total",
    viewDetails: "Ver detalhes",
  },
  vendor: {
    bambu: "Bambu",
    esun: "eSUN",
    generic: "Genérico",
  },
  wishlist: {
    addMissingFilamentManual: "Faltou o filamento? Adicione-o manualmente",
    catalog: "catálogo",
    colorName: "Nome da cor",
    confirmRemoveAction: "Confirmar remoção",
    confirmRemoveHint:
      "Isso remove a entrada da fila. As bobinas de estoque existentes não são afetadas.",
    confirmRemoveTapAgain:
      "Clique em Remover novamente para confirmar a exclusão desta entrada da lista de desejos.",
    confirmRemoveTitle: "Remover {name} da fila de compra?",
    elapsed: "Decorrido",
    empty: "Ainda não há itens na lista de desejos.",
    error: {
      add: "Falha ao adicionar item da lista de desejos.",
      delete: "Falha ao excluir item da lista de desejos.",
      invalidSelection:
        "Escolha uma configuração de filamento válida antes de adicionar à lista de desejos.",
      loadCatalog: "Não foi possível carregar o catálogo mestre.",
      refreshBambu: "Falha na atualização do catálogo.",
      refreshEsun: "A atualização do catálogo eSUN falhou.",
      updateStatus: "Falha ao atualizar o status da lista de desejos.",
      zeroBambu:
        "Atualização concluída com 0 linhas importadas. A loja pode ter taxa limitada ou alterada.",
      zeroEsun:
        "Atualização do eSUN concluída com 0 linhas importadas. O formato da loja pode ter mudado.",
    },
    filamentName: "Nome do filamento",
    hexOptional: "Cor da amostra (opcional)",
    itemStatusGroup: "Status para {name}",
    loading: "Carregando lista de desejos...",
    materialPlaceholder: "Material (por exemplo, PLA)",
    noneFiltered: "Nenhum item corresponde ao filtro de status selecionado.",
    noRefreshOutput: "Nenhuma saída de atualização disponível ainda.",
    noSearchResults:
      "Nenhum item da lista de desejos corresponde a esta pesquisa.",
    phase: "Fase",
    qty: "Quantidade",
    refreshing: "Refrescante",
    refreshLog: "atualizar registro",
    refreshPreparing: "Preparando atualização do catálogo...",
    refreshPreparingBambu: "Preparando atualização do catálogo Bambu...",
    refreshPreparingEsun: "Preparando atualização do catálogo eSUN...",
    resultCount: "{count, plural, one {# item} other {# itens}}",
    resultCountMany: "Unid",
    resultCountOne: "item",
    searchBambu: "Pesquise material/cor ou código de filamento Bambu",
    searchEsun: "Pesquise material/cor eSUN",
    searchQueueLabel: "Pesquisar fila de compras",
    searchQueuePlaceholder: "Pesquise por nome, cor ou fornecedor",
    statusFilter: "Filtro de status da lista de desejos",
    statusOnOrder: "Encomendado",
    statusReceived: "Recebido",
    statusWishlist: "Lista de desejos",
    vendor: "Fornecedor",
    vendorPlaceholder: "Fornecedor (por exemplo, genérico, eSUN)",
    viewRefreshLog: "Ver registro de atualização",
  },
};

export default ptBRDictionary;
