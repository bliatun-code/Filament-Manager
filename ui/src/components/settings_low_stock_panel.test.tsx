import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildLowStockPolicyFromDraft } from "../lib/settings_low_stock_model";
import { SettingsLowStockPanel } from "./settings_low_stock_panel";

const t = (_key: string, fallback: string) => fallback;

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("settings draft validates whole-number bounds and reset removes material inheritance override", () => {
  assert.equal(
    buildLowStockPolicyFromDraft({
      defaultThresholdRaw: "0",
      overrides: [],
    }),
    null,
  );
  assert.equal(
    buildLowStockPolicyFromDraft({
      defaultThresholdRaw: "200.5",
      overrides: [],
    }),
    null,
  );
  assert.deepEqual(
    buildLowStockPolicyFromDraft({
      defaultThresholdRaw: "275",
      overrides: [],
    }),
    {
      default_threshold_g: 275,
      material_overrides: [],
    },
  );
  assert.deepEqual(
    buildLowStockPolicyFromDraft({
      defaultThresholdRaw: "275",
      overrides: [
        {
          materialKey: "ignored",
          material: "  pLa  ",
          thresholdRaw: "325",
        },
      ],
    }),
    {
      default_threshold_g: 275,
      material_overrides: [
        {
          material_key: "PLA",
          material: "pLa",
          threshold_g: 325,
        },
      ],
    },
  );
});

test("settings panel clearly exposes Host ownership and corrupt-policy recovery", () => {
  const hostHtml = renderToStaticMarkup(
    <SettingsLowStockPanel
      busy={false}
      materialOptions={["PLA", "PETG"]}
      policy={null}
      policyValid={false}
      readOnly={false}
      t={t}
      onSave={() => {}}
    />,
  );
  assert.match(hostHtml, /saved low-stock policy is damaged/i);
  assert.match(hostHtml, /Save thresholds/);
  assert.doesNotMatch(hostHtml, /Save thresholds" disabled/);

  const clientHtml = renderToStaticMarkup(
    <SettingsLowStockPanel
      busy={false}
      materialOptions={["PLA"]}
      policy={null}
      policyValid
      readOnly
      t={t}
      onSave={() => {}}
    />,
  );
  assert.match(clientHtml, /Manage these library-wide thresholds on the Host desktop app/);
  assert.match(clientHtml, /<input[^>]*disabled[^>]*type="number"/);
});
