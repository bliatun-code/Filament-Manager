export type BambuSettingsProfileNameParts = {
  filamentProfile: string;
  nozzleDiameterMm: string | null;
  printerProfile: string | null;
  rawName: string;
};

export function parseBambuSettingsProfileName(
  rawName: string | null | undefined,
): BambuSettingsProfileNameParts | null {
  const normalized = rawName?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  const bambuPrinterMatch = normalized.match(
    /^(.+?)\s+@BBL\s+(.+?)(?:\s+(\d+(?:\.\d+)?)\s+nozzle)?$/i,
  );
  if (bambuPrinterMatch) {
    return {
      filamentProfile: (bambuPrinterMatch[1] ?? "").trim(),
      nozzleDiameterMm: bambuPrinterMatch[3]?.trim() || null,
      printerProfile: (bambuPrinterMatch[2] ?? "").trim() || null,
      rawName: normalized,
    };
  }
  const genericNozzleMatch = normalized.match(/^(.+?)\s+@(\d+(?:\.\d+)?)\s+nozzle$/i);
  if (genericNozzleMatch) {
    return {
      filamentProfile: (genericNozzleMatch[1] ?? "").trim(),
      nozzleDiameterMm: genericNozzleMatch[2]?.trim() || null,
      printerProfile: null,
      rawName: normalized,
    };
  }
  const baseProfileMatch = normalized.match(/^(.+?)\s+@base$/i);
  if (baseProfileMatch) {
    return {
      filamentProfile: (baseProfileMatch[1] ?? "").trim(),
      nozzleDiameterMm: null,
      printerProfile: null,
      rawName: normalized,
    };
  }
  return {
    filamentProfile: normalized,
    nozzleDiameterMm: null,
    printerProfile: null,
    rawName: normalized,
  };
}

export function formatBambuSettingsProfileNameParts(
  rawName: string | null | undefined,
  { nozzleSuffix = "mm nozzle" }: { nozzleSuffix?: string } = {},
): string[] {
  const parsed = parseBambuSettingsProfileName(rawName);
  if (!parsed) {
    return [];
  }
  return [
    parsed.filamentProfile,
    parsed.printerProfile,
    parsed.nozzleDiameterMm ? `${parsed.nozzleDiameterMm} ${nozzleSuffix}` : null,
  ].filter((value): value is string => Boolean(value));
}

export function formatBambuSettingsProfileSignal(
  settingId: string | null | undefined,
  rawName: string | null | undefined,
  options: { nozzleSuffix?: string } = {},
): string | null {
  const settingIdPart = settingId?.trim() ?? "";
  const nameParts = formatBambuSettingsProfileNameParts(rawName, options);
  const parts = [settingIdPart, ...nameParts].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
