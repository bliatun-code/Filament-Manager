import assert from "node:assert/strict";
import test from "node:test";

import {
  getCachedLocaleDictionary,
  loadLocaleDictionary,
  lookup,
  persistLocale,
  resolveInitialLocale,
} from "./i18n";

function withGlobalValue<T>(
  key: "localStorage" | "navigator" | "window",
  value: unknown,
  run: () => T,
): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
  });
  try {
    return run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
}

test("resolveInitialLocale uses stored supported locale", () => {
  const storage = {
    getItem: () => "nb",
  };

  const locale = withGlobalValue("localStorage", storage, () =>
    resolveInitialLocale(),
  );

  assert.equal(locale, "nb");
});

test("resolveInitialLocale migrates stored regional and legacy aliases", () => {
  const writes: Array<[string, string]> = [];
  const storage = {
    getItem: () => "no-NO",
    setItem: (key: string, value: string) => writes.push([key, value]),
  };

  const locale = withGlobalValue("localStorage", storage, () =>
    resolveInitialLocale(),
  );

  assert.equal(locale, "nb");
  assert.deepEqual(writes, [["bfm-locale", "nb"]]);
});

test("resolveInitialLocale lets screenshot URLs override stored locale", () => {
  const storage = {
    getItem: () => "nb",
  };
  const windowRef = {
    location: {
      search: "?bfm_locale=en",
    },
  };

  const locale = withGlobalValue("window", windowRef, () =>
    withGlobalValue("localStorage", storage, () => resolveInitialLocale()),
  );

  assert.equal(locale, "en");
});

test("resolveInitialLocale accepts the QA-only pseudo locale from screenshot URLs", () => {
  const windowRef = { location: { search: "?bfm_locale=en-XA" } };
  const locale = withGlobalValue("window", windowRef, () =>
    resolveInitialLocale(),
  );
  assert.equal(locale, "en-XA");

  const rtlWindowRef = { location: { search: "?bfm_locale=ar-XB" } };
  const rtlLocale = withGlobalValue("window", rtlWindowRef, () =>
    resolveInitialLocale(),
  );
  assert.equal(rtlLocale, "ar-XB");

  const cjkWindowRef = { location: { search: "?bfm_locale=zh-XB" } };
  const cjkLocale = withGlobalValue("window", cjkWindowRef, () =>
    resolveInitialLocale(),
  );
  assert.equal(cjkLocale, "zh-XB");
});

test("resolveInitialLocale accepts hidden Brazilian Portuguese only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=pt-BR" } };
  const locale = withGlobalValue("window", windowRef, () =>
    resolveInitialLocale(),
  );
  assert.equal(locale, "pt-BR");
});

test("resolveInitialLocale accepts hidden Italian only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=it-IT" } };
  const locale = withGlobalValue("window", windowRef, () =>
    resolveInitialLocale(),
  );
  assert.equal(locale, "it-IT");
});

test("resolveInitialLocale accepts hidden Polish only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=pl-PL" } };
  const locale = withGlobalValue("window", windowRef, () =>
    resolveInitialLocale(),
  );
  assert.equal(locale, "pl-PL");
});

test("resolveInitialLocale accepts hidden Dutch only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=nl-NL" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "nl-NL");
});

test("resolveInitialLocale accepts hidden Czech only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=cs-CZ" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "cs-CZ");
});

test("resolveInitialLocale accepts hidden Simplified Chinese only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=zh-CN" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "zh-CN");
});

test("resolveInitialLocale accepts hidden Japanese only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=ja-JP" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "ja-JP");
});

test("resolveInitialLocale accepts hidden Korean only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=ko-KR" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "ko-KR");
});

test("resolveInitialLocale accepts hidden Traditional Chinese only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=zh-TW" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "zh-TW");
});

test("resolveInitialLocale accepts hidden Turkish only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=tr-TR" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "tr-TR");
});

test("resolveInitialLocale accepts hidden Ukrainian only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=uk-UA" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "uk-UA");
});

test("resolveInitialLocale accepts hidden Russian only through a QA URL", () => {
  const windowRef = { location: { search: "?bfm_locale=ru-RU" } };
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "ru-RU");
});

test("locale dictionaries lazy-load and cache supported locales", async () => {
  const enDictionary = await loadLocaleDictionary("en");

  assert.equal(lookup(enDictionary, "app.title"), "Filament Manager");
  assert.equal(lookup(enDictionary, "common.cancel"), "Cancel");
  assert.equal(lookup(enDictionary, "common.selected"), "Selected");
  assert.equal(
    lookup(enDictionary, "inventory.loanSearchLabel"),
    "Search available rolls",
  );
  assert.equal(
    lookup(enDictionary, "inventory.rfidTechnicalDetails"),
    "Technical details",
  );
  assert.equal(lookup(enDictionary, "inventory.rfidConnected"), "Connected");
  assert.equal(
    lookup(enDictionary, "inventory.rollHistoryCollapsed"),
    "Roll history is collapsed by default. Expand it to view the events.",
  );
  assert.equal(getCachedLocaleDictionary("en"), enDictionary);

  const nbDictionary = await loadLocaleDictionary("nb");

  assert.equal(lookup(nbDictionary, "nav.inventory"), "Lager");
  assert.equal(lookup(nbDictionary, "common.cancel"), "Avbryt");
  assert.equal(lookup(nbDictionary, "common.selected"), "Valgt");
  assert.equal(
    lookup(nbDictionary, "inventory.loanSearchLabel"),
    "Søk i tilgjengelige filamenter",
  );
  assert.equal(
    lookup(nbDictionary, "inventory.rfidTechnicalDetails"),
    "Tekniske detaljer",
  );
  assert.equal(lookup(nbDictionary, "inventory.rfidConnected"), "Tilkoblet");
  assert.equal(
    lookup(nbDictionary, "inventory.rfidAmsSlotPresent"),
    "Fysisk til stede",
  );
  assert.equal(
    lookup(nbDictionary, "inventory.rollHistoryCollapsed"),
    "Filamenthistorikken er skjult som standard. Utvid den for å se hendelsene.",
  );
  assert.equal(getCachedLocaleDictionary("nb"), nbDictionary);

  const pseudoDictionary = await loadLocaleDictionary("en-XA");
  assert.equal(lookup(pseudoDictionary, "app.title"), "Filament Manager");
  assert.equal(getCachedLocaleDictionary("en-XA"), pseudoDictionary);

  const rtlPseudoDictionary = await loadLocaleDictionary("ar-XB");
  assert.equal(lookup(rtlPseudoDictionary, "app.title"), "Filament Manager");
  assert.equal(getCachedLocaleDictionary("ar-XB"), rtlPseudoDictionary);

  const cjkPseudoDictionary = await loadLocaleDictionary("zh-XB");
  assert.equal(lookup(cjkPseudoDictionary, "app.title"), "Filament Manager");
  assert.equal(getCachedLocaleDictionary("zh-XB"), cjkPseudoDictionary);

  const germanDictionary = await loadLocaleDictionary("de");
  assert.equal(lookup(germanDictionary, "nav.inventory"), "Bestand");
  assert.equal(lookup(germanDictionary, "common.cancel"), "Abbrechen");
  assert.equal(
    lookup(germanDictionary, "inventory.rfidTechnicalDetails"),
    "Technische Details",
  );
  assert.equal(getCachedLocaleDictionary("de"), germanDictionary);

  const frenchDictionary = await loadLocaleDictionary("fr");
  assert.equal(lookup(frenchDictionary, "nav.inventory"), "Stock");
  assert.equal(lookup(frenchDictionary, "common.cancel"), "Annuler");
  assert.equal(
    lookup(frenchDictionary, "inventory.saveRollChanges"),
    "Enregistrer les modifications",
  );
  assert.equal(lookup(frenchDictionary, "wishlist.statusOnOrder"), "Commandé");
  assert.equal(
    lookup(frenchDictionary, "loans.confirmHandBackAction"),
    "Confirmer la restitution",
  );
  assert.equal(
    lookup(frenchDictionary, "inventory.bambuBatchCameraAction"),
    "Utiliser la webcam",
  );
  assert.equal(
    lookup(frenchDictionary, "inventory.rfidTechnicalDetails"),
    "Détails techniques",
  );
  assert.equal(
    lookup(frenchDictionary, "printers.slotOnboarding"),
    "Intégration AMS",
  );
  assert.equal(
    lookup(frenchDictionary, "statistics.perPrinter"),
    "Consommation par imprimante",
  );
  assert.equal(
    lookup(frenchDictionary, "settings.inventoryOverviewPaperFormat"),
    "Format du papier",
  );
  assert.equal(
    lookup(frenchDictionary, "settings.librarySyncClient"),
    "Client",
  );
  assert.equal(
    lookup(frenchDictionary, "settings.companionStatusRunning"),
    "Actif",
  );
  assert.equal(
    lookup(frenchDictionary, "settings.trustedLanNetworkDetails"),
    "Détails du réseau",
  );
  assert.equal(
    lookup(frenchDictionary, "settings.catalogRefreshTitle"),
    "Mises à jour des catalogues fabricants",
  );
  assert.equal(
    lookup(frenchDictionary, "settings.bambuLiveDiagnostics"),
    "Diagnostics",
  );
  assert.equal(
    lookup(frenchDictionary, "settings.cachedReused"),
    "Données en cache réutilisées",
  );
  assert.equal(
    lookup(frenchDictionary, "dashboard.clientSnapshotCardTitle"),
    "Aperçu de l’hôte en lecture seule",
  );
  assert.equal(getCachedLocaleDictionary("fr"), frenchDictionary);

  const spanishDictionary = await loadLocaleDictionary("es");
  assert.equal(lookup(spanishDictionary, "nav.inventory"), "Inventario");
  assert.equal(lookup(spanishDictionary, "common.cancel"), "Cancelar");
  assert.equal(
    lookup(spanishDictionary, "dashboard.totalSpools"),
    "Bobinas totales",
  );
  assert.equal(lookup(spanishDictionary, "inventory.title"), "Bobinas");
  assert.equal(
    lookup(spanishDictionary, "inventory.addFilament"),
    "Añadir filamento",
  );
  assert.equal(lookup(spanishDictionary, "wishlist.statusOnOrder"), "Pedido");
  assert.equal(
    lookup(spanishDictionary, "loans.confirmReturnAction"),
    "Confirmar devolución",
  );
  assert.equal(
    lookup(spanishDictionary, "inventory.bambuBatchCameraAction"),
    "Usar webcam",
  );
  assert.equal(
    lookup(spanishDictionary, "inventory.rfidTechnicalDetails"),
    "Detalles técnicos",
  );
  assert.equal(
    lookup(spanishDictionary, "inventory.purgeConfirmTitle"),
    "¿Eliminar permanentemente esta bobina y todo su historial?",
  );
  assert.equal(
    lookup(spanishDictionary, "printers.showSlots"),
    "Mostrar ranuras",
  );
  assert.equal(
    lookup(spanishDictionary, "printers.slotOnboarding"),
    "Registro desde AMS",
  );
  assert.equal(
    lookup(spanishDictionary, "settings.bambuLiveSection"),
    "Estado Live Bambu",
  );
  assert.equal(
    lookup(spanishDictionary, "settings.printerDiscardChanges"),
    "Descartar cambios",
  );
  assert.equal(
    lookup(spanishDictionary, "statistics.perPrinter"),
    "Consumo por impresora",
  );
  assert.equal(
    lookup(spanishDictionary, "statistics.borrowerUsage"),
    "Consumo de préstamos por persona",
  );
  assert.equal(getCachedLocaleDictionary("es"), spanishDictionary);

  const portugueseDictionary = await loadLocaleDictionary("pt-BR");
  assert.equal(lookup(portugueseDictionary, "nav.inventory"), "Inventário");
  assert.equal(lookup(portugueseDictionary, "common.cancel"), "Cancelar");
  assert.equal(
    lookup(portugueseDictionary, "dashboard.totalSpools"),
    "Bobinas totais",
  );
  assert.equal(lookup(portugueseDictionary, "inventory.title"), "Bobinas");
  assert.equal(
    lookup(portugueseDictionary, "wishlist.statusOnOrder"),
    "Encomendado",
  );
  assert.equal(
    lookup(portugueseDictionary, "loans.confirmReturnAction"),
    "Confirmar devolução",
  );
  assert.equal(
    lookup(portugueseDictionary, "inventory.bambuBatchCameraAction"),
    "Usar webcam",
  );
  assert.equal(
    lookup(portugueseDictionary, "printers.showSlots"),
    "Mostrar slots",
  );
  assert.equal(
    lookup(portugueseDictionary, "statistics.perPrinter"),
    "Consumo por impressora",
  );
  assert.equal(getCachedLocaleDictionary("pt-BR"), portugueseDictionary);

  const italianDictionary = await loadLocaleDictionary("it-IT");
  assert.equal(lookup(italianDictionary, "nav.inventory"), "Inventario");
  assert.equal(lookup(italianDictionary, "common.cancel"), "Annulla");
  assert.equal(
    lookup(italianDictionary, "dashboard.totalSpools"),
    "Bobine totali",
  );
  assert.equal(lookup(italianDictionary, "inventory.title"), "Bobine");
  assert.equal(lookup(italianDictionary, "wishlist.statusOnOrder"), "Ordinato");
  assert.equal(
    lookup(italianDictionary, "loans.confirmReturnAction"),
    "Conferma il reso",
  );
  assert.equal(
    lookup(italianDictionary, "inventory.bambuBatchCameraAction"),
    "Usa la webcam",
  );
  assert.equal(lookup(italianDictionary, "printers.showSlots"), "Mostra slot");
  assert.equal(
    lookup(italianDictionary, "statistics.perPrinter"),
    "Consumo per stampante",
  );
  assert.equal(getCachedLocaleDictionary("it-IT"), italianDictionary);

  const polishDictionary = await loadLocaleDictionary("pl-PL");
  assert.equal(lookup(polishDictionary, "nav.inventory"), "Magazyn");
  assert.equal(lookup(polishDictionary, "common.cancel"), "Anuluj");
  assert.equal(lookup(polishDictionary, "dashboard.totalSpools"), "Wszystkie szpule");
  assert.equal(lookup(polishDictionary, "inventory.title"), "Szpule");
  assert.equal(lookup(polishDictionary, "wishlist.statusOnOrder"), "Zamówione");
  assert.equal(lookup(polishDictionary, "inventory.bambuBatchCameraAction"), "Użyj kamery internetowej");
  assert.equal(lookup(polishDictionary, "printers.showSlots"), "Pokaż gniazda");
  assert.equal(lookup(polishDictionary, "statistics.perPrinter"), "Zużycie według drukarki");
  assert.equal(getCachedLocaleDictionary("pl-PL"), polishDictionary);

  const dutchDictionary = await loadLocaleDictionary("nl-NL");
  assert.equal(lookup(dutchDictionary, "nav.inventory"), "Voorraad");
  assert.equal(lookup(dutchDictionary, "common.cancel"), "Annuleren");
  assert.equal(lookup(dutchDictionary, "dashboard.totalSpools"), "Totaal aantal rollen");
  assert.equal(lookup(dutchDictionary, "inventory.title"), "Rollen");
  assert.equal(lookup(dutchDictionary, "wishlist.statusOnOrder"), "Besteld");
  assert.equal(lookup(dutchDictionary, "inventory.bambuBatchCameraAction"), "Gebruik webcam");
  assert.equal(lookup(dutchDictionary, "printers.showSlots"), "Slots tonen");
  assert.equal(lookup(dutchDictionary, "statistics.perPrinter"), "Verbruik per printer");
  assert.equal(getCachedLocaleDictionary("nl-NL"), dutchDictionary);

  const czechDictionary = await loadLocaleDictionary("cs-CZ");
  assert.equal(lookup(czechDictionary, "nav.inventory"), "Sklad");
  assert.equal(lookup(czechDictionary, "common.cancel"), "Zrušit");
  assert.equal(lookup(czechDictionary, "dashboard.totalSpools"), "Celkem rolí");
  assert.equal(lookup(czechDictionary, "inventory.title"), "Role");
  assert.equal(lookup(czechDictionary, "wishlist.statusOnOrder"), "Objednáno");
  assert.equal(lookup(czechDictionary, "inventory.bambuBatchCameraAction"), "Použijte webovou kameru");
  assert.equal(lookup(czechDictionary, "printers.showSlots"), "Zobrazit sloty");
  assert.equal(lookup(czechDictionary, "statistics.perPrinter"), "Spotřeba podle tiskárny");
  assert.equal(getCachedLocaleDictionary("cs-CZ"), czechDictionary);

  const chineseDictionary = await loadLocaleDictionary("zh-CN");
  assert.equal(lookup(chineseDictionary, "nav.inventory"), "库存");
  assert.equal(lookup(chineseDictionary, "common.cancel"), "取消");
  assert.equal(lookup(chineseDictionary, "dashboard.totalSpools"), "耗材卷总数");
  assert.equal(lookup(chineseDictionary, "inventory.title"), "耗材卷");
  assert.equal(lookup(chineseDictionary, "wishlist.statusOnOrder"), "已订购");
  assert.equal(lookup(chineseDictionary, "inventory.bambuBatchCameraAction"), "使用网络摄像头");
  assert.equal(lookup(chineseDictionary, "printers.showSlots"), "显示料槽");
  assert.equal(lookup(chineseDictionary, "statistics.perPrinter"), "按打印机统计用量");
  assert.equal(getCachedLocaleDictionary("zh-CN"), chineseDictionary);

  const japaneseDictionary = await loadLocaleDictionary("ja-JP");
  assert.equal(lookup(japaneseDictionary, "nav.inventory"), "在庫");
  assert.equal(lookup(japaneseDictionary, "common.cancel"), "キャンセル");
  assert.equal(lookup(japaneseDictionary, "dashboard.totalSpools"), "ロール合計");
  assert.equal(lookup(japaneseDictionary, "inventory.title"), "ロール");
  assert.equal(lookup(japaneseDictionary, "wishlist.statusOnOrder"), "注文済み");
  assert.equal(lookup(japaneseDictionary, "inventory.bambuBatchCameraAction"), "ウェブカメラを使用する");
  assert.equal(lookup(japaneseDictionary, "printers.showSlots"), "スロットを表示");
  assert.equal(lookup(japaneseDictionary, "statistics.perPrinter"), "プリンター別使用量");
  assert.equal(getCachedLocaleDictionary("ja-JP"), japaneseDictionary);

  const koreanDictionary = await loadLocaleDictionary("ko-KR");
  assert.equal(lookup(koreanDictionary, "nav.inventory"), "재고");
  assert.equal(lookup(koreanDictionary, "common.cancel"), "취소");
  assert.equal(lookup(koreanDictionary, "dashboard.totalSpools"), "전체 롤");
  assert.equal(lookup(koreanDictionary, "inventory.title"), "롤");
  assert.equal(lookup(koreanDictionary, "wishlist.statusOnOrder"), "주문 중");
  assert.equal(lookup(koreanDictionary, "inventory.bambuBatchCameraAction"), "웹캠 사용");
  assert.equal(lookup(koreanDictionary, "printers.showSlots"), "슬롯 표시");
  assert.equal(lookup(koreanDictionary, "statistics.perPrinter"), "프린터별 사용량");
  assert.equal(getCachedLocaleDictionary("ko-KR"), koreanDictionary);

  const traditionalChineseDictionary = await loadLocaleDictionary("zh-TW");
  assert.equal(lookup(traditionalChineseDictionary, "nav.inventory"), "庫存");
  assert.equal(lookup(traditionalChineseDictionary, "common.cancel"), "取消");
  assert.equal(lookup(traditionalChineseDictionary, "dashboard.totalSpools"), "線材捲總數");
  assert.equal(lookup(traditionalChineseDictionary, "inventory.title"), "線材捲");
  assert.equal(lookup(traditionalChineseDictionary, "wishlist.statusOnOrder"), "已訂購");
  assert.equal(lookup(traditionalChineseDictionary, "inventory.bambuBatchCameraAction"), "使用網路攝影機");
  assert.equal(lookup(traditionalChineseDictionary, "printers.showSlots"), "顯示槽位");
  assert.equal(lookup(traditionalChineseDictionary, "statistics.perPrinter"), "各印表機用量");
  assert.equal(getCachedLocaleDictionary("zh-TW"), traditionalChineseDictionary);

  const turkishDictionary = await loadLocaleDictionary("tr-TR");
  assert.equal(lookup(turkishDictionary, "nav.inventory"), "Envanter");
  assert.equal(lookup(turkishDictionary, "common.cancel"), "İptal");
  assert.equal(lookup(turkishDictionary, "dashboard.totalSpools"), "Toplam makara");
  assert.equal(lookup(turkishDictionary, "inventory.title"), "Makaralar");
  assert.equal(lookup(turkishDictionary, "wishlist.statusOnOrder"), "Sipariş verildi");
  assert.equal(lookup(turkishDictionary, "inventory.bambuBatchCameraAction"), "Web kamerasını kullan");
  assert.equal(lookup(turkishDictionary, "printers.showSlots"), "Yuvaları göster");
  assert.equal(lookup(turkishDictionary, "statistics.perPrinter"), "Yazıcıya göre kullanım");
  assert.equal(getCachedLocaleDictionary("tr-TR"), turkishDictionary);

  const ukrainianDictionary = await loadLocaleDictionary("uk-UA");
  assert.equal(lookup(ukrainianDictionary, "nav.inventory"), "Інвентар");
  assert.equal(lookup(ukrainianDictionary, "common.cancel"), "Скасувати");
  assert.equal(lookup(ukrainianDictionary, "dashboard.totalSpools"), "Усього котушок");
  assert.equal(lookup(ukrainianDictionary, "inventory.title"), "Котушки");
  assert.equal(lookup(ukrainianDictionary, "wishlist.statusOnOrder"), "Замовлено");
  assert.equal(lookup(ukrainianDictionary, "inventory.bambuBatchCameraAction"), "Використати вебкамеру");
  assert.equal(lookup(ukrainianDictionary, "printers.showSlots"), "Показати слоти");
  assert.equal(lookup(ukrainianDictionary, "statistics.perPrinter"), "Використання за принтером");
  assert.equal(getCachedLocaleDictionary("uk-UA"), ukrainianDictionary);

  const russianDictionary = await loadLocaleDictionary("ru-RU");
  assert.equal(lookup(russianDictionary, "nav.inventory"), "Инвентарь");
  assert.equal(lookup(russianDictionary, "common.cancel"), "Отмена");
  assert.equal(lookup(russianDictionary, "dashboard.totalSpools"), "Всего катушек");
  assert.equal(lookup(russianDictionary, "inventory.title"), "Катушки");
  assert.equal(lookup(russianDictionary, "wishlist.statusOnOrder"), "Под заказ");
  assert.equal(lookup(russianDictionary, "inventory.bambuBatchCameraAction"), "Использовать веб-камеру");
  assert.equal(lookup(russianDictionary, "printers.showSlots"), "Показать слоты");
  assert.equal(lookup(russianDictionary, "statistics.perPrinter"), "Использование каждого принтера");
  assert.equal(getCachedLocaleDictionary("ru-RU"), russianDictionary);
});

test("printer Live Bambu settings have explicit English and Norwegian locale copy", async () => {
  const enDictionary = await loadLocaleDictionary("en");
  const nbDictionary = await loadLocaleDictionary("nb");
  const expectedCopy = {
    bambuLiveSection: ["Live Bambu status", "Live Bambu-status"],
    bambuLiveHint: [
      "Optional local read-only integration for observing printer and AMS status.",
      "Valgfri lokal, skrivebeskyttet integrasjon for å observere printer- og AMS-status.",
    ],
    enableBambuLive: ["Enable live status", "Aktiver live-status"],
    bambuLiveStandaloneOnly: [
      "Live Bambu status is configured on the host desktop.",
      "Live Bambu-status konfigureres på vertsmaskinen.",
    ],
    bambuLiveHost: ["Printer host / IP", "Printeradresse / IP"],
    bambuLiveAccessCode: ["Access code", "Tilgangskode"],
    bambuLivePrinterSerial: ["Printer serial", "Printerserienummer"],
    bambuLiveCredentialsNote: [
      "Credentials are stored locally on this desktop.",
      "Tilgangsopplysningene lagres lokalt på denne maskinen.",
    ],
    bambuLiveDisabledNote: [
      "Leave disabled to keep the current printer flow unchanged.",
      "La funksjonen være deaktivert for å beholde gjeldende printerflyt uendret.",
    ],
  } as const;

  for (const [key, [expectedEn, expectedNb]] of Object.entries(expectedCopy)) {
    assert.equal(lookup(enDictionary, `settings.${key}`), expectedEn);
    assert.equal(lookup(nbDictionary, `settings.${key}`), expectedNb);
  }
  assert.doesNotMatch(
    JSON.stringify(expectedCopy),
    /\b(?:beta|experimental|experimentell|eksperimentell)\b/i,
  );
});

test("Spanish settings pilot covers program, label sheet, and maintenance workflows", async () => {
  const esDictionary = await loadLocaleDictionary("es");

  assert.equal(
    lookup(esDictionary, "settings.productTour"),
    "Recorrido del producto",
  );
  assert.equal(
    lookup(esDictionary, "settings.inventoryOverviewPaperFormat"),
    "Formato del papel",
  );
  assert.equal(
    lookup(esDictionary, "settings.exportFullBackup"),
    "Exportar copia de seguridad completa (JSON)",
  );
  assert.equal(lookup(esDictionary, "settings.librarySyncClient"), "Cliente");
  assert.equal(
    lookup(esDictionary, "settings.librarySyncConfirmSwitchToClient"),
    "Cambiar a Cliente",
  );
});

test("resolveInitialLocale falls back when localStorage throws", () => {
  const storage = {
    getItem: () => {
      throw new Error("storage denied");
    },
  };
  const navigatorRef = {
    language: "no-NO",
  };

  const locale = withGlobalValue("localStorage", storage, () =>
    withGlobalValue("navigator", navigatorRef, () => resolveInitialLocale()),
  );

  assert.equal(locale, "nb");
});

test("resolveInitialLocale checks navigator languages in preference order", () => {
  const storage = { getItem: () => null };
  const navigatorRef = {
    language: "en-US",
    languages: ["fr-FR", "de-DE", "nb-NO", "en-US"],
  };

  const locale = withGlobalValue("localStorage", storage, () =>
    withGlobalValue("navigator", navigatorRef, () => resolveInitialLocale()),
  );

  assert.equal(locale, "fr");
});

test("persistLocale ignores localStorage write failures", () => {
  const storage = {
    setItem: () => {
      throw new Error("storage denied");
    },
  };

  assert.doesNotThrow(() => {
    withGlobalValue("localStorage", storage, () => persistLocale("en"));
  });
});
