import type {
  CreatePrinterInput,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  PrinterRow,
} from "../lib/tauri_client";
import { isExternalSlotId, resolvePrinterModelProfile } from "../lib/printer_profiles";
import { clampInt, parseNonNegativeInt, parsePositiveInt } from "../lib/settings_utils";

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
  const collator = new Intl.Collator(locale, {
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

export function preparePrinterReconfigure(input: {
  currentExists: boolean;
  draft: PrinterReconfigureDraft;
}): PreparedPrinterReconfigure {
  const id = input.draft.id;
  const model = input.draft.model.trim();
  const name = input.draft.name.trim();

  if (!input.currentExists || !id || !model || !name) {
    return { ok: false, reason: "missing_printer" };
  }

  const liveHost = input.draft.bambuLiveHost.trim();
  const liveAccessCode = input.draft.bambuLiveAccessCode.trim();
  const livePrinterSerial = input.draft.bambuLivePrinterSerial.trim();
  if (
    input.draft.bambuLiveEnabled &&
    (!liveHost || !liveAccessCode || !livePrinterSerial)
  ) {
    return { ok: false, reason: "missing_bambu_live_fields" };
  }

  const profile = resolvePrinterModelProfile(model);
  const units = clampInt(
    parseNonNegativeInt(input.draft.amsUnits, profile.defaultUnits),
    0,
    profile.maxUnits,
  );
  const slots = clampInt(
    parsePositiveInt(input.draft.slotsPerUnit, profile.defaultSlotsPerUnit),
    1,
    profile.maxSlotsPerUnit,
  );

  return {
    ok: true,
    printer: {
      id,
      model,
      name,
      ams_units: units,
      slots_per_ams: slots,
    },
    bambuLive: {
      enabled: input.draft.bambuLiveEnabled,
      host: liveHost || null,
      accessCode: liveAccessCode || null,
      printerSerial: livePrinterSerial || null,
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
