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

  const locale = withGlobalValue("localStorage", storage, () => resolveInitialLocale());

  assert.equal(locale, "nb");
});

test("resolveInitialLocale migrates stored regional and legacy aliases", () => {
  const writes: Array<[string, string]> = [];
  const storage = {
    getItem: () => "no-NO",
    setItem: (key: string, value: string) => writes.push([key, value]),
  };

  const locale = withGlobalValue("localStorage", storage, () => resolveInitialLocale());

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
  const locale = withGlobalValue("window", windowRef, () => resolveInitialLocale());
  assert.equal(locale, "en-XA");

  const rtlWindowRef = { location: { search: "?bfm_locale=ar-XB" } };
  const rtlLocale = withGlobalValue("window", rtlWindowRef, () => resolveInitialLocale());
  assert.equal(rtlLocale, "ar-XB");

  const cjkWindowRef = { location: { search: "?bfm_locale=zh-XB" } };
  const cjkLocale = withGlobalValue("window", cjkWindowRef, () => resolveInitialLocale());
  assert.equal(cjkLocale, "zh-XB");
});

test("locale dictionaries lazy-load and cache supported locales", async () => {
  const enDictionary = await loadLocaleDictionary("en");

  assert.equal(lookup(enDictionary, "app.title"), "Filament Manager");
  assert.equal(lookup(enDictionary, "common.cancel"), "Cancel");
  assert.equal(lookup(enDictionary, "common.selected"), "Selected");
  assert.equal(lookup(enDictionary, "inventory.loanSearchLabel"), "Search available rolls");
  assert.equal(lookup(enDictionary, "inventory.rfidTechnicalDetails"), "Technical details");
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
  assert.equal(lookup(nbDictionary, "inventory.rfidTechnicalDetails"), "Tekniske detaljer");
  assert.equal(lookup(nbDictionary, "inventory.rfidConnected"), "Tilkoblet");
  assert.equal(lookup(nbDictionary, "inventory.rfidAmsSlotPresent"), "Fysisk til stede");
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
  assert.equal(lookup(frenchDictionary, "inventory.saveRollChanges"), "Enregistrer les modifications");
  assert.equal(lookup(frenchDictionary, "wishlist.statusOnOrder"), "Commandé");
  assert.equal(lookup(frenchDictionary, "loans.confirmHandBackAction"), "Confirmer la restitution");
  assert.equal(lookup(frenchDictionary, "inventory.bambuBatchCameraAction"), "Utiliser la webcam");
  assert.equal(lookup(frenchDictionary, "inventory.rfidTechnicalDetails"), "Détails techniques");
  assert.equal(lookup(frenchDictionary, "printers.slotOnboarding"), "Intégration AMS");
  assert.equal(lookup(frenchDictionary, "statistics.perPrinter"), "Consommation par imprimante");
  assert.equal(lookup(frenchDictionary, "settings.inventoryOverviewPaperFormat"), "Format du papier");
  assert.equal(lookup(frenchDictionary, "settings.librarySyncClient"), "Client");
  assert.equal(lookup(frenchDictionary, "settings.companionStatusRunning"), "Actif");
  assert.equal(lookup(frenchDictionary, "settings.trustedLanNetworkDetails"), "Détails du réseau");
  assert.equal(lookup(frenchDictionary, "settings.catalogRefreshTitle"), "Mises à jour des catalogues fabricants");
  assert.equal(lookup(frenchDictionary, "settings.bambuLiveDiagnostics"), "Diagnostics");
  assert.equal(lookup(frenchDictionary, "settings.cachedReused"), "Données en cache réutilisées");
  assert.equal(lookup(frenchDictionary, "dashboard.clientSnapshotCardTitle"), "Aperçu de l’hôte en lecture seule");
  assert.equal(getCachedLocaleDictionary("fr"), frenchDictionary);

  const spanishDictionary = await loadLocaleDictionary("es");
  assert.equal(lookup(spanishDictionary, "nav.inventory"), "Inventario");
  assert.equal(lookup(spanishDictionary, "common.cancel"), "Cancelar");
  assert.equal(lookup(spanishDictionary, "dashboard.totalSpools"), "Bobinas totales");
  assert.equal(lookup(spanishDictionary, "inventory.title"), "Bobinas");
  assert.equal(lookup(spanishDictionary, "inventory.addFilament"), "Añadir filamento");
  assert.equal(lookup(spanishDictionary, "wishlist.statusOnOrder"), "Pedido");
  assert.equal(lookup(spanishDictionary, "loans.confirmReturnAction"), "Confirmar devolución");
  assert.equal(lookup(spanishDictionary, "inventory.bambuBatchCameraAction"), "Usar webcam");
  assert.equal(lookup(spanishDictionary, "inventory.rfidTechnicalDetails"), "Detalles técnicos");
  assert.equal(lookup(spanishDictionary, "inventory.purgeConfirmTitle"), "¿Eliminar permanentemente esta bobina y todo su historial?");
  assert.equal(lookup(spanishDictionary, "printers.showSlots"), "Mostrar ranuras");
  assert.equal(lookup(spanishDictionary, "printers.slotOnboarding"), "Incorporación AMS");
  assert.equal(lookup(spanishDictionary, "settings.bambuLiveSection"), "Estado Live Bambu");
  assert.equal(lookup(spanishDictionary, "settings.printerDiscardChanges"), "Descartar cambios");
  assert.equal(getCachedLocaleDictionary("es"), spanishDictionary);
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
