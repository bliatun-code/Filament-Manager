import type { BuiltFilamentQrPayload } from "../lib/filament_qr_payload";
import type { InventoryOverviewPrintRow } from "../lib/inventory_overview_print";
import type { SpoolWithMasterRow } from "../lib/tauri_client";

export type SettingsInventoryPrintLabels = {
  borrowedIn: string;
  unknown: string;
};

export type SettingsInventoryPrintQrBuilder = (
  reference: string,
  options: {
    mode: "companion";
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
    .filter((row) => row.spool.status.trim().toUpperCase() !== "EMPTY")
    .sort((left, right) => compareSettingsInventoryPrintRows(left, right, input.locale));

  return Promise.all(
    inStockRows.map(async (row) => {
      const qrReference = row.spool.id.trim();
      const qrPayload = input.buildFilamentQrPayload(qrReference, {
        mode: "companion",
        companionShellUrl: input.companionShellUrl,
      }).payload;
      const qrDataUrl = await input.buildFilamentLabelQrDataUrl(qrPayload);

      return {
        reference: row.spool.id || input.labels.unknown,
        vendor: row.master.vendor || input.labels.unknown,
        ownershipMarker:
          (row.spool.ownership_type ?? "OWNED").trim().toUpperCase() === "BORROWED_IN"
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
