import supportedPrinterModelsJson from "../../../src/data/supported_printer_models.json?raw";

type TranslateFn = (key: string, fallback?: string) => string;

export type MultiMaterialSystemKind =
  | "AMS"
  | "MMU3"
  | "TOOLHEADS"
  | "NONE"
  | "GENERIC";

export type PrinterModelProfile = {
  model: string;
  systemKind: MultiMaterialSystemKind;
  defaultUnits: number;
  defaultSlotsPerUnit: number;
  maxUnits: number;
  maxSlotsPerUnit: number;
};

function normalizeModelKey(model: string): string {
  return model.trim().toLowerCase();
}

function cloneProfile(profile: PrinterModelProfile): PrinterModelProfile {
  return {
    ...profile,
  };
}

const BambuMultiProfile: PrinterModelProfile = {
  model: "Bambu",
  systemKind: "AMS",
  defaultUnits: 1,
  defaultSlotsPerUnit: 4,
  maxUnits: 4,
  maxSlotsPerUnit: 4,
};

const BambuA1Profile: PrinterModelProfile = {
  model: "Bambu A1",
  systemKind: "AMS",
  defaultUnits: 1,
  defaultSlotsPerUnit: 4,
  maxUnits: 1,
  maxSlotsPerUnit: 4,
};

const PrusaMmuProfile: PrinterModelProfile = {
  model: "Prusa MMU3 compatible",
  systemKind: "MMU3",
  defaultUnits: 0,
  defaultSlotsPerUnit: 5,
  maxUnits: 1,
  maxSlotsPerUnit: 5,
};

const PrusaMiniProfile: PrinterModelProfile = {
  model: "Prusa MINI+",
  systemKind: "NONE",
  defaultUnits: 0,
  defaultSlotsPerUnit: 1,
  maxUnits: 0,
  maxSlotsPerUnit: 1,
};

const PrusaXlProfile: PrinterModelProfile = {
  model: "Prusa XL",
  systemKind: "TOOLHEADS",
  defaultUnits: 1,
  defaultSlotsPerUnit: 5,
  maxUnits: 1,
  maxSlotsPerUnit: 5,
};

const PrusaXlSingleToolheadProfile: PrinterModelProfile = {
  model: "Prusa XL (Single Toolhead)",
  systemKind: "TOOLHEADS",
  defaultUnits: 1,
  defaultSlotsPerUnit: 1,
  maxUnits: 1,
  maxSlotsPerUnit: 1,
};

const PrusaXlDualToolheadProfile: PrinterModelProfile = {
  model: "Prusa XL (Dual Toolhead)",
  systemKind: "TOOLHEADS",
  defaultUnits: 1,
  defaultSlotsPerUnit: 2,
  maxUnits: 1,
  maxSlotsPerUnit: 2,
};

const PrusaXlFiveToolheadProfile: PrinterModelProfile = {
  model: "Prusa XL (Five Toolhead)",
  systemKind: "TOOLHEADS",
  defaultUnits: 1,
  defaultSlotsPerUnit: 5,
  maxUnits: 1,
  maxSlotsPerUnit: 5,
};

const GenericProfile: PrinterModelProfile = {
  model: "Generic printer",
  systemKind: "GENERIC",
  defaultUnits: 0,
  defaultSlotsPerUnit: 4,
  maxUnits: 4,
  maxSlotsPerUnit: 8,
};

const profileByCatalogKey = {
  bambu_multi: BambuMultiProfile,
  bambu_a1: BambuA1Profile,
  prusa_mmu: PrusaMmuProfile,
  prusa_mini: PrusaMiniProfile,
  prusa_xl: PrusaXlProfile,
  prusa_xl_single: PrusaXlSingleToolheadProfile,
  prusa_xl_dual: PrusaXlDualToolheadProfile,
  prusa_xl_five: PrusaXlFiveToolheadProfile,
  generic: GenericProfile,
};

type PrinterCatalogProfileKey = keyof typeof profileByCatalogKey;

type PrinterModelCatalogEntry = {
  model: string;
  profile: PrinterCatalogProfileKey;
  bambu_studio_code: string | null;
};

function isPrinterCatalogProfileKey(value: unknown): value is PrinterCatalogProfileKey {
  return typeof value === "string" && Object.hasOwn(profileByCatalogKey, value);
}

function readPrinterModelCatalog(): PrinterModelCatalogEntry[] {
  const parsed: unknown =
    typeof supportedPrinterModelsJson === "string"
      ? JSON.parse(supportedPrinterModelsJson)
      : supportedPrinterModelsJson;
  if (!Array.isArray(parsed)) {
    throw new Error("Supported printer model catalog must be an array");
  }
  return parsed.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry == null ||
      !("model" in entry) ||
      !("profile" in entry) ||
      typeof entry.model !== "string" ||
      !isPrinterCatalogProfileKey(entry.profile)
    ) {
      throw new Error(`Supported printer model catalog entry ${index + 1} is invalid`);
    }
    return {
      model: entry.model,
      profile: entry.profile,
      bambu_studio_code:
        "bambu_studio_code" in entry && typeof entry.bambu_studio_code === "string"
          ? entry.bambu_studio_code.trim() || null
          : null,
    };
  });
}

const printerModelCatalog = readPrinterModelCatalog();

const supportedPrinterModels = printerModelCatalog.map((entry) => entry.model);

const bambuStudioProfileLabelByCode: Record<string, string> = Object.fromEntries(
  printerModelCatalog.flatMap((entry) => {
    const code = entry.bambu_studio_code?.trim();
    if (!code) {
      return [];
    }
    return [[code.toUpperCase(), entry.model.replace(/^Bambu Lab\s+/i, "").trim()]];
  }),
);

const exactProfiles: Record<string, PrinterModelProfile> = Object.fromEntries(
  printerModelCatalog.map((entry) => [normalizeModelKey(entry.model), profileByCatalogKey[entry.profile]]),
);

export function listSupportedPrinterModels(): string[] {
  return [...supportedPrinterModels];
}

export function formatBambuStudioPrinterProfileCode(
  code: string | null | undefined,
): string | null {
  const normalized = code?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  return bambuStudioProfileLabelByCode[normalized.toUpperCase()] ?? normalized;
}

export function findPrinterModelProfileExact(model: string): PrinterModelProfile | null {
  const key = normalizeModelKey(model);
  if (!key) {
    return null;
  }
  const profile = exactProfiles[key];
  return profile ? cloneProfile(profile) : null;
}

export function resolvePrinterModelProfile(model: string): PrinterModelProfile {
  const exact = findPrinterModelProfileExact(model);
  if (exact) {
    return exact;
  }
  const normalized = normalizeModelKey(model);
  if (normalized.includes("prusa xl")) {
    return cloneProfile(PrusaXlProfile);
  }
  if (normalized.includes("prusa mini")) {
    return cloneProfile(PrusaMiniProfile);
  }
  if (normalized.includes("prusa")) {
    return cloneProfile(PrusaMmuProfile);
  }
  if (normalized.includes("bambu")) {
    return cloneProfile(BambuMultiProfile);
  }
  return cloneProfile(GenericProfile);
}

export function isExternalSlotId(unitId: string): boolean {
  return unitId.trim().toLowerCase().endsWith("_ext");
}

export function parseMultiMaterialUnitIndex(unitId: string): number | null {
  const match = unitId.match(/_ams_(\d+)$/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

export function sortPrinterSlotsExtLast<T extends { ams_id: string; slot_index: number }>(
  slots: ReadonlyArray<T>,
): T[] {
  return [...slots].sort((left, right) => {
    const leftExt = isExternalSlotId(left.ams_id);
    const rightExt = isExternalSlotId(right.ams_id);
    if (leftExt !== rightExt) {
      return leftExt ? 1 : -1;
    }

    const leftUnit = parseMultiMaterialUnitIndex(left.ams_id);
    const rightUnit = parseMultiMaterialUnitIndex(right.ams_id);
    if (leftUnit == null && rightUnit != null) {
      return 1;
    }
    if (leftUnit != null && rightUnit == null) {
      return -1;
    }
    if (leftUnit != null && rightUnit != null && leftUnit !== rightUnit) {
      return leftUnit - rightUnit;
    }

    const byAmsId = left.ams_id.localeCompare(right.ams_id, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (byAmsId !== 0) {
      return byAmsId;
    }

    if (left.slot_index !== right.slot_index) {
      return left.slot_index - right.slot_index;
    }

    const leftWithId = left as T & { slot_id?: string };
    const rightWithId = right as T & { slot_id?: string };
    if (leftWithId.slot_id && rightWithId.slot_id) {
      return leftWithId.slot_id.localeCompare(rightWithId.slot_id, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }
    return 0;
  });
}

export function hasConfiguredMultiMaterial(
  slots: ReadonlyArray<{ ams_id: string }>,
): boolean {
  return slots.some((slot) => !isExternalSlotId(slot.ams_id));
}

type SlotLike = {
  ams_id: string;
  spool_id?: string | null;
};

export function summarizeEffectivePrinterSlots<T extends SlotLike>(
  slots: ReadonlyArray<T>,
): {
  mode: "EXT" | "MULTI" | "NONE";
  loadedSlots: number;
  totalSlots: number;
  slots: T[];
} {
  const extSlots = slots.filter((slot) => isExternalSlotId(slot.ams_id));
  const multiSlots = slots.filter((slot) => !isExternalSlotId(slot.ams_id));
  const hasExtLoaded = extSlots.some((slot) => Boolean(slot.spool_id));

  if (hasExtLoaded) {
    return {
      mode: "EXT",
      loadedSlots: extSlots.filter((slot) => Boolean(slot.spool_id)).length,
      totalSlots: extSlots.length,
      slots: extSlots,
    };
  }

  if (multiSlots.length > 0) {
    return {
      mode: "MULTI",
      loadedSlots: multiSlots.filter((slot) => Boolean(slot.spool_id)).length,
      totalSlots: multiSlots.length,
      slots: multiSlots,
    };
  }

  if (extSlots.length > 0) {
    return {
      mode: "EXT",
      loadedSlots: extSlots.filter((slot) => Boolean(slot.spool_id)).length,
      totalSlots: extSlots.length,
      slots: extSlots,
    };
  }

  return {
    mode: "NONE",
    loadedSlots: 0,
    totalSlots: 0,
    slots: [],
  };
}

export function describePrinterCapability(
  t: TranslateFn,
  model: string,
  hasMultiMaterial: boolean,
): string {
  const profile = resolvePrinterModelProfile(model);
  if (profile.systemKind === "NONE") {
    return t("printers.singleMaterialOnly", "Single-material only");
  }
  if (profile.systemKind === "TOOLHEADS") {
    return hasMultiMaterial
      ? t("printers.withToolheads", "Multi-toolhead")
      : t("printers.singleToolhead", "Single toolhead");
  }
  if (profile.systemKind === "MMU3") {
    return hasMultiMaterial
      ? t("printers.withMmu", "With MMU3")
      : t("printers.noMmu", "No MMU3");
  }
  if (profile.systemKind === "AMS") {
    return hasMultiMaterial
      ? t("printers.withAms", "With AMS")
      : t("printers.noAms", "No AMS");
  }
  return hasMultiMaterial
    ? t("printers.withMultiMaterial", "Multi-material enabled")
    : t("printers.noMultiMaterial", "No multi-material");
}

export function describeConfiguredPrinterSetup(
  t: TranslateFn,
  model: string,
  slots: ReadonlyArray<{ ams_id: string; slot_index: number }>,
): string {
  const profile = resolvePrinterModelProfile(model);
  const multiSlots = slots.filter((slot) => !isExternalSlotId(slot.ams_id));
  if (multiSlots.length === 0) {
    if (profile.systemKind === "NONE") {
      return t("printers.singleMaterialOnly", "Single-material only");
    }
    if (profile.systemKind === "TOOLHEADS") {
      return t("printers.singleToolhead", "Single toolhead");
    }
    if (profile.systemKind === "AMS") {
      return t("printers.noAms", "No AMS");
    }
    if (profile.systemKind === "MMU3") {
      return t("printers.noMmu", "No MMU3");
    }
    return t("printers.noMultiMaterial", "No multi-material");
  }

  const units = new Set(multiSlots.map((slot) => slot.ams_id)).size;
  const slotsPerUnit = Math.max(...multiSlots.map((slot) => slot.slot_index));

  if (profile.systemKind === "TOOLHEADS") {
    return `${slotsPerUnit} ${t("settings.toolheads", "Toolheads").toLowerCase()}`;
  }
  if (profile.systemKind === "AMS") {
    return `${units} AMS x ${slotsPerUnit}`;
  }
  if (profile.systemKind === "MMU3") {
    return `${units} MMU3 x ${slotsPerUnit}`;
  }
  return `${units} x ${slotsPerUnit}`;
}

export function multiMaterialUnitsInputLabel(
  t: TranslateFn,
  model: string,
): string {
  const profile = resolvePrinterModelProfile(model);
  if (profile.systemKind === "AMS") {
    return t("settings.amsUnits", "AMS units");
  }
  if (profile.systemKind === "MMU3") {
    return t("settings.mmuUnits", "MMU3 units");
  }
  if (profile.systemKind === "TOOLHEADS") {
    return t("settings.toolheadGroups", "Toolhead groups");
  }
  return t("settings.multiUnits", "Multi-material units");
}

export function multiMaterialSlotsInputLabel(
  t: TranslateFn,
  model: string,
): string {
  const profile = resolvePrinterModelProfile(model);
  if (profile.systemKind === "AMS") {
    return t("settings.slotsPerAms", "Slots per AMS");
  }
  if (profile.systemKind === "MMU3") {
    return t("settings.filamentsPerMmu", "Filaments per MMU3");
  }
  if (profile.systemKind === "TOOLHEADS") {
    return t("settings.toolheads", "Toolheads");
  }
  return t("settings.slotsPerUnit", "Slots per multi-material unit");
}

export function formatPrinterSlotLabelForModel(
  t: TranslateFn,
  model: string,
  slot: { ams_id: string; slot_index: number },
): string {
  if (isExternalSlotId(slot.ams_id)) {
    return t("printers.extSlot", "EXT Slot");
  }

  const profile = resolvePrinterModelProfile(model);
  if (profile.systemKind === "TOOLHEADS") {
    return `${t("printers.toolhead", "Toolhead")} ${slot.slot_index}`;
  }
  if (profile.systemKind === "MMU3") {
    return `MMU3 · ${t("printers.channel", "Channel")} ${slot.slot_index}`;
  }
  if (profile.systemKind === "AMS") {
    const unit = parseMultiMaterialUnitIndex(slot.ams_id) ?? 1;
    return `AMS ${unit} · ${t("printers.slot", "Slot")} ${slot.slot_index}`;
  }

  return `${t("printers.slot", "Slot")} ${slot.slot_index}`;
}
