import { t } from "./companion_i18n.js";
import { formatGrams } from "./formatters.js";

export function parseCompanionMeasuredWeight(raw) {
  const text = String(raw ?? "").trim();
  const value = /^\d+$/.test(text) ? Number(text) : NaN;
  return Number.isSafeInteger(value) && value >= 0 ? value : NaN;
}

export function defaultSpoolTareWeightForVendor(vendor) {
  const normalized = String(vendor || "").trim().toLowerCase();
  if (normalized.includes("bambu")) {
    return 250;
  }
  if (normalized.includes("esun")) {
    return 224;
  }
  return 0;
}

export function resolveSpoolTareWeight(spoolLike, vendor) {
  const explicit = spoolLike?.spool_tare_weight_g;
  if (Number.isFinite(explicit)) {
    return Math.max(0, Math.round(explicit));
  }
  return defaultSpoolTareWeightForVendor(vendor);
}

export function resolveSpoolRowTareWeight(row) {
  return resolveSpoolTareWeight(row?.spool, row?.master?.vendor);
}

// Read the live form value, including drafts restored after an unrelated render.
// Updating only the calculation preserves keyboard focus and the other fields.
export function updateCompanionWeightPreviews(root, locale = "en") {
  for (const preview of root?.querySelectorAll?.("[data-weight-preview]") || []) {
    const form = preview.closest("form");
    const outgoing = preview.dataset.weightPreview === "outgoing";
    const measurement = preview.dataset.weightPreview === "measurement";
    const input = form?.elements?.namedItem(preview.dataset.weightInput || (measurement ? "grams" : outgoing ? "grams-out" : "returned-grams"));
    const value = String(input?.value ?? "").trim();
    const total = parseCompanionMeasuredWeight(value);
    const tare = Number(preview.dataset.tareWeight);
    const result = preview.querySelector(".metric-value");
    const used = preview.querySelector("[data-estimated-used]");
    if (!result) continue;
    if (!value || !Number.isInteger(total) || total < 0) {
      result.textContent = t(locale, "status.weightInvalid", "Enter a valid non-negative weight in grams.");
      if (used) used.textContent = "";
      continue;
    }
    const remaining = Math.max(0, Math.round(total - tare));
    if (measurement) {
      result.textContent = `${formatGrams(total, locale)} − ${formatGrams(tare, locale)} = ${formatGrams(remaining, locale)}`;
      continue;
    }
    const key = outgoing ? "loans.outgoingWeightCalculation"
      : preview.dataset.weightPreview === "inbound" ? "loans.handBackWeightCalculation"
        : "loans.returnWeightCalculation";
    const fallback = outgoing ? "{total} total − {tare} spool tare = {filament} filament lent out"
      : preview.dataset.weightPreview === "inbound" ? "{total} total − {tare} spool tare = {returned} handed-back filament"
        : "{total} total − {tare} spool tare = {returned} returned filament";
    result.textContent = t(locale, key, fallback, {
      total: formatGrams(total, locale), tare: formatGrams(tare, locale),
      filament: formatGrams(remaining, locale), returned: formatGrams(remaining, locale),
    });
    if (used) used.textContent = t(locale, "loans.estimatedUsedCalculation", "Estimated used: {used}", {
      used: formatGrams(Math.max(0, Number(preview.dataset.loanedWeight) - remaining), locale),
    });
  }
}
