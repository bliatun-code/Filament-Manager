import type { BuiltFilamentQrPayload } from "./filament_qr_payload";
import { isBorrowedInOwnership, isSpoolStatusOnHand } from "./inventory_domain";
import type { InventorySpool } from "./inventory_list_model";
import type { InventoryOverviewPrintRow } from "./inventory_overview_print";
import { createLocaleCollator } from "../../../src-tauri/companion_browser/locale_format.js";

type InventoryLabelSheetLabels = {
  borrowedIn: string;
  unknown: string;
};

export async function buildInventoryLabelSheetRows(input: {
  buildFilamentLabelQrDataUrl: (payload: string) => Promise<string>;
  buildFilamentQrPayload: (
    reference: string,
    options: { companionShellUrl: string | null },
  ) => BuiltFilamentQrPayload;
  companionShellUrl: string | null;
  labels: InventoryLabelSheetLabels;
  locale: string;
  spools: InventorySpool[];
}): Promise<InventoryOverviewPrintRow[]> {
  const collator = createLocaleCollator(input.locale, {
    numeric: true,
    sensitivity: "base",
  });
  const onHand = input.spools
    .filter((spool) => isSpoolStatusOnHand(spool.status))
    .sort((left, right) => {
      const material = collator.compare(left.material, right.material);
      if (material !== 0) {
        return material;
      }
      const filament = collator.compare(left.filamentName, right.filamentName);
      if (filament !== 0) {
        return filament;
      }
      return collator.compare(left.colorName, right.colorName);
    });

  return Promise.all(
    onHand.map(async (spool) => {
      const reference = spool.id.trim();
      const qrPayload = input.buildFilamentQrPayload(reference, {
        companionShellUrl: input.companionShellUrl,
      }).payload;
      return {
        reference: spool.id || input.labels.unknown,
        vendor: spool.vendor || input.labels.unknown,
        ownershipMarker: isBorrowedInOwnership(spool.ownershipType)
          ? input.labels.borrowedIn
          : null,
        material: spool.material || input.labels.unknown,
        filamentName: spool.filamentName || input.labels.unknown,
        colorName: spool.colorName || input.labels.unknown,
        homeLocation: spool.homeLocation ?? null,
        swatchHex: spool.hexColor ?? "#CBD5E1",
        qrDataUrl: await input.buildFilamentLabelQrDataUrl(qrPayload),
      };
    }),
  );
}
