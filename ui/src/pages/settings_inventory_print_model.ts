import type { BuiltFilamentQrPayload } from "../lib/filament_qr_payload";
import type { InventoryOverviewPrintRow } from "../lib/inventory_overview_print";
import { isBorrowedInOwnership, isSpoolStatusOnHand } from "../lib/inventory_domain";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { createLocaleCollator } from "../../../src-tauri/companion_browser/locale_format.js";

export type SettingsInventoryPrintLabels = {
  borrowedIn: string;
  unknown: string;
};

export type SettingsInventoryPrintMessageLabels = {
  inventoryOverviewPrintFailed: string;
  inventoryOverviewPrintDone: string;
};

export type SettingsInventoryPrintQrBuilder = (
  reference: string,
  options: {
    companionShellUrl: string | null;
  },
) => BuiltFilamentQrPayload;

export async function buildSettingsInventoryOverviewPrintRows(input: {
  rows: NormalizedSpoolWithMasterRow[];
  locale: string;
  companionShellUrl: string | null;
  labels: SettingsInventoryPrintLabels;
  buildFilamentQrPayload: SettingsInventoryPrintQrBuilder;
  buildFilamentLabelQrDataUrl: (payload: string) => Promise<string>;
}): Promise<InventoryOverviewPrintRow[]> {
  const inStockRows = input.rows
    .filter((row) => isSpoolStatusOnHand(row.spool.normalized_status))
    .sort((left, right) => compareSettingsInventoryPrintRows(left, right, input.locale));

  return Promise.all(
    inStockRows.map(async (row) => {
      const qrReference = row.spool.id.trim();
      const qrPayload = input.buildFilamentQrPayload(qrReference, {
        companionShellUrl: input.companionShellUrl,
      }).payload;
      const qrDataUrl = await input.buildFilamentLabelQrDataUrl(qrPayload);

      return {
        reference: row.spool.id || input.labels.unknown,
        vendor: row.master.vendor || input.labels.unknown,
        ownershipMarker: isBorrowedInOwnership(row.spool.ownership_type)
          ? input.labels.borrowedIn
          : null,
        material: row.master.material || input.labels.unknown,
        filamentName: row.master.filament_name || input.labels.unknown,
        colorName: row.master.color_name || input.labels.unknown,
        homeLocation: row.spool.home_location_id ?? null,
        swatchHex: row.master.hex_color ?? "#CBD5E1",
        qrDataUrl,
      };
    }),
  );
}

export function buildSettingsInventoryPrintLabels(
  labels: SettingsInventoryPrintLabels,
): SettingsInventoryPrintLabels {
  return labels;
}

export function buildSettingsInventoryOverviewPrintSuccessMessage(
  labels: SettingsInventoryPrintMessageLabels,
  exportedPath: string,
): string {
  return formatMessage(labels.inventoryOverviewPrintDone, { path: exportedPath });
}

export function buildSettingsInventoryOverviewPrintErrorMessage(
  labels: SettingsInventoryPrintMessageLabels,
): string {
  return labels.inventoryOverviewPrintFailed;
}

function compareSettingsInventoryPrintRows(
  left: NormalizedSpoolWithMasterRow,
  right: NormalizedSpoolWithMasterRow,
  locale: string,
): number {
  const collator = createLocaleCollator(locale, { numeric: true, sensitivity: "base" });
  const materialOrder = collator.compare(left.master.material, right.master.material);
  if (materialOrder !== 0) {
    return materialOrder;
  }
  const filamentOrder = collator.compare(
    left.master.filament_name,
    right.master.filament_name,
  );
  if (filamentOrder !== 0) {
    return filamentOrder;
  }
  return collator.compare(left.master.color_name, right.master.color_name);
}
