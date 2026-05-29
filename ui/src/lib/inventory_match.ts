import { normalizeHexColor, normalizeSwatchValue, parseSwatchSpec } from "./color_utils";
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
  const observedHex = normalizeHexColor(observed.colorHex, { uppercase: true });

  const metadataMatches = activeRows.filter((row) => {
    const rowMaterial = normalizeInventoryMatchText(row.master.material);
    if (observedMaterial && rowMaterial !== observedMaterial) {
      return false;
    }

    const rowFilament = normalizeInventoryMatchText(row.master.filament_name);
    if (observedFilamentName) {
      const filamentMatches =
        rowFilament === observedFilamentName ||
        rowFilament.includes(observedFilamentName) ||
        observedFilamentName.includes(rowFilament);
      if (!filamentMatches) {
        return false;
      }
    }

    if (observedHex) {
      const rowSwatch = normalizeSwatchValue(row.master.hex_color, { uppercase: true });
      const rowColors = rowSwatch
        ? parseSwatchSpec(rowSwatch).colors.map((color) => color.toUpperCase())
        : [];
      if (rowColors.length > 0 && !rowColors.includes(observedHex)) {
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
  switch (normalized) {
    case "Exact tray identity match against inventory.":
      return t(
        "settings.bambuLiveMatchNoteExact",
        "Exact tray identity match against inventory.",
      );
    case "Multiple inventory rolls share this saved tray identity.":
      return t(
        "settings.bambuLiveMatchNoteDuplicateIdentity",
        "Multiple inventory rolls share this saved tray identity.",
      );
    case "Showing last known good tray identity until a stronger update arrives.":
      return t(
        "settings.bambuLiveMatchNoteLastKnownGood",
        "Showing last known good tray identity until a stronger update arrives.",
      );
    case "Multiple configured slots share this tray index.":
      return t(
        "settings.bambuLiveMatchNoteDuplicateTrayIndex",
        "Multiple configured slots share this tray index.",
      );
    case "AMS reported a tray identity that is not registered in inventory.":
      return t(
        "settings.bambuLiveMatchNoteUnknownIdentity",
        "AMS reported a tray identity that is not registered in inventory.",
      );
    case "Last known tray identity does not map cleanly to the currently configured spool.":
      return t(
        "settings.bambuLiveMatchNoteConfiguredMismatch",
        "Last known tray identity does not map cleanly to the currently configured spool.",
      );
    case "No clear stored spool matches this last known tray identity.":
      return t(
        "settings.bambuLiveMatchNoteNoStoredMatch",
        "No clear stored spool matches this last known tray identity.",
      );
    case "One likely stored spool matches this last known tray identity.":
      return t(
        "settings.bambuLiveMatchNoteOneStoredMatch",
        "One likely stored spool matches this last known tray identity.",
      );
    default:
      return normalized;
  }
}
