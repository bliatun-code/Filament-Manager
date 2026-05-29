import { semanticChipClass } from "./chip_styles";
import { hexToRgb, parseSwatchSpec, toSwatchColor } from "./color_utils";
import type { InventorySpool } from "./inventory_list_model";
import type { RfidCaptureSummary } from "./inventory_rfid_capture";

export type RfidCaptureMatchConfidence = "EXACT" | "PARTIAL" | "NONE";

function normalizeMaterialForMatch(raw?: string | null): string {
  return (raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function hexDistance(leftRaw?: string | null, rightRaw?: string | null): number | null {
  const left = hexToRgb(leftRaw);
  const right = hexToRgb(rightRaw);
  if (!left || !right) {
    return null;
  }
  return Math.sqrt(
    (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2,
  );
}

export function assessRfidCaptureMatch(
  spool: InventorySpool | null,
  summary: RfidCaptureSummary | null | undefined,
): RfidCaptureMatchConfidence {
  if (!spool || !summary?.material) {
    return "NONE";
  }
  if (normalizeMaterialForMatch(spool.material) !== normalizeMaterialForMatch(summary.material)) {
    return "NONE";
  }
  const observedHex = summary.colorHex;
  const expectedHex = spool.hexColor;
  if (!(observedHex?.trim()) || !(expectedHex?.trim())) {
    return "NONE";
  }
  if (toSwatchColor(observedHex).toUpperCase() === toSwatchColor(expectedHex).toUpperCase()) {
    return "EXACT";
  }
  const expectedColors = parseSwatchSpec(expectedHex).colors;
  const normalizedObservedHex = toSwatchColor(observedHex).toUpperCase();
  if (expectedColors.some((color) => color.toUpperCase() === normalizedObservedHex)) {
    return "EXACT";
  }
  const distance = Math.min(
    ...expectedColors
      .map((color) => hexDistance(observedHex, color))
      .filter((value): value is number => value != null),
  );
  if (distance != null && distance <= 48) {
    return "PARTIAL";
  }
  return "NONE";
}

export function rfidCaptureMatchMeta(
  confidence: RfidCaptureMatchConfidence,
  t: (key: string, fallback: string) => string,
): { label: string; hint: string; className: string } | null {
  if (confidence === "EXACT") {
    return {
      label: t("inventory.rfidMatchExact", "Sikker"),
      hint: t("inventory.rfidMatchExactHint", "Materiale og HEX-farge stemmer."),
      className: semanticChipClass("success", "px-2 py-0.5 text-[10px]"),
    };
  }
  if (confidence === "PARTIAL") {
    return {
      label: t("inventory.rfidMatchPartial", "Partial"),
      hint: t("inventory.rfidMatchPartialHint", "Materiale stemmer, og fargen er nær katalogfargen."),
      className: semanticChipClass("warning", "px-2 py-0.5 text-[10px]"),
    };
  }
  return null;
}
