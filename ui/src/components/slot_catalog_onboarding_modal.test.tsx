import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import {
  buildSlotCatalogOnboardingPrompt,
  type SlotCatalogOnboardingPrompt,
} from "../lib/printer_slot_model";
import type {
  BambuLiveObservedTray,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
} from "../lib/tauri_client";
import { SlotCatalogOnboardingModal } from "./slot_catalog_onboarding_modal";

const t = (_key: string, fallback = "") => fallback;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t,
};

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function printer(): PrinterOverviewRow {
  return {
    printer: {
      id: "printer-1",
      model: "Bambu Lab X1 Carbon",
      name: "X1C",
      created_at: "2099-01-01T00:00:00Z",
      updated_at: "2099-01-01T00:00:00Z",
    },
    usage: {
      total_jobs: 0,
      successful_jobs: 0,
      failed_jobs: 0,
      total_used_g: 0,
    },
    slots: [],
  };
}

function slot(overrides: Partial<PrinterAmsSlotRow> = {}): PrinterAmsSlotRow {
  return {
    slot_id: "slot-1",
    ams_id: "printer_ams_1",
    slot_index: 1,
    ...overrides,
  };
}

function liveTray(overrides: Partial<BambuLiveObservedTray> = {}): BambuLiveObservedTray {
  return {
    tray_index: 0,
    loaded: true,
    observed_rfid_tag: "RFID-NEW",
    last_identity_seen_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function master(overrides: Partial<MasterCatalogRow> = {}): MasterCatalogRow {
  return {
    id: "master-1",
    material: "PLA",
    filament_name: "PLA Matte",
    color_name: "Black",
    hex_color: "#000000",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu Lab",
    is_discontinued: false,
    discontinued_at: null,
    ...overrides,
  };
}

function prompt(overrides: Partial<SlotCatalogOnboardingPrompt> = {}) {
  const baseSlot = slot();
  const baseLiveTray = liveTray();
  return {
    ...buildSlotCatalogOnboardingPrompt(
      printer(),
      baseSlot,
      master(),
      baseLiveTray,
      null,
    ),
    ...overrides,
  };
}

function renderModal(options: {
  prompt: SlotCatalogOnboardingPrompt;
  currentSlot?: PrinterAmsSlotRow | null;
  currentLiveTray?: BambuLiveObservedTray | null;
}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(SlotCatalogOnboardingModal, {
        busy: false,
        currentSlot: options.currentSlot,
        currentLiveTray: options.currentLiveTray,
        locale: "en",
        prompt: options.prompt,
        onBorrowedFromContactChange: () => {},
        onBorrowedFromNameChange: () => {},
        onBorrowedInNoteChange: () => {},
        onClose: () => {},
        onInitialWeightChange: () => {},
        onLocationChange: () => {},
        onOwnershipTypeChange: () => {},
        onSave: () => {},
      }),
    ),
  );
}

test("SlotCatalogOnboardingModal renders the owned catalog onboarding save path", () => {
  const html = renderModal({
    prompt: prompt(),
    currentSlot: slot(),
    currentLiveTray: liveTray(),
  });

  assert.match(html, /AMS onboarding/);
  assert.match(html, /Add \+ save RFID/);
  assert.match(html, /PLA Matte · Black/);
  assert.match(html, /Observed RFID/);
  assert.match(html, /RFID-NEW/);
  assert.match(html, /Owned by us/);
  assert.match(html, /Initial weight \(g\)/);
  assert.match(html, /Home location \(optional\)/);
  assert.doesNotMatch(html, /Borrowed from/);
  assert.doesNotMatch(html, /disabled="">\s*Add \+ save RFID/);
});

test("SlotCatalogOnboardingModal blocks borrowed-in catalog onboarding until owner is entered", () => {
  const html = renderModal({
    prompt: prompt({
      ownershipType: "BORROWED_IN",
      borrowedFromName: "",
      borrowedFromContact: "",
      borrowedInNote: "",
    }),
    currentSlot: slot(),
    currentLiveTray: liveTray(),
  });

  assert.match(html, /Register this spool as borrowed from someone else/);
  assert.match(html, /Borrowed from/);
  assert.match(html, /Owner contact \(optional\)/);
  assert.match(html, /Borrowed-in note \(optional\)/);
  assert.match(
    html,
    /Enter who the spool is borrowed from before registering it as borrowed-in\./,
  );
  assert.match(html, /<button[^>]*disabled="">\s*Add borrowed-in \+ save RFID/);
});

test("SlotCatalogOnboardingModal blocks catalog onboarding when the slot becomes occupied", () => {
  const html = renderModal({
    prompt: prompt(),
    currentSlot: slot({ spool_id: "existing-spool" }),
    currentLiveTray: liveTray(),
  });

  assert.match(html, /This slot already has a roll assigned/);
  assert.match(
    html,
    /This slot now has a roll assigned\. Clear or swap it through the normal slot flow before adding a new roll from AMS\./,
  );
  assert.match(html, /<button[^>]*disabled="">\s*Add \+ save RFID/);
});
