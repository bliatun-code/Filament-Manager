import type { CreatePrinterInput } from "./tauri_client";
import {
  findPrinterModelProfileExact,
  resolvePrinterModelProfile,
} from "./printer_profiles";

export type PrinterFormCapacity = {
  units: number;
  slotsPerUnit: number;
  hasMultiMaterial: boolean;
};

function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseNonNegativeInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function defaultPrinterFormCapacityForModel(model: string): {
  amsUnits: string;
  slotsPerUnit: string;
} | null {
  const exactProfile = findPrinterModelProfileExact(model);
  if (exactProfile) {
    return {
      amsUnits: String(exactProfile.defaultUnits),
      slotsPerUnit: String(exactProfile.defaultSlotsPerUnit),
    };
  }
  if (!model) {
    return {
      amsUnits: "0",
      slotsPerUnit: "4",
    };
  }
  return null;
}

export function derivePrinterFormCapacity(
  model: string,
  rawAmsUnits: string,
  rawSlotsPerUnit: string,
): PrinterFormCapacity {
  const profile = resolvePrinterModelProfile(model || "");
  const units = clampInt(
    parseNonNegativeInt(rawAmsUnits, profile.defaultUnits),
    0,
    profile.maxUnits,
  );
  const slotsPerUnit = clampInt(
    parsePositiveInt(rawSlotsPerUnit, profile.defaultSlotsPerUnit),
    1,
    profile.maxSlotsPerUnit,
  );
  return {
    units,
    slotsPerUnit,
    hasMultiMaterial: units > 0,
  };
}

export function buildCreatePrinterInput(
  id: string,
  model: string,
  name: string,
  rawAmsUnits: string,
  rawSlotsPerUnit: string,
): CreatePrinterInput {
  const capacity = derivePrinterFormCapacity(model, rawAmsUnits, rawSlotsPerUnit);
  return {
    id,
    model,
    name,
    ams_units: capacity.units,
    slots_per_ams: capacity.slotsPerUnit,
  };
}
