function stableSettingsDomIdPart(value: string, fallback: string): string {
  const normalized = value.trim() || fallback;
  return Array.from(normalized)
    .map((character) => {
      if (/[a-zA-Z0-9-]/.test(character)) {
        return character;
      }
      if (character === "_") {
        return "__";
      }
      return `_x${character.codePointAt(0)?.toString(16) ?? "0"}_`;
    })
    .join("");
}

export function settingsPrinterDomIdPrefix(printerId: string): string {
  return `settings-printer-${stableSettingsDomIdPart(printerId, "unknown")}`;
}

export function settingsBambuLiveObservedPanelId(printerId: string): string {
  return `${settingsPrinterDomIdPrefix(printerId)}-observed-details`;
}

export function settingsBambuLiveCaptureStatusId(printerId: string): string {
  return `${settingsPrinterDomIdPrefix(printerId)}-capture-status`;
}

export function settingsBambuLiveCaptureHintId(printerId: string): string {
  return `${settingsPrinterDomIdPrefix(printerId)}-capture-hint`;
}

export function settingsBambuLiveTrayTechnicalDetailsId(
  printerId: string,
  trayKey: string,
): string {
  return `${settingsPrinterDomIdPrefix(printerId)}-${stableSettingsDomIdPart(
    trayKey,
    "unknown-tray",
  )}-technical-details`;
}
