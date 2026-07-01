import type { BuiltFilamentQrPayload } from "../lib/filament_qr_payload";
import type {
  InventoryOverviewPrintLabels,
  InventoryOverviewPrintRow,
} from "../lib/inventory_overview_print";
import { isBorrowedInOwnership, isSpoolStatusEmpty } from "../lib/inventory_domain";
import type { SpoolWithMasterRow } from "../lib/tauri_client";

export type SettingsInventoryPrintLabels = {
  borrowedIn: string;
  unknown: string;
};

export type SettingsInventoryOverviewPrintPdfLabels = InventoryOverviewPrintLabels;

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
  rows: SpoolWithMasterRow[];
  locale: string;
  companionShellUrl: string | null;
  labels: SettingsInventoryPrintLabels;
  buildFilamentQrPayload: SettingsInventoryPrintQrBuilder;
  buildFilamentLabelQrDataUrl: (payload: string) => Promise<string>;
}): Promise<InventoryOverviewPrintRow[]> {
  const inStockRows = input.rows
    .filter((row) => !isSpoolStatusEmpty(row.spool.status))
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
): string {
  return labels.inventoryOverviewPrintDone;
}

export function buildSettingsInventoryOverviewPrintErrorMessage(
  labels: SettingsInventoryPrintMessageLabels,
): string {
  return labels.inventoryOverviewPrintFailed;
}

export function buildSettingsInventoryOverviewPrintPdfLabels(
  labels: SettingsInventoryOverviewPrintPdfLabels,
): SettingsInventoryOverviewPrintPdfLabels {
  return labels;
}

function compareSettingsInventoryPrintRows(
  left: SpoolWithMasterRow,
  right: SpoolWithMasterRow,
  locale: string,
): number {
  const materialOrder = left.master.material.localeCompare(right.master.material, locale);
  if (materialOrder !== 0) {
    return materialOrder;
  }
  const filamentOrder = left.master.filament_name.localeCompare(
    right.master.filament_name,
    locale,
  );
  if (filamentOrder !== 0) {
    return filamentOrder;
  }
  return left.master.color_name.localeCompare(right.master.color_name, locale);
}
