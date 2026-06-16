import { normalizeSwatchValue, parseSwatchSpec } from "./color_utils";
import { formatBambuSettingsProfileSignal } from "./bambu_settings_profiles";
import type { SpoolWithMasterRow } from "./tauri_client";

export type InventoryMatchResult =
  | { kind: "rfid_exact"; candidates: SpoolWithMasterRow[] }
  | { kind: "metadata_single"; candidates: SpoolWithMasterRow[] }
  | { kind: "metadata_multiple"; candidates: SpoolWithMasterRow[] }
  | { kind: "none"; candidates: SpoolWithMasterRow[] };

export type ObservedInventoryMatchInput = {
  rfid?: string | null;
  material?: string | null;
  filamentName?: string | null;
  colorHex?: string | null;
};

function normalizeInventoryMatchText(raw?: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

const GENERIC_MATERIAL_NAME_TOKENS = new Set([
  "pla",
  "petg",
  "abs",
  "asa",
  "tpu",
  "pc",
  "pa",
  "cpe",
  "hips",
  "pva",
  "pet",
  "pp",
  "pom",
  "support",
]);

function inventoryNameTokens(raw?: string | null): string[] {
  return (raw ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hasDistinctiveInventoryNameToken(tokens: string[]): boolean {
  return tokens.some((token) => {
    const compact = token.replace(/^\++|\++$/g, "");
    return compact.length >= 2 && !GENERIC_MATERIAL_NAME_TOKENS.has(compact);
  });
}

function containsNameTokenSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) {
    return false;
  }
  return haystack.some((_, index) =>
    needle.every((token, offset) => haystack[index + offset] === token),
  );
}

function inventoryFilamentNameMatches(left?: string | null, right?: string | null): boolean {
  const leftTokens = inventoryNameTokens(left);
  const rightTokens = inventoryNameTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }
  if (
    leftTokens.length === rightTokens.length &&
    leftTokens.every((token, index) => token === rightTokens[index])
  ) {
    return hasDistinctiveInventoryNameToken(leftTokens);
  }
  return (
    (hasDistinctiveInventoryNameToken(leftTokens) &&
      containsNameTokenSequence(rightTokens, leftTokens)) ||
    (hasDistinctiveInventoryNameToken(rightTokens) &&
      containsNameTokenSequence(leftTokens, rightTokens))
  );
}

function formatSettingsPresetSignal(
  presetSignal: string,
  t: (key: string, fallback?: string) => string,
): string {
  const match = presetSignal.match(/^(.+?)\s+\((.+)\)$/);
  if (!match) {
    return presetSignal;
  }
  const settingId = (match[1] ?? "").trim();
  const profileName = (match[2] ?? "").trim();
  return formatBambuSettingsProfileSignal(settingId, profileName, {
    nozzleSuffix: t("settings.bambuLivePresetNozzleSuffix", "mm nozzle"),
  }) ?? presetSignal;
}

export function buildInventoryMatchResult(
  spoolRows: SpoolWithMasterRow[],
  observed: ObservedInventoryMatchInput,
): InventoryMatchResult {
  const activeRows = spoolRows.filter((row) => {
    const status = (row.spool.status ?? "").trim().toUpperCase();
    return status !== "EMPTY" && status !== "LOST";
  });

  const normalizedObservedRfid =
    observed.rfid?.trim() && !/^0+$/.test(observed.rfid.trim()) ? observed.rfid.trim() : null;
  if (normalizedObservedRfid) {
    const rfidMatches = activeRows.filter(
      (row) => (row.spool.rfid_tag ?? "").trim() === normalizedObservedRfid,
    );
    if (rfidMatches.length > 0) {
      return { kind: "rfid_exact", candidates: rfidMatches };
    }
  }

  const observedMaterial = normalizeInventoryMatchText(observed.material);
  const observedFilamentName = normalizeInventoryMatchText(observed.filamentName);
  const observedSwatch = normalizeSwatchValue(observed.colorHex, { uppercase: true });
  const observedColors = observedSwatch
    ? parseSwatchSpec(observedSwatch).colors.map((color) => color.toUpperCase())
    : [];

  const metadataMatches = activeRows.filter((row) => {
    const rowMaterial = normalizeInventoryMatchText(row.master.material);
    if (observedMaterial && rowMaterial !== observedMaterial) {
      return false;
    }

    const rowFilament = normalizeInventoryMatchText(row.master.filament_name);
    if (observedFilamentName) {
      if (!inventoryFilamentNameMatches(rowFilament, observedFilamentName)) {
        return false;
      }
    }

    if (observedColors.length > 0) {
      const rowSwatch = normalizeSwatchValue(row.master.hex_color, { uppercase: true });
      const rowColors = rowSwatch
        ? parseSwatchSpec(rowSwatch).colors.map((color) => color.toUpperCase())
        : [];
      if (
        rowColors.length > 0 &&
        !observedColors.every((observedColor) => rowColors.includes(observedColor))
      ) {
        return false;
      }
    }

    return true;
  });

  if (metadataMatches.length === 1) {
    return { kind: "metadata_single", candidates: metadataMatches };
  }
  if (metadataMatches.length > 1) {
    return { kind: "metadata_multiple", candidates: metadataMatches };
  }
  return { kind: "none", candidates: [] };
}

export function translateObservedMatchNote(
  note: string | null | undefined,
  t: (key: string, fallback?: string) => string,
): string | null {
  const normalized = (note ?? "").trim();
  if (!normalized) {
    return null;
  }
  const presetSignalMatch = normalized.match(
    /^(.*?)(?:\s+)?(?:(?:AMS|Filament) preset signal|Filament settings preset) (.+) was observed via tray_info_idx; this is a material\/(?:preset|settings) hint, not a roll identity\.$/,
  );
  if (presetSignalMatch) {
    const baseNote = presetSignalMatch[1].trim();
    const baseTranslation = baseNote ? translateObservedMatchNote(baseNote, t) : null;
    const presetSignal = formatSettingsPresetSignal(presetSignalMatch[2].trim(), t);
    const presetTranslation = t(
      "settings.bambuLiveMatchNotePresetSignal",
      "Filament settings preset: {preset}. This is a material/settings hint, not a roll identity.",
    ).replace("{preset}", presetSignal);
    return [baseTranslation, presetTranslation].filter(Boolean).join(" ");
  }
  switch (normalized) {
    case "Exact tray identity match against inventory.":
      return t(
        "settings.bambuLiveMatchNoteExact",
        "Exact RFID/AMS identity match against inventory.",
      );
    case "Multiple inventory rolls share this saved tray identity.":
      return t(
        "settings.bambuLiveMatchNoteDuplicateIdentity",
        "Multiple inventory rolls share this saved RFID/AMS identity.",
      );
    case "Showing last known good tray identity until a stronger update arrives.":
      return t(
        "settings.bambuLiveMatchNoteLastKnownGood",
        "Showing last known good RFID/AMS identity until a stronger update arrives.",
      );
    case "Multiple configured slots share this tray index.":
      return t(
        "settings.bambuLiveMatchNoteDuplicateTrayIndex",
        "Multiple configured slots share this tray index.",
      );
    case "AMS reported a tray identity that is not registered in inventory.":
      return t(
        "settings.bambuLiveMatchNoteUnknownIdentity",
        "AMS reported an RFID/AMS identity that is not registered in inventory.",
      );
    case "Last known tray identity does not map cleanly to the currently configured spool.":
      return t(
        "settings.bambuLiveMatchNoteConfiguredMismatch",
        "Last known RFID/AMS identity does not map cleanly to the currently configured spool.",
      );
    case "No clear stored spool matches this last known tray identity.":
      return t(
        "settings.bambuLiveMatchNoteNoStoredMatch",
        "No clear stored spool matches this last known RFID/AMS identity.",
      );
    case "One likely stored spool matches this last known tray identity.":
      return t(
        "settings.bambuLiveMatchNoteOneStoredMatch",
        "One likely stored spool matches this last known RFID/AMS identity.",
      );
    case "Multiple stored spools could match this live tray.":
      return t(
        "settings.bambuLiveMatchNoteMultipleStoredMatch",
        "Multiple stored spools could match this live tray.",
      );
    default:
      return normalized;
  }
}
