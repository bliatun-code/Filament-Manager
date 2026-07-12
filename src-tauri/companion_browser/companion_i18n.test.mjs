import test from "node:test";
import assert from "node:assert/strict";

import {
  readStoredCompanionLocale,
  resolveInitialCompanionLocale,
  t,
} from "./companion_i18n.js";

test("readStoredCompanionLocale falls back when storage throws", () => {
  assert.equal(
    readStoredCompanionLocale("locale-key", {
      getItem() {
        throw new Error("storage denied");
      },
    }),
    "en",
  );
});

test("resolveInitialCompanionLocale falls back to navigator when storage throws", () => {
  const locale = resolveInitialCompanionLocale(
    {
      getItem() {
        throw new Error("storage denied");
      },
    },
    { language: "nb-NO" },
  );

  assert.equal(locale, "nb");
});

test("resolveInitialCompanionLocale migrates stored regional and legacy aliases", () => {
  const writes = [];
  const locale = resolveInitialCompanionLocale(
    {
      getItem: () => "no_NO",
      setItem: (key, value) => writes.push([key, value]),
    },
    { language: "en-US" },
  );

  assert.equal(locale, "nb");
  assert.deepEqual(writes, [["bfm-companion-locale", "nb"]]);
});

test("resolveInitialCompanionLocale migrates the legacy desktop-named storage key", () => {
  const writes = [];
  const locale = resolveInitialCompanionLocale(
    {
      getItem: (key) => (key === "bfm-locale" ? "nb" : null),
      setItem: (key, value) => writes.push([key, value]),
    },
    { language: "en-US" },
  );

  assert.equal(locale, "nb");
  assert.deepEqual(writes, [["bfm-companion-locale", "nb"]]);
});

test("resolveInitialCompanionLocale checks selectable navigator languages in preference order", () => {
  const locale = resolveInitialCompanionLocale(
    { getItem: () => null },
    { language: "en-US", languages: ["fr-FR", "de-DE", "nb-NO", "en-US"] },
  );

  assert.equal(locale, "fr");
});

test("Companion accepts pseudo locale only through an explicit QA value", () => {
  assert.equal(
    resolveInitialCompanionLocale(
      { getItem: () => "en-XA" },
      { language: "en-US" },
    ),
    "en-XA",
  );
  const output = t("en-XA", "settings.spoolCount", "", { count: 2 });
  assert.match(output, /^⟦.*2 şþö.*⟧$/);

  const rtlOutput = t("ar-XB", "settings.spoolCount", "", { count: 2 });
  assert.ok(rtlOutput.startsWith("⟦\u2067"));
  assert.match(rtlOutput, /٢/);

  const cjkOutput = t("zh-XB", "settings.spoolCount", "", { count: 2 });
  assert.match(cjkOutput, /^【.*2.*】$/);
  assert.match(cjkOutput, /[設品項]/);
});

test("German locale uses translated source copy", () => {
  assert.equal(t("de", "nav.storage"), "Bestand");
  assert.equal(t("de", "printers.toolhead"), "Werkzeugkopf");
  assert.equal(
    t("de", "recovery.suggested"),
    "Vorgeschlagene Wiederherstellung",
  );
});

test("French locale uses complete translated source copy", () => {
  assert.equal(t("fr", "nav.storage"), "Stock");
  assert.equal(t("fr", "printers.toolhead"), "Tête d’outil");
  assert.equal(t("fr", "detail.saveWeight"), "Enregistrer le poids");
  assert.equal(
    t("fr", "storage.wishlistQueue"),
    "Liste de souhaits / commandes",
  );
  assert.equal(t("fr", "loans.completeReturn"), "Terminer le retour");
  assert.equal(t("fr", "printers.saveCandidateRfid"), "Enregistrer la RFID");
  assert.equal(
    t("fr", "settings.desktopInCharge"),
    "L’application desktop et SQLite gardent le contrôle.",
  );
  assert.equal(t("fr", "missing.reviewKey", "Repli sûr"), "Repli sûr");
});

test("French locale applies French zero, one, and other plural categories", () => {
  assert.equal(t("fr", "nav.spoolCount", "", { count: 0 }), "0 bobine");
  assert.equal(t("fr", "nav.spoolCount", "", { count: 1 }), "1 bobine");
  assert.equal(t("fr", "nav.spoolCount", "", { count: 2 }), "2 bobines");
});

test("complete Spanish draft translates shell and workflow copy", () => {
  assert.equal(t("es", "nav.storage"), "Inventario");
  assert.equal(t("es", "settings.title"), "Ajustes");
  assert.equal(t("es", "nav.spoolCount", "", { count: 1 }), "1 bobina");
  assert.equal(t("es", "nav.spoolCount", "", { count: 2 }), "2 bobinas");
  assert.equal(t("es", "printers.toolhead"), "Cabezal");
  assert.equal(
    t("es", "status.qrLookupFailed"),
    "No se pudo abrir el enlace de la bobina.",
  );
  assert.equal(t("es", "storage.addFilament"), "Añadir filamento");
  assert.equal(t("es", "loans.completeReturn"), "Completar devolución");
  assert.equal(t("es", "detail.saveWeight"), "Guardar peso");
  assert.equal(t("es", "inventory.rfidSaveAction"), "Guardar RFID");
  assert.equal(t("es", "detail.eventRfidSaved"), "RFID guardada");
  assert.equal(t("es", "printers.toolhead"), "Cabezal");
  assert.equal(
    t("es", "printers.loadedSummary", "", { loaded: 3, open: 1 }),
    "3 cargadas · 1 libres",
  );
});

test("complete Brazilian Portuguese draft translates shell and workflow copy", () => {
  assert.equal(t("pt-BR", "nav.storage"), "Inventário");
  assert.equal(t("pt-BR", "settings.title"), "Configurações");
  assert.equal(t("pt-BR", "nav.spoolCount", "", { count: 1 }), "1 bobina");
  assert.equal(t("pt-BR", "nav.spoolCount", "", { count: 2 }), "2 bobinas");
  assert.equal(t("pt-BR", "printers.toolhead"), "Cabeçote");
  assert.equal(
    t("pt-BR", "status.qrLookupFailed"),
    "Falha ao abrir o link da bobina.",
  );
  assert.equal(t("pt-BR", "storage.addFilament"), "Adicionar filamento");
  assert.equal(t("pt-BR", "loans.completeReturn"), "Concluir devolução");
  assert.equal(t("pt-BR", "detail.saveWeight"), "Salvar peso");
  assert.equal(
    t("pt-BR", "printers.loadedSummary", "", { loaded: 3, open: 1 }),
    "3 carregadas · 1 livres",
  );
});

test("complete Italian draft translates shell and workflow copy", () => {
  assert.equal(t("it-IT", "nav.storage"), "Inventario");
  assert.equal(t("it-IT", "settings.title"), "Impostazioni");
  assert.equal(t("it-IT", "nav.spoolCount", "", { count: 1 }), "1 bobina");
  assert.equal(t("it-IT", "nav.spoolCount", "", { count: 2 }), "2 bobine");
  assert.equal(t("it-IT", "printers.toolhead"), "Testina");
  assert.equal(
    t("it-IT", "status.qrLookupFailed"),
    "Impossibile aprire il collegamento della bobina.",
  );
  assert.equal(t("it-IT", "storage.addFilament"), "Aggiungi filamento");
  assert.equal(t("it-IT", "loans.completeReturn"), "Completa il reso");
  assert.equal(t("it-IT", "detail.saveWeight"), "Salva peso");
  assert.equal(
    t("it-IT", "printers.loadedSummary", "", { loaded: 3, open: 1 }),
    "3 occupati · 1 liberi",
  );
});

test("complete Polish draft translates shell and plural workflow copy", () => {
  assert.equal(t("pl-PL", "nav.storage"), "Magazyn");
  assert.equal(t("pl-PL", "settings.title"), "Ustawienia");
  assert.equal(t("pl-PL", "nav.spoolCount", "", { count: 1 }), "1 szpula");
  assert.equal(t("pl-PL", "nav.spoolCount", "", { count: 2 }), "2 szpule");
  assert.equal(t("pl-PL", "nav.spoolCount", "", { count: 5 }), "5 szpul");
  assert.equal(t("pl-PL", "printers.toolhead"), "Głowica narzędziowa");
});

test("complete Dutch draft translates shell and workflow copy", () => {
  assert.equal(t("nl-NL", "nav.storage"), "Voorraad");
  assert.equal(t("nl-NL", "settings.title"), "Instellingen");
  assert.equal(t("nl-NL", "nav.spoolCount", "", { count: 1 }), "1 spoel");
  assert.equal(t("nl-NL", "nav.spoolCount", "", { count: 2 }), "2 spoelen");
  assert.equal(t("nl-NL", "printers.toolhead"), "Gereedschapskop");
  assert.equal(t("nl-NL", "detail.saveWeight"), "Gewicht opslaan");
});

test("complete Czech draft translates shell and plural workflow copy", () => {
  assert.equal(t("cs-CZ", "nav.storage"), "Sklad");
  assert.equal(t("cs-CZ", "settings.title"), "Nastavení");
  assert.equal(t("cs-CZ", "nav.spoolCount", "", { count: 1 }), "1 cívka");
  assert.equal(t("cs-CZ", "nav.spoolCount", "", { count: 2 }), "2 cívky");
  assert.equal(t("cs-CZ", "nav.spoolCount", "", { count: 5 }), "5 cívek");
  assert.equal(t("cs-CZ", "printers.toolhead"), "Nástrojová hlava");
  assert.equal(t("cs-CZ", "detail.saveWeight"), "Uložit hmotnost");
});

test("complete Simplified Chinese draft translates shell and workflow copy", () => {
  assert.equal(t("zh-CN", "nav.storage"), "库存");
  assert.equal(t("zh-CN", "settings.title"), "设置");
  assert.equal(t("zh-CN", "nav.spoolCount", "", { count: 1 }), "1 个线轴");
  assert.equal(t("zh-CN", "nav.spoolCount", "", { count: 2 }), "2 个线轴");
  assert.equal(t("zh-CN", "printers.toolhead"), "工具头");
  assert.equal(t("zh-CN", "detail.saveWeight"), "保存重量");
});

test("resolveInitialCompanionLocale falls back to English when storage and navigator throw", () => {
  const locale = resolveInitialCompanionLocale(
    {
      getItem() {
        throw new Error("storage denied");
      },
    },
    {
      get language() {
        throw new Error("navigator denied");
      },
    },
  );

  assert.equal(locale, "en");
});

test("resolveInitialCompanionLocale tolerates blocked browser globals", () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );

  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage denied");
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      get() {
        throw new Error("navigator denied");
      },
    });

    assert.equal(resolveInitialCompanionLocale(), "en");
  } finally {
    if (storageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    } else {
      delete globalThis.localStorage;
    }
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  }
});

test("Norwegian empty-spool copy uses the established rullens tomvekt wording", () => {
  assert.equal(t("nb", "detail.emptySpoolWeight"), "Rullens tomvekt (g)");
  assert.equal(t("nb", "detail.saveEmptySpoolWeight"), "Lagre rullens tomvekt");
  assert.equal(
    t("nb", "status.tareWeightUpdated"),
    "Rullens tomvekt er oppdatert.",
  );
  assert.equal(
    t("nb", "detail.eventTareWeightUpdate"),
    "Rullens tomvekt oppdatert",
  );
});

test("return calculations explain total weight, spool tare, and filament in both locales", () => {
  const params = { returned: "1 000 g", tare: "250 g", total: "1 250 g" };

  assert.equal(
    t("nb", "loans.returnCalculation"),
    "Regnestykke for foreslått vekt",
  );
  assert.equal(
    t("en", "loans.returnWeightCalculation", "", params),
    "1 250 g total − 250 g spool tare = 1 000 g returned filament",
  );
  assert.equal(
    t("nb", "loans.returnWeightCalculation", "", params),
    "1 250 g totalvekt − 250 g rullens tomvekt = 1 000 g returnert filament",
  );
  assert.equal(
    t("nb", "loans.estimatedUsedCalculation", "", { used: "0 g" }),
    "Beregnet brukt: 0 g",
  );
});

test("outgoing calculations explain total weight, spool tare, and lent filament in both locales", () => {
  const params = { filament: "1 000 g", tare: "224 g", total: "1 224 g" };

  assert.equal(
    t("en", "loans.outgoingCalculation"),
    "Suggested outgoing calculation",
  );
  assert.equal(
    t("nb", "loans.outgoingCalculation"),
    "Regnestykke for foreslått utgående vekt",
  );
  assert.equal(
    t("en", "loans.outgoingWeightCalculation", "", params),
    "1 224 g total − 224 g spool tare = 1 000 g filament lent out",
  );
  assert.equal(
    t("nb", "loans.outgoingWeightCalculation", "", params),
    "1 224 g totalvekt − 224 g rullens tomvekt = 1 000 g filament lånes ut",
  );
});
