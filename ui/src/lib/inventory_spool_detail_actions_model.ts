import {
  isSpoolStatusEmpty,
  normalizeSpoolStatus,
  type SpoolStatus,
} from "./inventory_domain";

export function canRefillSpoolStatus(status: string): boolean {
  return isSpoolStatusEmpty(status);
}

export function nextLostToggleStatus(status: string): SpoolStatus {
  return normalizeSpoolStatus(status) === "LOST" ? "IN_STOCK" : "LOST";
}

export function shouldReactivateSpoolFromMeasuredTotal(
  status: string,
  measuredTotalGrams: number,
  tareWeightGrams: number,
): boolean {
  if (!isSpoolStatusEmpty(status)) {
    return false;
  }
  return Math.max(0, Math.round(measuredTotalGrams) - Math.round(tareWeightGrams)) > 0;
}
