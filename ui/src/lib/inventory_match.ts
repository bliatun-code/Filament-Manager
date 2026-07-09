import { normalizeHexColor, normalizeSwatchValue, parseSwatchSpec } from "./color_utils";
import { formatBambuSettingsProfileSignal } from "./bambu_settings_profiles";
import {
  isSpoolStatusAssigned,
  isSpoolStatusLoanable,
  isSpoolStatusMetadataMatchable,
  isSpoolStatusRfidMatchable,
} from "./inventory_domain";
import type { SpoolWithMasterRow } from "./tauri_client";

export type InventoryMatchResult<Row extends SpoolWithMasterRow = SpoolWithMasterRow> =
  | { kind: "rfid_exact"; candidates: Row[] }
  | { kind: "metadata_single"; candidates: Row[] }
  | { kind: "metadata_multiple"; candidates: Row[] }
  | { kind: "none"; candidates: Row[] };

export type ObservedInventoryMatchInput = {
  rfid?: string | null;
  material?: string | null;
  filamentName?: string | null;
  colorHex?: string | null;
};

export type InventoryMatchOptions = {
  /**
   * The slot assignment the user/app already believes is active. This does not
   * force a match, but it sorts equally plausible live candidates first.
   */
  preferredSpoolId?: string | null;
  /**
   * Bambu rolls in AMS should normally identify through RFID. Without an RFID,
   * Bambu Studio filament settings can be too generic and should not drown out
   * third-party rolls that only have material and color to work with.
   */
  includeBambuMetadataCandidates?: boolean;
  /**
   * Unknown live RFID is a Bambu-only signal today. Suggesting third-party rows
   * in that flow adds noise because those rolls cannot emit a Bambu RFID.
   */
  onlyBambuMetadataCandidates?: boolean;
  /**
   * Unknown live RFID onboarding can only bind inventory rows that do not already
   * carry a saved RFID identity. Rows with saved RFID remain eligible for the
   * strict exact-RFID pass.
   */
  requireMissingRfidTag?: boolean;
  /**
   * Unknown Bambu RFID/catalog fallback should not offer choices from color
   * alone; many Bambu colors are reused across material families.
   */
  requireObservedMaterialFamily?: boolean;
};

export type BambuUnknownRfidInventoryDecision<
  Row extends SpoolWithMasterRow = SpoolWithMasterRow,
> = {
  strictInventoryMatch: InventoryMatchResult<Row>;
  suggestedInventoryMatch: InventoryMatchResult<Row>;
};

const LIVE_COLOR_MATCH_DISTANCE = 48;
const BLACK_BOX_VENDOR = "bambu";
const SEMANTIC_OTHER_COLOR_HINT_VENDORS = new Set(["esun", "generic"]);

const BAMBU_STUDIO_OTHER_COLOR_NAME_HINTS: Array<{
  hex: string;
  tokens: string[];
}> = [
  { hex: "#FFFFFF", tokens: ["white"] },
  { hex: "#FFF144", tokens: ["yellow"] },
  { hex: "#DCF478", tokens: ["lime", "yellow"] },
  { hex: "#0ACC38", tokens: ["green"] },
  { hex: "#057748", tokens: ["green"] },
  { hex: "#0D6284", tokens: ["teal"] },
  { hex: "#0EE2A0", tokens: ["mint"] },
  { hex: "#76D9F4", tokens: ["cyan"] },
  { hex: "#46A8F9", tokens: ["blue"] },
  { hex: "#2850E0", tokens: ["blue"] },
  { hex: "#443089", tokens: ["purple"] },
  { hex: "#A03CF7", tokens: ["violet", "purple"] },
  { hex: "#F330F9", tokens: ["magenta", "pink"] },
  { hex: "#D4B1DD", tokens: ["lavender", "purple", "pink"] },
  { hex: "#F95D73", tokens: ["pink", "coral"] },
  { hex: "#F72323", tokens: ["red"] },
  { hex: "#7C4B00", tokens: ["brown"] },
  { hex: "#F98C36", tokens: ["orange", "copper"] },
  { hex: "#FCECD6", tokens: ["cream", "white"] },
  { hex: "#D3C5A3", tokens: ["khaki", "beige"] },
  { hex: "#AF7933", tokens: ["bronze", "brown", "copper", "gold"] },
  { hex: "#898989", tokens: ["gray", "grey"] },
  { hex: "#BCBCBC", tokens: ["gray", "grey", "silver"] },
  { hex: "#161616", tokens: ["black"] },
];

const BAMBU_STUDIO_OTHER_COLOR_HINTS_BY_HEX = new Map(
  BAMBU_STUDIO_OTHER_COLOR_NAME_HINTS.map((hint) => [hint.hex, hint.tokens]),
);
const BAMBU_STUDIO_OTHER_COLOR_HINT_TOKENS = new Set(
  BAMBU_STUDIO_OTHER_COLOR_NAME_HINTS.flatMap((hint) =>
    hint.tokens.map(canonicalBambuStudioOtherColorHintToken),
  ),
);

function normalizeInventoryMatchText(raw?: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

function normalizeInventoryMatchToken(raw?: string | null): string {
  return normalizeInventoryMatchText(raw).replace(/[^a-z0-9+]/g, "");
}

function canonicalBambuStudioOtherColorHintToken(token: string): string {
  if (token === "grey") {
    return "gray";
  }
  return token;
}

const MATERIAL_FAMILY_TOKENS = [
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
] as const;

function materialFamily(raw?: string | null): string | null {
  const normalized = normalizeInventoryMatchToken(raw);
  if (!normalized) {
    return null;
  }
  const exact = MATERIAL_FAMILY_TOKENS.find((token) => normalized === token);
  if (exact) {
    return exact;
  }
  return (
    MATERIAL_FAMILY_TOKENS.find((token) => normalized.startsWith(token)) ??
    MATERIAL_FAMILY_TOKENS.find((token) => normalized.includes(token)) ??
    normalized
  );
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
  "basic",
  "matte",
  "silk",
  "generic",
  "bambu",
]);

function inventoryNameTokens(raw?: string | null): string[] {
  return (raw ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function canonicalColorNameToken(token: string): string {
  return canonicalBambuStudioOtherColorHintToken(token);
}

function inventoryColorNameTokens(raw?: string | null): string[] {
  return inventoryNameTokens(raw).map(canonicalColorNameToken);
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

function isBambuVendor(row: SpoolWithMasterRow): boolean {
  return normalizeInventoryMatchToken(row.master.vendor).startsWith(BLACK_BOX_VENDOR);
}

function canUseSemanticOtherColorHint(row: SpoolWithMasterRow): boolean {
  const vendor = normalizeInventoryMatchToken(row.master.vendor);
  return SEMANTIC_OTHER_COLOR_HINT_VENDORS.has(vendor);
}

function isExactRfidInventoryRow(row: SpoolWithMasterRow): boolean {
  return isSpoolStatusRfidMatchable(row.spool.status);
}

function isMetadataVisibleInventoryRow(row: SpoolWithMasterRow): boolean {
  return isSpoolStatusMetadataMatchable(row.spool.status);
}

function isMetadataCandidateRow(
  row: SpoolWithMasterRow,
  options: InventoryMatchOptions,
): boolean {
  if (!isMetadataVisibleInventoryRow(row)) {
    return false;
  }
  if (options.requireMissingRfidTag && (row.spool.rfid_tag ?? "").trim()) {
    return false;
  }
  const bambuVendor = isBambuVendor(row);
  if (options.onlyBambuMetadataCandidates && !bambuVendor) {
    return false;
  }
  if (!options.includeBambuMetadataCandidates && bambuVendor) {
    return false;
  }
  return true;
}

function rgbFromHex(raw?: string | null): [number, number, number] | null {
  const normalized = normalizeHexColor(raw, { uppercase: true });
  if (!normalized) {
    return null;
  }
  const compact = normalized.slice(1);
  const expanded =
    compact.length === 3
      ? compact
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : compact;
  if (expanded.length !== 6) {
    return null;
  }
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return null;
  }
  return [red, green, blue];
}

function colorDistance(left: [number, number, number], right: [number, number, number]): number {
  const red = left[0] - right[0];
  const green = left[1] - right[1];
  const blue = left[2] - right[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function swatchColors(raw?: string | null): string[] {
  const normalized = normalizeSwatchValue(raw, { uppercase: true });
  if (!normalized) {
    return [];
  }
  return parseSwatchSpec(normalized).colors.map((color) => color.toUpperCase());
}

function nearestSwatchDistance(
  observedColor: string,
  candidateColors: string[],
): number | null {
  const observedRgb = rgbFromHex(observedColor);
  if (!observedRgb) {
    return null;
  }
  const distances = candidateColors
    .map((candidateColor) => rgbFromHex(candidateColor))
    .filter((rgb): rgb is [number, number, number] => rgb != null)
    .map((candidateRgb) => colorDistance(observedRgb, candidateRgb));
  return distances.length > 0 ? Math.min(...distances) : null;
}

function swatchMatchesObserved(observedColors: string[], candidateColors: string[]): boolean {
  if (observedColors.length === 0) {
    return true;
  }
  if (candidateColors.length === 0) {
    return false;
  }
  return observedColors.every((observedColor) => {
    const distance = nearestSwatchDistance(observedColor, candidateColors);
    return distance != null && distance <= LIVE_COLOR_MATCH_DISTANCE;
  });
}

function semanticOtherColorHintMatchesObserved(
  row: SpoolWithMasterRow,
  observedColors: string[],
): boolean {
  if (observedColors.length === 0 || !canUseSemanticOtherColorHint(row)) {
    return false;
  }
  const candidateTokens = semanticOtherColorHintCandidateTokens(row);
  if (candidateTokens.size === 0) {
    return false;
  }
  return observedColors.every((observedColor) => {
    const hintTokens = BAMBU_STUDIO_OTHER_COLOR_HINTS_BY_HEX.get(observedColor.toUpperCase());
    return (
      hintTokens != null &&
      hintTokens.some((token) => candidateTokens.has(canonicalColorNameToken(token)))
    );
  });
}

function semanticOtherColorHintCandidateTokens(row: SpoolWithMasterRow): Set<string> {
  const rawTokens = [
    ...inventoryColorNameTokens(row.master.color_name),
    ...inventoryColorNameTokens(row.master.filament_name),
  ];
  return new Set(rawTokens.filter((token) => BAMBU_STUDIO_OTHER_COLOR_HINT_TOKENS.has(token)));
}

function semanticOtherColorHintConflictsObserved(
  row: SpoolWithMasterRow,
  observedColors: string[],
): boolean {
  if (observedColors.length === 0 || !canUseSemanticOtherColorHint(row)) {
    return false;
  }
  const candidateTokens = semanticOtherColorHintCandidateTokens(row);
  if (candidateTokens.size === 0) {
    return false;
  }
  return observedColors.every((observedColor) => {
    const hintTokens = BAMBU_STUDIO_OTHER_COLOR_HINTS_BY_HEX.get(observedColor.toUpperCase());
    return (
      hintTokens != null &&
      hintTokens.every((token) => !candidateTokens.has(canonicalColorNameToken(token)))
    );
  });
}

function metadataCandidateScore({
  row,
  observedColors,
  observedFilamentName,
  observedMaterial,
  options,
}: {
  row: SpoolWithMasterRow;
  observedColors: string[];
  observedFilamentName: string;
  observedMaterial: string;
  options: InventoryMatchOptions;
}): number {
  let score = 0;
  if (options.preferredSpoolId && row.spool.id === options.preferredSpoolId) {
    score += 1000;
  }
  if (observedMaterial && normalizeInventoryMatchText(row.master.material) === observedMaterial) {
    score += 80;
  }
  const rowName = normalizeInventoryMatchText(row.master.filament_name);
  if (observedFilamentName && inventoryFilamentNameMatches(rowName, observedFilamentName)) {
    score += 20;
  }
  const candidateColors = swatchColors(row.master.hex_color);
  const nearestDistance =
    observedColors.length > 0 && candidateColors.length > 0
      ? Math.min(
          ...observedColors
            .map((observedColor) => nearestSwatchDistance(observedColor, candidateColors))
            .filter((distance): distance is number => distance != null),
        )
      : null;
  if (nearestDistance != null && Number.isFinite(nearestDistance)) {
    score += Math.max(0, Math.round(100 - nearestDistance));
  }
  if (semanticOtherColorHintMatchesObserved(row, observedColors)) {
    score += 60;
  }
  if (isSpoolStatusAssigned(row.spool.status)) {
    score += 8;
  } else if (isSpoolStatusLoanable(row.spool.status)) {
    score += 4;
  }
  return score;
}

function sortMetadataCandidates<Row extends SpoolWithMasterRow>(
  candidates: Row[],
  scoreById: Map<string, number>,
): Row[] {
  return [...candidates].sort((left, right) => {
    const scoreDelta = (scoreById.get(right.spool.id) ?? 0) - (scoreById.get(left.spool.id) ?? 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return left.spool.id.localeCompare(right.spool.id, undefined, { numeric: true });
  });
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

export function buildInventoryMatchResult<Row extends SpoolWithMasterRow>(
  spoolRows: Row[],
  observed: ObservedInventoryMatchInput,
  options: InventoryMatchOptions = {},
): InventoryMatchResult<Row> {
  const activeRows = spoolRows.filter(isExactRfidInventoryRow);

  const normalizedObservedRfid =
    observed.rfid?.trim() && !/^0+$/.test(observed.rfid.trim()) ? observed.rfid.trim() : null;
  if (normalizedObservedRfid) {
    const rfidMatches = activeRows.filter(
      (row) => (row.spool.rfid_tag ?? "").trim() === normalizedObservedRfid,
    );
    if (rfidMatches.length > 0) {
      return { kind: "rfid_exact", candidates: rfidMatches };
    }
    return { kind: "none", candidates: [] };
  }

  const observedMaterial = normalizeInventoryMatchText(observed.material);
  const observedMaterialFamily = materialFamily(observed.material ?? observed.filamentName);
  const observedFilamentName = normalizeInventoryMatchText(observed.filamentName);
  const observedColors = swatchColors(observed.colorHex);
  if (options.requireObservedMaterialFamily && !observedMaterialFamily) {
    return { kind: "none", candidates: [] };
  }
  const shouldUseNameAsFilter =
    observedColors.length === 0 &&
    hasDistinctiveInventoryNameToken(inventoryNameTokens(observedFilamentName));
  const scoreById = new Map<string, number>();

  const metadataMatches = activeRows.filter((row) => {
    if (!isMetadataCandidateRow(row, options)) {
      return false;
    }

    const rowMaterialFamily = materialFamily(row.master.material ?? row.master.filament_name);
    if (observedMaterialFamily && rowMaterialFamily !== observedMaterialFamily) {
      return false;
    }

    const rowFilament = normalizeInventoryMatchText(row.master.filament_name);
    if (shouldUseNameAsFilter && !inventoryFilamentNameMatches(rowFilament, observedFilamentName)) {
      return false;
    }

    const candidateColors = swatchColors(row.master.hex_color);
    if (semanticOtherColorHintConflictsObserved(row, observedColors)) {
      return false;
    }
    if (
      !swatchMatchesObserved(observedColors, candidateColors) &&
      !semanticOtherColorHintMatchesObserved(row, observedColors)
    ) {
      return false;
    }

    scoreById.set(
      row.spool.id,
      metadataCandidateScore({
        row,
        observedColors,
        observedFilamentName,
        observedMaterial,
        options,
      }),
    );
    return true;
  });
  const sortedMetadataMatches = sortMetadataCandidates(metadataMatches, scoreById);

  if (sortedMetadataMatches.length === 1) {
    return { kind: "metadata_single", candidates: sortedMetadataMatches };
  }
  if (sortedMetadataMatches.length > 1) {
    return { kind: "metadata_multiple", candidates: sortedMetadataMatches };
  }
  return { kind: "none", candidates: [] };
}

export function buildInventoryMetadataCandidateResult<Row extends SpoolWithMasterRow>(
  spoolRows: Row[],
  observed: ObservedInventoryMatchInput,
  options: InventoryMatchOptions = {},
): InventoryMatchResult<Row> {
  return buildInventoryMatchResult(spoolRows, { ...observed, rfid: null }, options);
}

export function buildBambuUnknownRfidInventoryDecision<Row extends SpoolWithMasterRow>(
  spoolRows: Row[],
  observed: ObservedInventoryMatchInput,
  options: InventoryMatchOptions & { enableMetadataCandidates?: boolean } = {},
): BambuUnknownRfidInventoryDecision<Row> {
  const strictInventoryMatch = buildInventoryMatchResult(spoolRows, observed, {
    preferredSpoolId: options.preferredSpoolId,
  });
  const suggestedInventoryMatch =
    options.enableMetadataCandidates && strictInventoryMatch.kind === "none"
      ? buildInventoryMetadataCandidateResult(spoolRows, observed, {
          includeBambuMetadataCandidates: true,
          onlyBambuMetadataCandidates: true,
          requireMissingRfidTag: true,
          requireObservedMaterialFamily: true,
          preferredSpoolId: options.preferredSpoolId,
        })
      : strictInventoryMatch;

  return {
    strictInventoryMatch,
    suggestedInventoryMatch,
  };
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
    case "Exact RFID/AMS identity match against inventory.":
    case "Exact tray identity match against inventory.":
      return t(
        "settings.bambuLiveMatchNoteExact",
        "Exact RFID/AMS identity match against inventory.",
      );
    case "Multiple inventory rolls share this saved RFID/AMS identity.":
    case "Multiple inventory rolls share this saved tray identity.":
      return t(
        "settings.bambuLiveMatchNoteDuplicateIdentity",
        "Multiple inventory rolls share this saved RFID/AMS identity.",
      );
    case "Showing last known good RFID/AMS identity until a stronger update arrives.":
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
    case "AMS reported an RFID/AMS identity that is not registered in inventory.":
    case "AMS reported a tray identity that is not registered in inventory.":
      return t(
        "settings.bambuLiveMatchNoteUnknownIdentity",
        "AMS reported an RFID/AMS identity that is not registered in inventory.",
      );
    case "Last known RFID/AMS identity does not map cleanly to the currently configured spool.":
    case "Last known tray identity does not map cleanly to the currently configured spool.":
      return t(
        "settings.bambuLiveMatchNoteConfiguredMismatch",
        "Last known RFID/AMS identity does not map cleanly to the currently configured spool.",
      );
    case "No clear stored spool matches this last known RFID/AMS identity.":
    case "No clear stored spool matches this last known tray identity.":
      return t(
        "settings.bambuLiveMatchNoteNoStoredMatch",
        "No clear stored spool matches this last known RFID/AMS identity.",
      );
    case "One likely stored spool matches this last known RFID/AMS identity.":
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
