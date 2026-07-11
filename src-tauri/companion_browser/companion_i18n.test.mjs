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

test("resolveInitialCompanionLocale checks navigator languages in preference order", () => {
  const locale = resolveInitialCompanionLocale(
    { getItem: () => null },
    { language: "en-US", languages: ["fr-FR", "de-DE", "nb-NO", "en-US"] },
  );

  assert.equal(locale, "nb");
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

test("German draft uses translated overlay copy", () => {
  assert.equal(t("de", "nav.storage"), "Bestand");
  assert.equal(t("de", "printers.toolhead"), "Werkzeugkopf");
  assert.equal(t("de", "recovery.suggested"), "Vorgeschlagene Wiederherstellung");
});

test("French draft uses translated overlay copy and English fallback", () => {
  assert.equal(t("fr", "nav.storage"), "Stock");
  assert.equal(t("fr", "printers.toolhead"), "Tête d’outil");
  assert.equal(t("fr", "recovery.suggested"), t("en", "recovery.suggested"));
});

test("French draft applies French zero, one, and other plural categories", () => {
  assert.equal(t("fr", "nav.spoolCount", "", { count: 0 }), "0 bobine");
  assert.equal(t("fr", "nav.spoolCount", "", { count: 1 }), "1 bobine");
  assert.equal(t("fr", "nav.spoolCount", "", { count: 2 }), "2 bobines");
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
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

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
  assert.equal(t("nb", "status.tareWeightUpdated"), "Rullens tomvekt er oppdatert.");
  assert.equal(t("nb", "detail.eventTareWeightUpdate"), "Rullens tomvekt oppdatert");
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
