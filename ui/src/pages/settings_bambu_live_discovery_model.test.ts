import assert from "node:assert/strict";
import test from "node:test";

import type { BambuPrinterDiscoveryCandidate } from "../lib/tauri_client";
import { chooseBambuDiscoveryAutoFillCandidate } from "./settings_bambu_live_discovery_model";

const candidate: BambuPrinterDiscoveryCandidate = {
  host: "192.168.86.44",
  printer_serial: "01P00A412500321",
  model: "P1S",
  name: "Workshop",
};

test("auto-fills one discovered printer into a blank unpaired setup", () => {
  assert.equal(
    chooseBambuDiscoveryAutoFillCandidate([candidate], {
      host: "  ",
      printerSerial: "",
      tlsCertificateFingerprint: null,
      tlsSpkiFingerprint: null,
      tlsTrustState: "UNPAIRED",
    }),
    candidate,
  );
});

test("does not choose automatically when discovery is ambiguous", () => {
  assert.equal(
    chooseBambuDiscoveryAutoFillCandidate([], {
      host: "",
      printerSerial: "",
      tlsCertificateFingerprint: null,
      tlsSpkiFingerprint: null,
      tlsTrustState: "UNPAIRED",
    }),
    null,
  );
  assert.equal(
    chooseBambuDiscoveryAutoFillCandidate(
      [candidate, { ...candidate, host: "192.168.86.45" }],
      {
        host: "",
        printerSerial: "",
        tlsCertificateFingerprint: null,
        tlsSpkiFingerprint: null,
        tlsTrustState: "UNPAIRED",
      },
    ),
    null,
  );
});

test("does not overwrite an existing host or serial draft", () => {
  for (const draft of [
    {
      host: "192.168.86.20",
      printerSerial: "",
      tlsCertificateFingerprint: null,
      tlsSpkiFingerprint: null,
      tlsTrustState: "UNPAIRED" as const,
    },
    {
      host: "",
      printerSerial: "SAVED-SERIAL",
      tlsCertificateFingerprint: null,
      tlsSpkiFingerprint: null,
      tlsTrustState: "UNPAIRED" as const,
    },
  ]) {
    assert.equal(chooseBambuDiscoveryAutoFillCandidate([candidate], draft), null);
  }
});

test("does not replace a reviewed or changed printer identity", () => {
  for (const tlsTrustState of ["TRUSTED", "CHANGED"] as const) {
    assert.equal(
      chooseBambuDiscoveryAutoFillCandidate([candidate], {
        host: "",
        printerSerial: "",
        tlsCertificateFingerprint: null,
        tlsSpkiFingerprint: null,
        tlsTrustState,
      }),
      null,
    );
  }
});

test("rejects an incomplete discovery candidate", () => {
  assert.equal(
    chooseBambuDiscoveryAutoFillCandidate(
      [{ ...candidate, host: " " }],
      {
        host: "",
        printerSerial: "",
        tlsCertificateFingerprint: null,
        tlsSpkiFingerprint: null,
        tlsTrustState: "UNPAIRED",
      },
    ),
    null,
  );
  assert.equal(
    chooseBambuDiscoveryAutoFillCandidate(
      [{ ...candidate, printer_serial: "" }],
      {
        host: "",
        printerSerial: "",
        tlsCertificateFingerprint: null,
        tlsSpkiFingerprint: null,
        tlsTrustState: "UNPAIRED",
      },
    ),
    null,
  );
});

test("does not replace a previously inspected identity draft", () => {
  for (const draft of [
    {
      host: "",
      printerSerial: "",
      tlsCertificateFingerprint: "certificate",
      tlsSpkiFingerprint: null,
      tlsTrustState: "UNPAIRED" as const,
    },
    {
      host: "",
      printerSerial: "",
      tlsCertificateFingerprint: null,
      tlsSpkiFingerprint: "spki",
      tlsTrustState: "UNPAIRED" as const,
    },
  ]) {
    assert.equal(chooseBambuDiscoveryAutoFillCandidate([candidate], draft), null);
  }
});
