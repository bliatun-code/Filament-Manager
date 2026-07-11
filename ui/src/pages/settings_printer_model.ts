import type {
  BambuLiveIntegrationEntry,
  CreatePrinterInput,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  PrinterRow,
} from "../lib/tauri_client";
import { isExternalSlotId, resolvePrinterModelProfile } from "../lib/printer_profiles";
import { clampInt, parseNonNegativeInt, parsePositiveInt } from "../lib/settings_utils";
import { createLocaleCollator } from "../../../src-tauri/companion_browser/locale_format.js";

export type PrinterMultiMaterialConfig = {
  units: number;
  slotsPerUnit: number;
};

export type PrinterReconfigureDraft = {
  id: string | null;
  model: string;
  name: string;
  amsUnits: string;
  slotsPerUnit: string;
  bambuLiveEnabled: boolean;
  bambuLiveHost: string;
  bambuLiveAccessCode: string;
  bambuLivePrinterSerial: string;
};

export type NormalizedPrinterReconfigureDraft = {
  id: string | null;
  model: string;
  name: string;
  amsUnits: number;
  slotsPerUnit: number;
  bambuLiveEnabled: boolean;
  bambuLiveHost: string | null;
  bambuLiveAccessCode: string | null;
  bambuLivePrinterSerial: string | null;
};

export type PreparedPrinterReconfigure =
  | {
      ok: true;
      printer: CreatePrinterInput;
      bambuLive: {
        enabled: boolean;
        host: string | null;
        accessCode: string | null;
        printerSerial: string | null;
      };
    }
  | {
      ok: false;
      reason: "missing_printer" | "missing_bambu_live_fields";
    };

export function buildPrinterSlotsByPrinterId(
  printerOverview: PrinterOverviewRow[],
): Map<string, PrinterAmsSlotRow[]> {
  return new Map(
    printerOverview.map((item) => [item.printer.id, item.slots]),
  );
}

export function sortSettingsPrinters(printers: PrinterRow[], locale: string): PrinterRow[] {
  const collator = createLocaleCollator(locale, {
    numeric: true,
    sensitivity: "base",
  });
  return [...printers].sort((left, right) => {
    const byName = collator.compare(left.name, right.name);
    if (byName !== 0) {
      return byName;
    }
    return collator.compare(left.model, right.model);
  });
}

export function derivePrinterMultiConfig(input: {
  printerId: string;
  model: string;
  printerOverview: PrinterOverviewRow[];
}): PrinterMultiMaterialConfig {
  const slots = buildPrinterSlotsByPrinterId(input.printerOverview).get(input.printerId) ?? [];
  const profile = resolvePrinterModelProfile(input.model);
  const slotCountByUnit = new Map<string, number>();
  for (const slot of slots) {
    if (isExternalSlotId(slot.ams_id)) {
      continue;
    }
    slotCountByUnit.set(slot.ams_id, (slotCountByUnit.get(slot.ams_id) ?? 0) + 1);
  }
  const units = slotCountByUnit.size;
  const slotsPerUnit =
    units > 0
      ? Math.max(...Array.from(slotCountByUnit.values()))
      : profile.defaultSlotsPerUnit;
  return { units, slotsPerUnit };
}

export function isBambuLabPrinter(model: string): boolean {
  return model.trim().toLowerCase().startsWith("bambu lab");
}

export function chooseSettingsPrinterEditorVisualQaPrinter(
  printers: PrinterRow[],
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>,
): PrinterRow | null {
  return (
    printers.find(
      (printer) =>
        isBambuLabPrinter(printer.model) && bambuLiveIntegrations[printer.id]?.enabled,
    ) ??
    printers[0] ??
    null
  );
}

export function normalizePrinterReconfigureDraft(
  draft: PrinterReconfigureDraft,
): NormalizedPrinterReconfigureDraft {
  const model = draft.model.trim();
  const profile = resolvePrinterModelProfile(model);
  const amsUnits = clampInt(
    parseNonNegativeInt(draft.amsUnits, profile.defaultUnits),
    0,
    profile.maxUnits,
  );
  const slotsPerUnit = clampInt(
    parsePositiveInt(draft.slotsPerUnit, profile.defaultSlotsPerUnit),
    1,
    profile.maxSlotsPerUnit,
  );

  return {
    id: draft.id,
    model,
    name: draft.name.trim(),
    amsUnits,
    slotsPerUnit,
    bambuLiveEnabled: draft.bambuLiveEnabled,
    bambuLiveHost: draft.bambuLiveHost.trim() || null,
    bambuLiveAccessCode: draft.bambuLiveAccessCode.trim() || null,
    bambuLivePrinterSerial: draft.bambuLivePrinterSerial.trim() || null,
  };
}

export function isPrinterReconfigureDraftDirty(
  baseline: PrinterReconfigureDraft,
  current: PrinterReconfigureDraft,
): boolean {
  const normalizedBaseline = normalizePrinterReconfigureDraft(baseline);
  const normalizedCurrent = normalizePrinterReconfigureDraft(current);

  if (
    normalizedBaseline.id !== normalizedCurrent.id ||
    normalizedBaseline.model !== normalizedCurrent.model ||
    normalizedBaseline.name !== normalizedCurrent.name ||
    normalizedBaseline.amsUnits !== normalizedCurrent.amsUnits
  ) {
    return true;
  }

  if (
    normalizedCurrent.amsUnits > 0 &&
    normalizedBaseline.slotsPerUnit !== normalizedCurrent.slotsPerUnit
  ) {
    return true;
  }

  if (normalizedBaseline.bambuLiveEnabled !== normalizedCurrent.bambuLiveEnabled) {
    return true;
  }

  return (
    normalizedCurrent.bambuLiveEnabled &&
    (normalizedBaseline.bambuLiveHost !== normalizedCurrent.bambuLiveHost ||
      normalizedBaseline.bambuLiveAccessCode !==
        normalizedCurrent.bambuLiveAccessCode ||
      normalizedBaseline.bambuLivePrinterSerial !==
        normalizedCurrent.bambuLivePrinterSerial)
  );
}

export function preparePrinterReconfigure(input: {
  currentExists: boolean;
  draft: PrinterReconfigureDraft;
}): PreparedPrinterReconfigure {
  const normalized = normalizePrinterReconfigureDraft(input.draft);
  const { id, model, name } = normalized;

  if (!input.currentExists || !id || !model || !name) {
    return { ok: false, reason: "missing_printer" };
  }

  const liveHost = normalized.bambuLiveHost;
  const liveAccessCode = normalized.bambuLiveAccessCode;
  const livePrinterSerial = normalized.bambuLivePrinterSerial;
  if (
    normalized.bambuLiveEnabled &&
    (!liveHost || !liveAccessCode || !livePrinterSerial)
  ) {
    return { ok: false, reason: "missing_bambu_live_fields" };
  }

  return {
    ok: true,
    printer: {
      id,
      model,
      name,
      ams_units: normalized.amsUnits,
      slots_per_ams: normalized.slotsPerUnit,
    },
    bambuLive: {
      enabled: normalized.bambuLiveEnabled,
      host: liveHost,
      accessCode: liveAccessCode,
      printerSerial: livePrinterSerial,
    },
  };
}

export function canUseSettingsPrinterWriteTarget(input: {
  settingsClientReadOnly: boolean;
  settingsClientHostBaseUrl: string | null;
  settingsClientHostWritePaired: boolean;
  settingsClientLibraryId: string | null;
}): boolean {
  if (!input.settingsClientReadOnly) {
    return true;
  }
  return Boolean(
    input.settingsClientHostBaseUrl &&
      input.settingsClientLibraryId &&
      input.settingsClientHostWritePaired,
  );
}

export type SettingsPrinterMessageLabels = {
  bambuLiveFieldsRequired: string;
  confirmDeleteTapAgain: string;
  deletePrinterFailed: string;
  printerRequired: string;
  removedPrinter: string;
  updatePrinterFailed: string;
  updatedPrinter: string;
  writeRequiresPairing: string;
};

export type SettingsPrinterErrorMessageKey =
  | "bambuLiveFieldsRequired"
  | "deletePrinterFailed"
  | "updatePrinterFailed"
  | "writeRequiresPairing";

export function buildSettingsPrinterErrorMessage(
  key: SettingsPrinterErrorMessageKey,
  labels: Pick<SettingsPrinterMessageLabels, SettingsPrinterErrorMessageKey>,
): string {
  return labels[key];
}

export function buildSettingsPrinterRequiredMessage(
  labels: Pick<SettingsPrinterMessageLabels, "printerRequired">,
): string {
  return labels.printerRequired;
}

export function buildSettingsPrinterConfirmDeleteMessage(
  printerName: string,
  labels: Pick<SettingsPrinterMessageLabels, "confirmDeleteTapAgain">,
): string {
  return `${labels.confirmDeleteTapAgain} "${printerName}".`;
}

export function buildSettingsPrinterRemovedMessage(
  printerName: string,
  labels: Pick<SettingsPrinterMessageLabels, "removedPrinter">,
): string {
  return `${labels.removedPrinter} "${printerName}".`;
}

export function buildSettingsPrinterUpdatedMessage(
  printerName: string,
  labels: Pick<SettingsPrinterMessageLabels, "updatedPrinter">,
): string {
  return `${labels.updatedPrinter} "${printerName}".`;
}
